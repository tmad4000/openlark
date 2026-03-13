import { db } from "../db";
import { notifications } from "../db/schema";
import { publish, getUserPresenceChannel } from "./redis";

type NotificationType =
  | "dm_received"
  | "mentioned"
  | "thread_reply"
  | "task_assigned"
  | "approval_pending"
  | "buzz"
  | "minutes_ready";

type EntityType = "message" | "chat" | "task" | "approval" | "document" | "meeting";

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  entityType?: EntityType;
  entityId?: string;
}

/**
 * Create a notification for a user and publish it via WebSocket
 */
export async function createNotification(
  params: CreateNotificationParams
): Promise<typeof notifications.$inferSelect> {
  const { userId, type, title, body, entityType, entityId } = params;

  const [notification] = await db
    .insert(notifications)
    .values({
      userId,
      type,
      title,
      body: body || null,
      entityType: entityType || null,
      entityId: entityId || null,
    })
    .returning();

  // Publish notification to user's presence channel for real-time delivery
  await publish(getUserPresenceChannel(userId), {
    type: "notification",
    payload: notification,
  });

  return notification;
}

/**
 * Create a DM received notification
 */
export async function createDmReceivedNotification(params: {
  recipientId: string;
  senderId: string;
  senderName: string;
  chatId: string;
  messageId: string;
  messagePreview: string;
}): Promise<typeof notifications.$inferSelect> {
  const { recipientId, senderName, chatId, messageId, messagePreview } = params;

  // Truncate message preview if too long
  const truncatedPreview =
    messagePreview.length > 100
      ? messagePreview.substring(0, 97) + "..."
      : messagePreview;

  return createNotification({
    userId: recipientId,
    type: "dm_received",
    title: `New message from ${senderName}`,
    body: truncatedPreview,
    entityType: "message",
    entityId: messageId,
  });
}

/**
 * Create a mention notification
 */
export async function createMentionNotification(params: {
  mentionedUserId: string;
  mentionedByName: string;
  chatId: string;
  chatName: string;
  messageId: string;
  messagePreview: string;
}): Promise<typeof notifications.$inferSelect> {
  const {
    mentionedUserId,
    mentionedByName,
    chatName,
    messageId,
    messagePreview,
  } = params;

  // Truncate message preview if too long
  const truncatedPreview =
    messagePreview.length > 100
      ? messagePreview.substring(0, 97) + "..."
      : messagePreview;

  return createNotification({
    userId: mentionedUserId,
    type: "mentioned",
    title: `${mentionedByName} mentioned you in ${chatName}`,
    body: truncatedPreview,
    entityType: "message",
    entityId: messageId,
  });
}

/**
 * Create a thread reply notification
 */
export async function createThreadReplyNotification(params: {
  recipientId: string;
  replierName: string;
  chatId: string;
  chatName: string;
  threadId: string;
  messageId: string;
  messagePreview: string;
}): Promise<typeof notifications.$inferSelect> {
  const {
    recipientId,
    replierName,
    chatName,
    messageId,
    messagePreview,
  } = params;

  // Truncate message preview if too long
  const truncatedPreview =
    messagePreview.length > 100
      ? messagePreview.substring(0, 97) + "..."
      : messagePreview;

  return createNotification({
    userId: recipientId,
    type: "thread_reply",
    title: `${replierName} replied to a thread in ${chatName}`,
    body: truncatedPreview,
    entityType: "message",
    entityId: messageId,
  });
}

/**
 * Create a task assigned notification
 */
export async function createTaskAssignedNotification(params: {
  assigneeId: string;
  assignerName: string;
  taskId: string;
  taskTitle: string;
}): Promise<typeof notifications.$inferSelect> {
  const { assigneeId, assignerName, taskId, taskTitle } = params;

  return createNotification({
    userId: assigneeId,
    type: "task_assigned",
    title: `${assignerName} assigned you a task`,
    body: taskTitle,
    entityType: "task",
    entityId: taskId,
  });
}

/**
 * Create an approval pending notification
 */
export async function createApprovalPendingNotification(params: {
  approverId: string;
  requesterName: string;
  approvalId: string;
  approvalTitle: string;
}): Promise<typeof notifications.$inferSelect> {
  const { approverId, requesterName, approvalId, approvalTitle } = params;

  return createNotification({
    userId: approverId,
    type: "approval_pending",
    title: `${requesterName} requested your approval`,
    body: approvalTitle,
    entityType: "approval",
    entityId: approvalId,
  });
}

/**
 * Create a buzz (urgent) notification
 */
export async function createBuzzNotification(params: {
  recipientId: string;
  senderName: string;
  chatId: string;
  chatName: string;
  messageId: string;
  messagePreview: string;
  buzzId: string;
}): Promise<typeof notifications.$inferSelect> {
  const { recipientId, senderName, chatId, chatName, messageId, messagePreview, buzzId } =
    params;

  // Truncate message preview if too long
  const truncatedPreview =
    messagePreview.length > 100
      ? messagePreview.substring(0, 97) + "..."
      : messagePreview;

  const notification = await createNotification({
    userId: recipientId,
    type: "buzz",
    title: `🔔 URGENT: ${senderName} buzzed you in ${chatName}`,
    body: truncatedPreview,
    entityType: "message",
    entityId: messageId,
  });

  // Also publish a specific buzz event for the full-screen overlay
  await publish(getUserPresenceChannel(recipientId), {
    type: "buzz",
    payload: {
      buzzId,
      messageId,
      chatId,
      chatName,
      senderName,
      messagePreview: truncatedPreview,
      createdAt: new Date().toISOString(),
    },
  });

  return notification;
}

/**
 * Create a minutes ready notification for a meeting participant
 */
export async function createMinutesReadyNotification(params: {
  userId: string;
  meetingId: string;
  meetingTitle: string;
}): Promise<typeof notifications.$inferSelect> {
  const { userId, meetingId, meetingTitle } = params;

  return createNotification({
    userId,
    type: "minutes_ready",
    title: "Meeting minutes are ready",
    body: meetingTitle,
    entityType: "meeting",
    entityId: meetingId,
  });
}
