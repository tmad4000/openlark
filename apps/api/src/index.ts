import Fastify from "fastify";
import cors from "@fastify/cors";
import { authRoutes } from "./routes/auth";

const fastify = Fastify({
  logger: true,
});

await fastify.register(cors, {
  origin: true,
});

// Register routes
await fastify.register(authRoutes);

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
