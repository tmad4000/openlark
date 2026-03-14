const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ApiResponse<T> {
  data: T;
}

interface ApiErrorBody {
  code: string;
  message: string;
}

// Custom error class that includes HTTP status code
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }

  // Check if this is an authentication error (401)
  isUnauthorized(): boolean {
    return this.status === 401;
  }
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("auth_token", token);
      } else {
        localStorage.removeItem("auth_token");
      }
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("auth_token");
    }
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}/api/v1${endpoint}`;
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const json = await response.json();

    if (!response.ok) {
      const errorBody = json as ApiErrorBody;
      throw new ApiError(
        errorBody.message || "API request failed",
        response.status,
        errorBody.code
      );
    }

    return (json as ApiResponse<T>).data;
  }

  // Auth endpoints
  async register(data: {
    email: string;
    password: string;
    displayName: string;
    orgName: string;
  }) {
    return this.request<{ token: string; user: User; organization: Organization }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  async login(data: { email: string; password: string }) {
    return this.request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async logout() {
    await this.request("/auth/logout", { method: "POST" });
    this.setToken(null);
  }

  async me() {
    return this.request<{ user: User; organization: Organization }>("/auth/me");
  }

  // Search users in the same organization
  async searchUsers(query?: string) {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    const queryString = params.toString();
    return this.request<{ users: UserSearchResult[] }>(
      `/auth/users${queryString ? `?${queryString}` : ""}`
    );
  }

  // Chat endpoints
  async getChats() {
    return this.request<{ chats: Chat[] }>("/messenger/chats");
  }

  async createChat(data: {
    type: "dm" | "group";
    memberIds: string[];
    name?: string;
  }) {
    return this.request<{ chat: Chat; members: ChatMember[] }>("/messenger/chats", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getMessages(chatId: string, params?: { before?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.before) searchParams.set("before", params.before);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    const query = searchParams.toString();
    return this.request<{ messages: Message[] }>(
      `/messenger/chats/${chatId}/messages${query ? `?${query}` : ""}`
    );
  }

  async sendMessage(chatId: string, data: { content: string | Record<string, unknown>; type?: string; threadId?: string; topicId?: string }) {
    return this.request<{ message: Message }>(`/messenger/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getThreadReplies(messageId: string) {
    return this.request<{ parentMessage: Message; replies: Message[] }>(
      `/messenger/messages/${messageId}/thread`
    );
  }

  async getChatMembers(chatId: string) {
    return this.request<{ members: ChatMember[] }>(`/messenger/chats/${chatId}/members`);
  }

  async markChatRead(chatId: string, lastMessageId: string) {
    return this.request<{ success: boolean; readCount: number }>(
      `/messenger/chats/${chatId}/read`,
      {
        method: "POST",
        body: JSON.stringify({ lastMessageId }),
      }
    );
  }

  async getReadStatus(chatId: string, messageIds: string[]) {
    const params = new URLSearchParams({ messageIds: messageIds.join(",") });
    return this.request<{
      statuses: Array<{
        messageId: string;
        readBy: Array<{ userId: string; readAt: string }>;
      }>;
    }>(`/messenger/chats/${chatId}/read-status?${params.toString()}`);
  }

  async getReadReceipts(messageId: string) {
    return this.request<{
      receipts: Array<{ userId: string; readAt: string }>;
    }>(`/messenger/messages/${messageId}/read-receipts`);
  }

  // Reaction endpoints
  async addReaction(messageId: string, emoji: string) {
    return this.request<{ success: boolean }>(
      `/messenger/messages/${messageId}/reactions`,
      {
        method: "POST",
        body: JSON.stringify({ emoji }),
      }
    );
  }

  async removeReaction(messageId: string, emoji: string) {
    return this.request<{ success: boolean }>(
      `/messenger/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: "DELETE" }
    );
  }

  async getReactions(messageId: string) {
    return this.request<{ reactions: MessageReaction[] }>(
      `/messenger/messages/${messageId}/reactions`
    );
  }

  // Pin endpoints
  async getPinnedMessages(chatId: string) {
    return this.request<{ pins: Pin[] }>(`/messenger/chats/${chatId}/pins`);
  }

  async pinMessage(chatId: string, messageId: string) {
    return this.request<{ success: boolean }>(`/messenger/chats/${chatId}/pins`, {
      method: "POST",
      body: JSON.stringify({ messageId }),
    });
  }

  async unpinMessage(chatId: string, messageId: string) {
    return this.request<{ success: boolean }>(
      `/messenger/chats/${chatId}/pins/${messageId}`,
      { method: "DELETE" }
    );
  }

  // Favorite endpoints
  async getUserFavorites() {
    return this.request<{ favorites: Favorite[] }>("/messenger/favorites");
  }

  async favoriteMessage(messageId: string) {
    return this.request<{ success: boolean }>(
      `/messenger/messages/${messageId}/favorite`,
      { method: "POST" }
    );
  }

  async unfavoriteMessage(messageId: string) {
    return this.request<{ success: boolean }>(
      `/messenger/messages/${messageId}/favorite`,
      { method: "DELETE" }
    );
  }

  // Edit/Recall endpoints
  async editMessage(messageId: string, content: string | Record<string, unknown>) {
    return this.request<{ message: Message }>(
      `/messenger/messages/${messageId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ content }),
      }
    );
  }

  async recallMessage(messageId: string) {
    return this.request<{ success: boolean }>(
      `/messenger/messages/${messageId}`,
      { method: "DELETE" }
    );
  }

  async updateChatMemberSettings(
    chatId: string,
    settings: Partial<ChatMemberSettings>
  ) {
    return this.request<{ member: ChatMember }>(
      `/messenger/chat-members/${chatId}/me`,
      {
        method: "PATCH",
        body: JSON.stringify(settings),
      }
    );
  }

  async forwardMessage(messageId: string, chatIds: string[]) {
    return this.request<{ messages: Message[]; count: number }>(
      `/messenger/messages/${messageId}/forward`,
      {
        method: "POST",
        body: JSON.stringify({ chatIds }),
      }
    );
  }

  async getChat(chatId: string) {
    return this.request<{ chat: Chat; members: ChatMember[] }>(
      `/messenger/chats/${chatId}`
    );
  }

  async updateChat(
    chatId: string,
    data: { name?: string; avatarUrl?: string | null; isPublic?: boolean; maxMembers?: number | null; settingsJson?: Record<string, unknown> }
  ) {
    return this.request<{ chat: Chat }>(
      `/messenger/chats/${chatId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  }

  async addChatMember(chatId: string, userId: string, role?: "admin" | "member") {
    return this.request<{ member: ChatMember }>(
      `/messenger/chats/${chatId}/members`,
      {
        method: "POST",
        body: JSON.stringify({ userId, role }),
      }
    );
  }

  async updateChatMember(chatId: string, userId: string, data: { role?: "owner" | "admin" | "member" }) {
    return this.request<{ member: ChatMember }>(
      `/messenger/chats/${chatId}/members/${userId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  }

  async removeChatMember(chatId: string, userId: string) {
    return this.request<{ success: boolean }>(
      `/messenger/chats/${chatId}/members/${userId}`,
      { method: "DELETE" }
    );
  }

  // Announcement endpoints
  async getAnnouncements(chatId: string) {
    return this.request<{ announcements: Announcement[] }>(
      `/messenger/chats/${chatId}/announcements`
    );
  }

  async createAnnouncement(chatId: string, content: string) {
    return this.request<{ announcement: Announcement }>(
      `/messenger/chats/${chatId}/announcements`,
      {
        method: "POST",
        body: JSON.stringify({ content }),
      }
    );
  }

  async updateAnnouncement(
    announcementId: string,
    data: { content?: string; isPinned?: boolean }
  ) {
    return this.request<{ announcement: Announcement }>(
      `/messenger/announcements/${announcementId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  }

  async deleteAnnouncement(announcementId: string) {
    return this.request<{ success: boolean }>(
      `/messenger/announcements/${announcementId}`,
      { method: "DELETE" }
    );
  }

  // Topic endpoints
  async getTopics(chatId: string) {
    return this.request<{ topics: Topic[] }>(
      `/messenger/chats/${chatId}/topics`
    );
  }

  async createTopic(chatId: string, title: string, initialMessage: string) {
    return this.request<{ topic: Topic; message: Message }>(
      `/messenger/chats/${chatId}/topics`,
      {
        method: "POST",
        body: JSON.stringify({ title, initialMessage }),
      }
    );
  }

  async getTopicMessages(topicId: string, params?: { before?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.before) searchParams.set("before", params.before);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    const query = searchParams.toString();
    return this.request<{ messages: Message[] }>(
      `/messenger/topics/${topicId}/messages${query ? `?${query}` : ""}`
    );
  }

  async updateTopic(topicId: string, data: { status?: "open" | "closed" }) {
    return this.request<{ topic: Topic }>(
      `/messenger/topics/${topicId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  }

  async subscribeTopic(topicId: string) {
    return this.request<{ success: boolean }>(
      `/messenger/topics/${topicId}/subscribe`,
      { method: "POST" }
    );
  }

  async unsubscribeTopic(topicId: string) {
    return this.request<{ success: boolean }>(
      `/messenger/topics/${topicId}/subscribe`,
      { method: "DELETE" }
    );
  }

  async getSubscribedTopics() {
    return this.request<{ topics: Topic[] }>(
      `/messenger/topics/subscribed`
    );
  }

  // Calendar endpoints
  async getCalendars() {
    return this.request<{ calendars: Calendar[] }>("/calendar/calendars");
  }

  async createCalendar(data: {
    name: string;
    type?: "personal" | "public" | "shared";
    color?: string;
    description?: string;
  }) {
    return this.request<{ calendar: Calendar }>("/calendar/calendars", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getEvents(params?: {
    calendarId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.calendarId) searchParams.set("calendarId", params.calendarId);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);
    const query = searchParams.toString();
    return this.request<{ events: CalendarEvent[] }>(
      `/calendar/events${query ? `?${query}` : ""}`
    );
  }

  async getEvent(eventId: string) {
    return this.request<{ event: CalendarEvent }>(`/calendar/events/${eventId}`);
  }

  async createEvent(data: {
    calendarId: string;
    title: string;
    startTime: string;
    endTime: string;
    description?: string;
    location?: string;
    timezone?: string;
    attendeeIds?: string[];
    roomId?: string;
    recurrenceRule?: string;
    generateMeetingLink?: boolean;
  }) {
    return this.request<{ event: CalendarEvent; attendees: EventAttendee[] }>(
      "/calendar/events",
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  async updateEvent(
    eventId: string,
    data: {
      title?: string;
      startTime?: string;
      endTime?: string;
      description?: string;
      location?: string;
    }
  ) {
    return this.request<{ event: CalendarEvent }>(`/calendar/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteEvent(eventId: string) {
    return this.request<void>(`/calendar/events/${eventId}`, {
      method: "DELETE",
    });
  }

  async rsvpEvent(eventId: string, response: "yes" | "no" | "maybe") {
    return this.request<{ attendee: EventAttendee }>(
      `/calendar/events/${eventId}/rsvp`,
      {
        method: "POST",
        body: JSON.stringify({ response }),
      }
    );
  }

  async getEventAttendees(eventId: string) {
    return this.request<{ attendees: EventAttendee[] }>(
      `/calendar/events/${eventId}/attendees`
    );
  }

  async getMeetingRooms(params?: { minCapacity?: number; floor?: string }) {
    const searchParams = new URLSearchParams();
    if (params?.minCapacity)
      searchParams.set("minCapacity", params.minCapacity.toString());
    if (params?.floor) searchParams.set("floor", params.floor);
    const query = searchParams.toString();
    return this.request<{ rooms: MeetingRoom[] }>(
      `/calendar/rooms${query ? `?${query}` : ""}`
    );
  }

  async getRoomsWithAvailability(startTime: string, endTime: string) {
    const searchParams = new URLSearchParams();
    searchParams.set("start", startTime);
    searchParams.set("end", endTime);
    return this.request<{ rooms: MeetingRoomWithAvailability[] }>(
      `/calendar/rooms/availability?${searchParams.toString()}`
    );
  }

  // Docs endpoints
  async getDocuments(params?: {
    type?: "doc" | "sheet" | "slide" | "mindnote" | "board";
    cursor?: string;
    limit?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set("type", params.type);
    if (params?.cursor) searchParams.set("cursor", params.cursor);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    const query = searchParams.toString();
    return this.request<{ documents: Document[] }>(
      `/docs/documents${query ? `?${query}` : ""}`
    );
  }

  async getDocument(documentId: string) {
    return this.request<{ document: Document }>(`/docs/documents/${documentId}`);
  }

  async createDocument(data: {
    title: string;
    type: "doc" | "sheet" | "slide" | "mindnote" | "board";
    templateId?: string;
  }) {
    return this.request<{ document: Document }>("/docs/documents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateDocument(documentId: string, data: { title?: string }) {
    return this.request<{ document: Document }>(`/docs/documents/${documentId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteDocument(documentId: string) {
    return this.request<void>(`/docs/documents/${documentId}`, {
      method: "DELETE",
    });
  }

  // Document permissions
  async getDocumentPermissions(documentId: string) {
    return this.request<{ permissions: DocumentPermission[] }>(
      `/docs/documents/${documentId}/permissions`
    );
  }

  async addDocumentPermission(
    documentId: string,
    data: {
      principalId: string;
      principalType: "user" | "department" | "org";
      role: "viewer" | "editor" | "manager" | "owner";
    }
  ) {
    return this.request<{ permission: DocumentPermission }>(
      `/docs/documents/${documentId}/permissions`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  async updateDocumentPermission(
    permissionId: string,
    data: { role: "viewer" | "editor" | "manager" }
  ) {
    return this.request<{ permission: DocumentPermission }>(
      `/docs/permissions/${permissionId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  }

  async removeDocumentPermission(permissionId: string) {
    return this.request<void>(`/docs/permissions/${permissionId}`, {
      method: "DELETE",
    });
  }

  // Document versions
  async getDocumentVersions(documentId: string) {
    return this.request<{ versions: DocumentVersion[] }>(
      `/docs/documents/${documentId}/versions`
    );
  }

  async createDocumentVersion(documentId: string, data: { name: string }) {
    return this.request<{ version: DocumentVersion }>(
      `/docs/documents/${documentId}/versions`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  async restoreDocumentVersion(documentId: string, versionId: string) {
    return this.request<void>(
      `/docs/documents/${documentId}/versions/${versionId}/restore`,
      { method: "POST" }
    );
  }

  // Document comments
  async getDocumentComments(documentId: string) {
    return this.request<{ comments: DocumentComment[] }>(
      `/docs/documents/${documentId}/comments`
    );
  }

  async createDocumentComment(
    documentId: string,
    data: {
      content: string;
      blockId?: string;
      anchorJson?: { from: number; to: number; text: string };
      threadId?: string;
    }
  ) {
    return this.request<{ comment: DocumentComment }>(
      `/docs/documents/${documentId}/comments`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  async resolveComment(commentId: string) {
    return this.request<{ comment: DocumentComment }>(
      `/docs/comments/${commentId}/resolve`,
      { method: "POST" }
    );
  }

  async unresolveComment(commentId: string) {
    return this.request<{ comment: DocumentComment }>(
      `/docs/comments/${commentId}/unresolve`,
      { method: "POST" }
    );
  }

  async deleteComment(commentId: string) {
    return this.request<void>(`/docs/comments/${commentId}`, {
      method: "DELETE",
    });
  }

  // Notification endpoints
  async getNotifications(params?: { limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return this.request<{ notifications: AppNotification[]; unreadCount: number }>(
      `/notifications${query ? `?${query}` : ""}`
    );
  }

  async getUnreadNotificationCount() {
    return this.request<{ unreadCount: number }>("/notifications/unread-count");
  }

  async markNotificationRead(notificationId: string) {
    return this.request<{ notification: AppNotification }>(
      `/notifications/${notificationId}/read`,
      { method: "PATCH" }
    );
  }

  async markAllNotificationsRead() {
    return this.request<{ success: boolean; count: number }>(
      "/notifications/read-all",
      { method: "POST" }
    );
  }

  // Buzz endpoints
  async buzzMessage(messageId: string, recipientId: string, type: "in_app" | "sms" | "phone" = "in_app") {
    return this.request<{ buzz: BuzzNotification }>(
      `/messages/${messageId}/buzz`,
      {
        method: "POST",
        body: JSON.stringify({ recipient_id: recipientId, type }),
      }
    );
  }

  // Wiki endpoints
  async getWikiSpaces() {
    return this.request<{ spaces: WikiSpace[] }>("/wiki/spaces");
  }

  async createWikiSpace(data: {
    name: string;
    description?: string;
    icon?: string;
    type?: "private" | "public";
  }) {
    return this.request<{ space: WikiSpace }>("/wiki/spaces", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getWikiSpace(spaceId: string) {
    return this.request<{ space: WikiSpace }>(`/wiki/spaces/${spaceId}`);
  }

  async getWikiPages(spaceId: string) {
    return this.request<{ pages: WikiPage[] }>(`/wiki/spaces/${spaceId}/pages`);
  }

  async createWikiPage(
    spaceId: string,
    data: { title: string; parentPageId?: string | null; position?: number }
  ) {
    return this.request<{ page: WikiPage }>(`/wiki/spaces/${spaceId}/pages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateWikiPage(
    pageId: string,
    data: { parentPageId?: string | null; position?: number }
  ) {
    return this.request<{ page: WikiPage }>(`/wiki/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteWikiPage(pageId: string) {
    return this.request<void>(`/wiki/pages/${pageId}`, {
      method: "DELETE",
    });
  }

  // Base endpoints
  async getBases() {
    return this.request<{ bases: BaseInfo[] }>("/base/bases");
  }

  async getBase(baseId: string) {
    return this.request<{ base: BaseInfo }>(`/base/bases/${baseId}`);
  }

  async createBase(data: { name: string; icon?: string }) {
    return this.request<{ base: BaseInfo }>("/base/bases", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getBaseTables(baseId: string) {
    return this.request<{ tables: BaseTableInfo[] }>(`/base/bases/${baseId}/tables`);
  }

  async createBaseTable(baseId: string, data: { name: string }) {
    return this.request<{ table: BaseTableInfo }>(`/base/bases/${baseId}/tables`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getTableFields(tableId: string) {
    return this.request<{ fields: BaseField[] }>(`/base/tables/${tableId}/fields`);
  }

  async createField(tableId: string, data: { name: string; type: string; config?: Record<string, unknown> }) {
    return this.request<{ field: BaseField }>(`/base/tables/${tableId}/fields`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateField(fieldId: string, data: { name?: string; type?: string; config?: Record<string, unknown> }) {
    return this.request<{ field: BaseField }>(`/base/fields/${fieldId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getTableRecords(tableId: string, params?: { page?: number; limit?: number; sort?: string; order?: "asc" | "desc" }) {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.sort) searchParams.set("sort", params.sort);
    if (params?.order) searchParams.set("order", params.order);
    const query = searchParams.toString();
    return this.request<{ records: BaseRecord[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(
      `/base/tables/${tableId}/records${query ? `?${query}` : ""}`
    );
  }

  async createRecord(tableId: string, data: Record<string, unknown>) {
    return this.request<{ record: BaseRecord }>(`/base/tables/${tableId}/records`, {
      method: "POST",
      body: JSON.stringify({ data }),
    });
  }

  async updateRecord(recordId: string, data: Record<string, unknown>) {
    return this.request<{ record: BaseRecord }>(`/base/records/${recordId}`, {
      method: "PATCH",
      body: JSON.stringify({ data }),
    });
  }

  // View endpoints
  async getTableViews(tableId: string) {
    return this.request<{ views: BaseViewInfo[] }>(`/base/tables/${tableId}/views`);
  }

  async createView(tableId: string, data: { name: string; type: string; config?: Record<string, unknown> }) {
    return this.request<{ view: BaseViewInfo }>(`/base/tables/${tableId}/views`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateView(viewId: string, data: { name?: string; config?: Record<string, unknown> }) {
    return this.request<{ view: BaseViewInfo }>(`/base/views/${viewId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteRecord(recordId: string) {
    return this.request<void>(`/base/records/${recordId}`, {
      method: "DELETE",
    });
  }

  // Automation endpoints
  async getAutomations(baseId: string) {
    return this.request<{ automations: BaseAutomation[] }>(
      `/base/bases/${baseId}/automations`
    );
  }

  async createAutomation(
    baseId: string,
    data: {
      name: string;
      trigger: AutomationTrigger;
      actions: AutomationAction[];
      type?: "automation" | "workflow";
      enabled?: boolean;
    }
  ) {
    return this.request<{ automation: BaseAutomation }>(
      `/base/bases/${baseId}/automations`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  async updateAutomation(
    automationId: string,
    data: {
      name?: string;
      trigger?: AutomationTrigger;
      actions?: AutomationAction[];
      enabled?: boolean;
    }
  ) {
    return this.request<{ automation: BaseAutomation }>(
      `/base/automations/${automationId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  }

  async deleteAutomation(automationId: string) {
    return this.request<void>(`/base/automations/${automationId}`, {
      method: "DELETE",
    });
  }

  async getAutomationRuns(automationId: string) {
    return this.request<{ runs: AutomationRun[] }>(
      `/base/automations/${automationId}/runs`
    );
  }

  // Dashboard endpoints
  async getDashboards(baseId: string) {
    return this.request<{ dashboards: BaseDashboard[] }>(
      `/base/bases/${baseId}/dashboards`
    );
  }

  async createDashboard(baseId: string, data: { name: string; layout?: DashboardChartBlock[] }) {
    return this.request<{ dashboard: BaseDashboard }>(
      `/base/bases/${baseId}/dashboards`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  async updateDashboard(dashboardId: string, data: { name?: string; layout?: DashboardChartBlock[] }) {
    return this.request<{ dashboard: BaseDashboard }>(
      `/base/dashboards/${dashboardId}`,
      {
        method: "PATCH",
        body: JSON.stringify(data),
      }
    );
  }

  async deleteDashboard(dashboardId: string) {
    return this.request<void>(`/base/dashboards/${dashboardId}`, {
      method: "DELETE",
    });
  }

  // Task endpoints
  async getTasks(params?: {
    status?: "todo" | "in_progress" | "done";
    assignee?: string;
    dueBefore?: string;
    dueAfter?: string;
    listId?: string;
    parentTaskId?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.assignee) searchParams.set("assignee", params.assignee);
    if (params?.dueBefore) searchParams.set("dueBefore", params.dueBefore);
    if (params?.dueAfter) searchParams.set("dueAfter", params.dueAfter);
    if (params?.listId) searchParams.set("listId", params.listId);
    if (params?.parentTaskId) searchParams.set("parentTaskId", params.parentTaskId);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.offset) searchParams.set("offset", params.offset.toString());
    const query = searchParams.toString();
    return this.request<{ tasks: Task[] }>(
      `/tasks${query ? `?${query}` : ""}`
    );
  }

  async getTask(taskId: string) {
    return this.request<{ task: Task }>(`/tasks/${taskId}`);
  }

  async createTask(data: {
    title: string;
    description?: string;
    status?: "todo" | "in_progress" | "done";
    priority?: "none" | "low" | "medium" | "high" | "urgent";
    assigneeIds?: string[];
    dueDate?: string;
    startDate?: string;
    parentTaskId?: string;
    taskListId?: string;
  }) {
    return this.request<{ task: Task }>("/tasks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTask(
    taskId: string,
    data: {
      title?: string;
      description?: string;
      status?: "todo" | "in_progress" | "done";
      priority?: "none" | "low" | "medium" | "high" | "urgent";
      assigneeIds?: string[];
      dueDate?: string | null;
      startDate?: string | null;
      parentTaskId?: string | null;
    }
  ) {
    return this.request<{ task: Task }>(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteTask(taskId: string) {
    return this.request<void>(`/tasks/${taskId}`, {
      method: "DELETE",
    });
  }

  async getTaskComments(taskId: string) {
    return this.request<{ comments: TaskComment[] }>(`/tasks/${taskId}/comments`);
  }

  async addTaskComment(taskId: string, content: string) {
    return this.request<{ comment: TaskComment }>(`/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  }

  async getSubtasks(parentTaskId: string) {
    return this.request<{ tasks: Task[] }>(
      `/tasks?parentTaskId=${parentTaskId}`
    );
  }

  async getTaskDependencies(taskId: string) {
    return this.request<{ dependencies: TaskDependency[] }>(
      `/tasks/${taskId}/dependencies`
    );
  }

  async addTaskDependency(
    taskId: string,
    dependsOnTaskId: string,
    type: "fs" | "ss" | "ff" | "sf" = "fs"
  ) {
    return this.request<{ dependency: TaskDependency }>(
      `/tasks/${taskId}/dependencies`,
      {
        method: "POST",
        body: JSON.stringify({ dependsOnTaskId, type }),
      }
    );
  }

  async createTaskFromMessage(data: {
    messageId: string;
    title?: string;
    assigneeIds?: string[];
    dueDate?: string;
    taskListId?: string;
  }) {
    return this.request<{ task: Task }>("/tasks/from-message", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Approval endpoints
  async getApprovalTemplates() {
    return this.request<{ templates: ApprovalTemplate[] }>("/approvals/templates");
  }

  async createApprovalTemplate(data: {
    name: string;
    formSchema?: Record<string, unknown>;
    workflow?: Array<{ approverIds: string[]; type: "sequential" | "parallel" }>;
    category?: string;
  }) {
    return this.request<{ template: ApprovalTemplate }>("/approvals/templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getApprovalRequests(query?: {
    status?: "pending" | "approved" | "rejected" | "cancelled";
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    if (query?.limit) params.set("limit", String(query.limit));
    if (query?.offset) params.set("offset", String(query.offset));
    const qs = params.toString();
    return this.request<{ requests: ApprovalRequest[] }>(
      `/approvals/requests${qs ? `?${qs}` : ""}`
    );
  }

  async getApprovalRequest(requestId: string) {
    return this.request<{ request: ApprovalRequest }>(`/approvals/requests/${requestId}`);
  }

  async createApprovalRequest(data: {
    templateId: string;
    formData?: Record<string, unknown>;
  }) {
    return this.request<{ request: ApprovalRequest }>("/approvals/requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async decideApprovalStep(
    requestId: string,
    stepId: string,
    data: { decision: "approve" | "reject"; comment?: string }
  ) {
    return this.request<{ step: ApprovalStep }>(
      `/approvals/requests/${requestId}/steps/${stepId}/decide`,
      {
        method: "POST",
        body: JSON.stringify(data),
      }
    );
  }

  // OKR endpoints
  async getOkrCycles(params?: { status?: string; limit?: number; offset?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const qs = searchParams.toString();
    return this.request<{ cycles: OkrCycle[] }>(`/okrs/cycles${qs ? `?${qs}` : ""}`);
  }

  async createOkrCycle(data: { name: string; startDate: string; endDate: string; status?: string }) {
    return this.request<{ cycle: OkrCycle }>("/okrs/cycles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getOkrObjectives(params?: { cycleId?: string; ownerId?: string; status?: string; limit?: number }) {
    const searchParams = new URLSearchParams();
    if (params?.cycleId) searchParams.set("cycleId", params.cycleId);
    if (params?.ownerId) searchParams.set("ownerId", params.ownerId);
    if (params?.status) searchParams.set("status", params.status);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return this.request<{ objectives: OkrObjective[] }>(`/okrs/objectives${qs ? `?${qs}` : ""}`);
  }

  async getOkrObjective(objectiveId: string) {
    return this.request<{ objective: OkrObjective }>(`/okrs/objectives/${objectiveId}`);
  }

  async createOkrObjective(data: {
    cycleId: string;
    title: string;
    description?: string;
    parentObjectiveId?: string;
    visibility?: "everyone" | "leaders" | "team";
    status?: "draft" | "active" | "completed";
  }) {
    return this.request<{ objective: OkrObjective }>("/okrs/objectives", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createOkrKeyResult(data: {
    objectiveId: string;
    title: string;
    targetValue: number;
    currentValue?: number;
    weight?: number;
    unit?: string;
  }) {
    return this.request<{ keyResult: OkrKeyResult }>("/okrs/key-results", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateOkrKeyResult(keyResultId: string, data: {
    title?: string;
    targetValue?: number;
    currentValue?: number;
    weight?: number;
    unit?: string;
  }) {
    return this.request<{ keyResult: OkrKeyResult }>(`/okrs/key-results/${keyResultId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getOkrKeyResults(objectiveId: string) {
    return this.request<{ keyResults: OkrKeyResult[] }>(`/okrs/objectives/${objectiveId}/key-results`);
  }

  async createOkrCheckin(data: { keyResultId: string; value: number; notes?: string }) {
    return this.request<{ checkin: OkrCheckin }>("/okrs/checkins", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getOkrCheckins(keyResultId: string) {
    return this.request<{ checkins: OkrCheckin[] }>(`/okrs/key-results/${keyResultId}/checkins`);
  }

  async createOkrAlignment(data: { objectiveId: string; alignedToObjectiveId: string }) {
    return this.request<{ alignment: OkrAlignment }>("/okrs/alignments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Attendance
  async clockInOut(data: {
    type: "clock_in" | "clock_out";
    method: "gps" | "wifi" | "manual";
    location?: { latitude: number; longitude: number };
    notes?: string;
  }) {
    return this.request<{ record: ClockRecord }>("/attendance/clock", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getMyAttendanceRecords(month: string) {
    return this.request<{ records: ClockRecord[] }>(`/attendance/my-records?month=${month}`);
  }

  async getAttendanceStats(month: string) {
    return this.request<{ stats: AttendanceStats }>(`/attendance/stats?month=${month}`);
  }
}

// Types
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  orgId: string;
}

export interface UserSearchResult {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Organization {
  id: string;
  name: string;
  domain: string | null;
  logoUrl: string | null;
}

export interface ChatMemberSettings {
  muted: boolean;
  done: boolean;
  pinned: boolean;
  label: string | null;
}

export interface ChatSettings {
  whoCanSendMessages?: "all" | "admins_only";
  whoCanAddMembers?: "all" | "admins_only";
  historyVisibleToNewMembers?: boolean;
}

export interface Chat {
  id: string;
  orgId: string;
  type: "dm" | "group" | "topic_group" | "supergroup" | "meeting";
  name: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  memberSettings?: ChatMemberSettings;
  settingsJson?: ChatSettings;
}

export interface ChatMember {
  id: string;
  chatId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  user?: {
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface ForwardedInfo {
  originalMessageId: string;
  originalSenderId: string;
  originalSenderName: string;
  originalChatId: string;
  originalChatName: string;
  originalCreatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  contentJson: {
    text?: string;
    html?: string;
    mentions?: Array<{ id: string; label: string }>;
    forwarded?: ForwardedInfo;
    // Approval card fields
    cardType?: "approval";
    requestId?: string;
    stepId?: string;
    templateName?: string;
    requesterName?: string;
    formFields?: Array<{ label: string; value: string }>;
    status?: "pending" | "approved" | "rejected";
    decidedBy?: string;
    [key: string]: unknown;
  };
  threadId: string | null;
  topicId: string | null;
  replyToId: string | null;
  replyCount?: number;
  createdAt: string;
  editedAt: string | null;
  recalledAt: string | null;
}

export interface MessageReaction {
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface Pin {
  id: string;
  chatId: string;
  messageId: string;
  pinnedBy: string;
  pinnedAt: string;
  message?: Message;
}

export interface Favorite {
  id: string;
  userId: string;
  messageId: string;
  createdAt: string;
  message?: Message;
}

export interface Announcement {
  id: string;
  chatId: string;
  content: string;
  authorId: string;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

// Calendar types
export interface Calendar {
  id: string;
  orgId: string;
  ownerId: string;
  type: "personal" | "public" | "all_staff" | "shared";
  name: string;
  color: string | null;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string | null;
  recurrenceRule: string | null;
  roomId: string | null;
  meetingLink: string | null;
  creatorId: string;
  isCancelled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EventAttendee {
  id: string;
  eventId: string;
  userId: string;
  rsvp: "pending" | "yes" | "no" | "maybe";
  isRequired: boolean;
  isOrganizer: boolean;
  respondedAt: string | null;
  user?: {
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface MeetingRoom {
  id: string;
  orgId: string;
  name: string;
  capacity: number;
  equipment: string[] | null;
  location: string | null;
  floor: string | null;
}

export interface MeetingRoomWithAvailability extends MeetingRoom {
  available: boolean;
}

// Document types
export interface Document {
  id: string;
  orgId: string;
  title: string;
  type: "doc" | "sheet" | "slide" | "mindnote" | "board";
  ownerId: string;
  templateId: string | null;
  lastEditedBy: string | null;
  lastEditedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentPermission {
  id: string;
  documentId: string;
  principalId: string;
  principalType: "user" | "department" | "org";
  role: "viewer" | "editor" | "manager" | "owner";
  createdBy: string;
  createdAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface DocumentComment {
  id: string;
  documentId: string;
  userId: string;
  content: string;
  blockId: string | null;
  anchorJson: { from: number; to: number; text: string } | null;
  threadId: string | null;
  resolved: string | null;
  createdAt: string;
  updatedAt: string;
}

// Notification types
export interface AppNotification {
  id: string;
  userId: string;
  type: "dm_received" | "mentioned" | "thread_reply" | "task_assigned" | "approval_pending";
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

// Topic types
export interface Topic {
  id: string;
  chatId: string;
  title: string;
  creatorId: string;
  status: "open" | "closed";
  createdAt: string;
  messageCount: number;
  subscribed?: boolean;
}

// Buzz types
export interface BuzzNotification {
  id: string;
  messageId: string;
  senderId: string;
  recipientId: string;
  type: "in_app" | "sms" | "phone";
  status: "pending" | "delivered" | "read";
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

// Wiki types
export interface WikiSpace {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  icon: string | null;
  type: "private" | "public";
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WikiPage {
  id: string;
  spaceId: string;
  documentId: string;
  parentPageId: string | null;
  position: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  document: {
    id: string;
    title: string;
  };
}

// Base types
export interface BaseInfo {
  id: string;
  orgId: string;
  name: string;
  icon: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BaseTableInfo {
  id: string;
  baseId: string;
  name: string;
  position: number;
  createdAt: string;
}

export interface BaseField {
  id: string;
  tableId: string;
  name: string;
  type: string;
  config: unknown;
  position: number;
  createdAt: string;
}

export interface BaseRecord {
  id: string;
  tableId: string;
  data: unknown;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface BaseViewInfo {
  id: string;
  tableId: string;
  type: "grid" | "kanban" | "calendar" | "gantt" | "gallery" | "form";
  name: string;
  config: unknown;
  position: number;
  createdAt: string;
}

// Automation types
export type TriggerType =
  | "record_created"
  | "record_updated"
  | "record_matches_condition"
  | "scheduled"
  | "button_clicked"
  | "webhook_received";

export type ActionType =
  | "update_record"
  | "create_record"
  | "send_message"
  | "http_request";

export interface AutomationTrigger {
  type: TriggerType;
  tableId?: string;
  condition?: Record<string, unknown>;
  schedule?: string;
  webhookId?: string;
}

export interface AutomationAction {
  type: ActionType;
  config: Record<string, unknown>;
}

export interface BaseAutomation {
  id: string;
  baseId: string;
  name: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
  type: "automation" | "workflow";
  createdAt: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  triggerEvent: Record<string, unknown>;
  status: "success" | "failed";
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// Dashboard types
export interface DashboardChartBlock {
  id: string;
  type: "bar" | "column" | "line" | "pie" | "metric";
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config: {
    tableId: string;
    xAxisFieldId?: string;
    yAxisAggregation: "count" | "sum" | "avg" | "min" | "max";
    yAxisFieldId?: string;
    groupByFieldId?: string;
  };
}

export interface BaseDashboard {
  id: string;
  baseId: string;
  name: string;
  layout: DashboardChartBlock[];
  createdAt: string;
}

// Task types
export interface Task {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assigneeIds: string[];
  creatorId: string;
  dueDate: string | null;
  startDate: string | null;
  parentTaskId: string | null;
  customFields: Record<string, unknown> | null;
  recurrenceRule: string | null;
  sourceMessageId: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependency {
  taskId: string;
  dependsOnTaskId: string;
  type: "fs" | "ss" | "ff" | "sf";
}

// Approval types
export interface ApprovalTemplate {
  id: string;
  orgId: string;
  name: string;
  formSchema: Record<string, unknown>;
  workflow: Array<{ approverIds: string[]; type: "sequential" | "parallel" }>;
  category: string | null;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  templateId: string;
  requesterId: string;
  orgId: string;
  formData: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "cancelled";
  createdAt: string;
  template?: ApprovalTemplate;
  steps?: ApprovalStep[];
}

export interface ApprovalStep {
  id: string;
  requestId: string;
  stepIndex: number;
  approverIds: string[];
  type: "sequential" | "parallel";
  status: "pending" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: string | null;
  comment: string | null;
}

// OKR types
export interface OkrCycle {
  id: string;
  orgId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: "creating" | "aligning" | "following_up" | "reviewing";
  createdAt: string;
}

export interface OkrObjective {
  id: string;
  cycleId: string;
  ownerId: string;
  title: string;
  description: string | null;
  parentObjectiveId: string | null;
  visibility: "everyone" | "leaders" | "team";
  status: "draft" | "active" | "completed";
  score: string | null;
  createdAt: string;
  updatedAt: string;
  keyResults?: OkrKeyResult[];
}

export interface OkrKeyResult {
  id: string;
  objectiveId: string;
  title: string;
  targetValue: string;
  currentValue: string;
  weight: string;
  unit: string | null;
  score: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OkrCheckin {
  id: string;
  keyResultId: string;
  userId: string;
  value: string;
  notes: string | null;
  createdAt: string;
}

export interface OkrAlignment {
  objectiveId: string;
  alignedToObjectiveId: string;
  confirmed: boolean;
  createdAt: string;
}

// Attendance types
export interface ClockRecord {
  id: string;
  userId: string;
  orgId: string;
  type: "clock_in" | "clock_out";
  method: "gps" | "wifi" | "manual";
  clockTime: string;
  latitude: string | null;
  longitude: string | null;
  isLate: boolean;
  notes: string | null;
  createdAt: string;
}

export interface AttendanceStats {
  workingDays: number;
  daysPresent: number;
  daysLate: number;
  daysAbsent: number;
  leaveDays: number;
  overtimeHours: number;
}

export const api = new ApiClient();
