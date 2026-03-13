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
} from "./modules/auth/index.js";
import {
  messengerRoutes,
  registerWebSocketRoutes,
} from "./modules/messenger/index.js";
import { calendarRoutes } from "./modules/calendar/index.js";
import { docsRoutes } from "./modules/docs/index.js";
import { notificationRoutes, buzzRoutes } from "./modules/notifications/index.js";

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
    },
    { prefix: "/api/v1" }
  );

  return app;
}
