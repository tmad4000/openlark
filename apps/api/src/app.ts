import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { authRoutes } from "./modules/auth/index.js";
import {
  messengerRoutes,
  registerWebSocketRoutes,
} from "./modules/messenger/index.js";
import { calendarRoutes } from "./modules/calendar/index.js";
import { docsRoutes } from "./modules/docs/index.js";

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

      // Messenger module (HTTP + WebSocket)
      api.register(messengerRoutes, { prefix: "/messenger" });
      api.register(registerWebSocketRoutes, { prefix: "/messenger" });

      // Calendar module
      api.register(calendarRoutes, { prefix: "/calendar" });

      // Docs module (collaborative documents)
      api.register(docsRoutes, { prefix: "/docs" });
    },
    { prefix: "/api/v1" }
  );

  return app;
}
