import { buildApp } from "./app.js";
import { config } from "./config.js";

async function main() {
  const app = await buildApp();

  await app.listen({ port: config.PORT, host: config.HOST });
  console.log(`OpenLark API running on http://${config.HOST}:${config.PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
