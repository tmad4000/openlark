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

  async sendMessage(chatId: string, data: { content: string; type?: string }) {
    return this.request<{ message: Message }>(`/messenger/chats/${chatId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getChatMembers(chatId: string) {
    return this.request<{ members: ChatMember[] }>(`/messenger/chats/${chatId}/members`);
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

export interface Chat {
  id: string;
  orgId: string;
  type: "dm" | "group" | "topic_group" | "supergroup" | "meeting";
  name: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  contentJson: { text?: string };
  createdAt: string;
  editedAt: string | null;
  recalledAt: string | null;
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

export const api = new ApiClient();
