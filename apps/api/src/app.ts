import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import {
  authRoutes,
  orgRoutes,
  invitationRoutes,
  acceptInviteRoutes,
  departmentRoutes,
  userRoutes,
  contactsRoutes,
  adminRoutes,
} from "./modules/auth/index.js";
import {
  messengerRoutes,
  registerWebSocketRoutes,
} from "./modules/messenger/index.js";
import { calendarRoutes } from "./modules/calendar/index.js";
import { docsRoutes } from "./modules/docs/index.js";
import { notificationRoutes, buzzRoutes } from "./modules/notifications/index.js";
import { wikiRoutes } from "./modules/wiki/index.js";
import { baseRoutes } from "./modules/base/index.js";
import { automationRoutes } from "./modules/automations/index.js";
import { taskRoutes } from "./modules/tasks/index.js";
import { approvalsRoutes } from "./modules/approvals/index.js";
import { okrRoutes } from "./modules/okrs/index.js";
import { attendanceRoutes } from "./modules/attendance/index.js";
import { emailRoutes } from "./modules/email/index.js";
import { searchRoutes } from "./modules/search/index.js";
import { translationRoutes } from "./modules/translation/index.js";
import { meetingsRoutes, meetingsWebhookRoutes } from "./modules/meetings/index.js";
import { minutesRoutes } from "./modules/minutes/index.js";
import { formsRoutes } from "./modules/forms/index.js";
import { aiRoutes } from "./modules/ai/index.js";
import { auditRoutes, registerAuditMiddleware } from "./modules/audit/index.js";
import {
  platformRoutes,
  oauthRoutes,
  botRoutes,
  notificationBotRoutes,
  webhookBotRoutes,
} from "./modules/platform/index.js";

export async function buildApp() {
  const app = Fastify({
    logger:
      config.NODE_ENV !== "test"
        ? {
            level: config.NODE_ENV === "development" ? "info" : "warn",
          }
        : false,
  });

  // Plugins
  await app.register(cors, {
    origin: config.NODE_ENV === "development" ? true : false,
    credentials: true,
  });
  await app.register(sensible);
  await app.register(websocket);

  // Health check
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // API version prefix — all module routes register under /api/v1
  app.register(
    async (api) => {
      api.get("/ping", async () => ({ pong: true }));

      // Auth module
      api.register(authRoutes, { prefix: "/auth" });

      // Accept-invite routes (public, under /auth)
      api.register(acceptInviteRoutes, { prefix: "/auth" });

      // Organization management
      api.register(orgRoutes, { prefix: "/orgs" });

      // Invitation management (nested under orgs)
      api.register(invitationRoutes, { prefix: "/orgs/:id/invitations" });

      // Department management (nested under orgs)
      api.register(departmentRoutes, { prefix: "/orgs/:id/departments" });

      // User profile management
      api.register(userRoutes, { prefix: "/users" });

      // Contacts directory
      api.register(contactsRoutes, { prefix: "/contacts" });

      // Admin console
      api.register(adminRoutes, { prefix: "/admin" });

      // Messenger module (HTTP + WebSocket)
      api.register(messengerRoutes, { prefix: "/messenger" });
      api.register(registerWebSocketRoutes, { prefix: "/messenger" });

      // Calendar module
      api.register(calendarRoutes, { prefix: "/calendar" });

      // Docs module (collaborative documents)
      api.register(docsRoutes, { prefix: "/docs" });

      // Notifications module
      api.register(notificationRoutes, { prefix: "/notifications" });

      // Buzz (urgent notifications) — POST /messages/:messageId/buzz
      api.register(buzzRoutes, { prefix: "" });

      // Wiki module
      api.register(wikiRoutes, { prefix: "/wiki" });

      // Base module (spreadsheet/database)
      api.register(baseRoutes, { prefix: "/base" });

      // Automations module (base automations engine)
      api.register(automationRoutes, { prefix: "/base" });

      // Tasks module (task management)
      api.register(taskRoutes, { prefix: "/tasks" });

      // Approvals module (approval workflows)
      api.register(approvalsRoutes, { prefix: "/approvals" });

      // OKR module (objectives and key results)
      api.register(okrRoutes, { prefix: "/okrs" });

      // Attendance module (clock-in/out, leave, overtime)
      api.register(attendanceRoutes, { prefix: "/attendance" });

      // Email module (mailboxes, messages, send/receive)
      api.register(emailRoutes, { prefix: "/email" });

      // Global search module
      api.register(searchRoutes, { prefix: "/search" });

      // Translation module
      api.register(translationRoutes, { prefix: "/translate" });

      // Meetings module (video meetings via LiveKit)
      api.register(meetingsRoutes, { prefix: "/meetings" });

      // Minutes module (meeting minutes viewer)
      api.register(minutesRoutes, { prefix: "/minutes" });

      // Forms module (form builder and responses)
      api.register(formsRoutes, { prefix: "/forms" });

      // AI features (smart compose, document AI)
      api.register(aiRoutes, { prefix: "/ai" });

      // Audit logs (admin)
      api.register(auditRoutes, { prefix: "/admin/audit-logs" });

      // Open Platform (app registration, developer console)
      api.register(platformRoutes, { prefix: "/platform" });

      // OAuth 2.0 endpoints
      api.register(oauthRoutes, { prefix: "/auth/oauth" });

      // Bot messaging API
      api.register(botRoutes, { prefix: "/bot" });

      // Notification bots (webhook bots for group chats)
      api.register(notificationBotRoutes, { prefix: "/messenger/chats/:chatId/bots" });

      // Public webhook bot endpoint (no auth — URL is the secret)
      api.register(webhookBotRoutes, { prefix: "/webhook-bot" });

      // LiveKit webhooks (no auth — verified by LiveKit in production)
      api.register(meetingsWebhookRoutes, { prefix: "/webhooks" });

      // Audit middleware — logs all state-changing API calls
      registerAuditMiddleware(api);
    },
    { prefix: "/api/v1" }
  );

  return app;
}
