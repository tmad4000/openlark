import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";

const client = postgres(config.DATABASE_URL);
export const db = drizzle(client);

export { client };
