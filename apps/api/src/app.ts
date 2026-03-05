import Fastify from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { config } from "./config.js";

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

  // Health check
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // API version prefix — all module routes register under /api/v1
  app.register(
    async (api) => {
      api.get("/ping", async () => ({ pong: true }));

      // Module routes will be registered here:
      // api.register(authRoutes, { prefix: '/auth' });
      // api.register(messengerRoutes, { prefix: '/messenger' });
      // etc.
    },
    { prefix: "/api/v1" }
  );

  return app;
}
