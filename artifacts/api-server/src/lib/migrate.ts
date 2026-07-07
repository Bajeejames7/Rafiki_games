import { pool } from "@workspace/db";

export async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log("[Migration] Running database migrations...");
    
    // Migration 0001: Add daily_points table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "daily_points" (
        "id" serial PRIMARY KEY NOT NULL,
        "team_id" text NOT NULL,
        "points" integer DEFAULT 0 NOT NULL,
        "date" date NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
    
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "daily_points_team_date_idx" 
      ON "daily_points" ("team_id", "date");
    `);
    
    console.log("[Migration] ✓ Database migrations completed");
  } catch (err) {
    console.error("[Migration] ✗ Migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
