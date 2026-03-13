import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { authRoutes } from "./routes/auth";
import { orgsRoutes } from "./routes/orgs";
import { departmentsRoutes } from "./routes/departments";
import { usersRoutes } from "./routes/users";
import { contactsRoutes } from "./routes/contacts";
import { chatsRoutes } from "./routes/chats";
import { messagesRoutes } from "./routes/messages";
import { notificationsRoutes } from "./routes/notifications";
import { topicsRoutes } from "./routes/topics";
import { eventsRoutes, meetingRoomsRoutes } from "./routes/events";
import { documentsRoutes } from "./routes/documents";
import { documentCommentsRoutes } from "./routes/document-comments";
import { uploadsRoutes } from "./routes/uploads";
import { wikiRoutes } from "./routes/wiki";
import { basesRoutes } from "./routes/bases";
import { automationsRoutes } from "./routes/automations";
import { tasksRoutes } from "./routes/tasks";
import { approvalsRoutes } from "./routes/approvals";
import { okrsRoutes } from "./routes/okrs";
import { attendanceRoutes } from "./routes/attendance";
import { leaveRoutes } from "./routes/leave";
import { emailRoutes } from "./routes/emails";
import { searchRoutes } from "./routes/search";
import { translationRoutes } from "./routes/translations";
import { meetingsRoutes } from "./routes/meetings";
import { formsRoutes } from "./routes/forms";
import { adminRoutes } from "./routes/admin";
import { dashboardRoutes } from "./routes/dashboard";
import { oauthRoutes } from "./routes/oauth";
import { botMessagingRoutes } from "./routes/bot-messaging";
import { notificationBotRoutes } from "./routes/notification-bots";
import { aiRoutes } from "./routes/ai";
import { samlRoutes } from "./routes/saml";
import { wsRoutes } from "./routes/ws";
import { auditLogPlugin } from "./middleware/audit";
import { closeRedis } from "./lib/redis";
import { startAutomationWorker, stopAutomationWorker } from "./lib/automation-worker";
import { startTranscriptionWorker, stopTranscriptionWorker } from "./lib/transcription-worker";
import { startWebhookWorker, stopWebhookWorker } from "./lib/webhook-worker";

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
});

// Register WebSocket plugin
await fastify.register(websocket);

// Register audit logging plugin (logs all state-changing API calls)
await fastify.register(auditLogPlugin);

// Register routes
await fastify.register(authRoutes);
await fastify.register(orgsRoutes);
await fastify.register(departmentsRoutes);
await fastify.register(usersRoutes);
await fastify.register(contactsRoutes);
await fastify.register(chatsRoutes);
await fastify.register(messagesRoutes);
await fastify.register(notificationsRoutes);
await fastify.register(topicsRoutes);
await fastify.register(eventsRoutes);
await fastify.register(meetingRoomsRoutes);
await fastify.register(documentsRoutes);
await fastify.register(documentCommentsRoutes);
await fastify.register(uploadsRoutes);
await fastify.register(wikiRoutes);
await fastify.register(basesRoutes);
await fastify.register(automationsRoutes);
await fastify.register(tasksRoutes);
await fastify.register(approvalsRoutes);
await fastify.register(okrsRoutes);
await fastify.register(attendanceRoutes);
await fastify.register(leaveRoutes);
await fastify.register(emailRoutes);
await fastify.register(searchRoutes);
await fastify.register(translationRoutes);
await fastify.register(meetingsRoutes);
await fastify.register(formsRoutes);
await fastify.register(adminRoutes);
await fastify.register(dashboardRoutes);
await fastify.register(oauthRoutes);
await fastify.register(botMessagingRoutes);
await fastify.register(notificationBotRoutes);
await fastify.register(aiRoutes);
await fastify.register(samlRoutes);
await fastify.register(wsRoutes);

fastify.get("/", async () => {
  return { status: "ok", name: "OpenLark API" };
});

fastify.get("/health", async () => {
  return { status: "healthy" };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || "3001", 10);
    await fastify.listen({ port, host: "0.0.0.0" });
    console.log(`API server listening on port ${port}`);

    // Start workers
    startAutomationWorker();
    startTranscriptionWorker();
    startWebhookWorker();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down...");
  await fastify.close();
  await stopAutomationWorker();
  await stopTranscriptionWorker();
  await stopWebhookWorker();
  await closeRedis();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();
