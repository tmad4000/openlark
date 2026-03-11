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
import { eventsRoutes } from "./routes/events";
import { wsRoutes } from "./routes/ws";
import { closeRedis } from "./lib/redis";

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
});

// Register WebSocket plugin
await fastify.register(websocket);

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
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down...");
  await fastify.close();
  await closeRedis();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

start();
