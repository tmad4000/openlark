import { config } from "./config.js";
import { createCollabServer } from "./server.js";

async function main() {
  const server = createCollabServer();

  await server.listen(config.PORT);
  console.log(
    `OpenLark Collab (Hocuspocus) running on ws://${config.HOST}:${config.PORT}`
  );
}

main().catch((err) => {
  console.error("Failed to start collab server:", err);
  process.exit(1);
});
