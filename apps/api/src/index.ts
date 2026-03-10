import Fastify from "fastify";
import cors from "@fastify/cors";
import { authRoutes } from "./routes/auth";
import { orgsRoutes } from "./routes/orgs";
import { departmentsRoutes } from "./routes/departments";
import { usersRoutes } from "./routes/users";
import { contactsRoutes } from "./routes/contacts";

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
});

// Register routes
await fastify.register(authRoutes);
await fastify.register(orgsRoutes);
await fastify.register(departmentsRoutes);
await fastify.register(usersRoutes);
await fastify.register(contactsRoutes);

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

start();
