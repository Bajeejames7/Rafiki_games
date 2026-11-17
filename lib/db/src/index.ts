import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

// Aiven requires SSL with a self-signed CA cert.
// We strip sslmode from the connection string and handle SSL explicitly
// via the Pool config to avoid pg's built-in SSL verification rejecting Aiven's cert.
const cleanConnectionString = connectionString.replace(/[?&]sslmode=[^&]*/g, "");
const needsSsl = connectionString.includes("sslmode=require") ||
  connectionString.includes("aivencloud.com");

const ssl = needsSsl ? { rejectUnauthorized: false } : undefined;

export const pool = new Pool({ connectionString: cleanConnectionString, ssl });

// An idle client losing its connection (e.g. Aiven powering off or restarting)
// emits "error" on the pool. With no listener Node treats it as unhandled and
// the whole server exits, so log it instead; the pool replaces the client.
pool.on("error", (err) => {
  console.error("[DB] Idle client error:", err.message);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
