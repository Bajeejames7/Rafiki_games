/**
 * Seed script — run once to:
 * 1. Create the teachers table
 * 2. Add teacher_id column to point_events
 * 3. Create default admin account (ID will be printed)
 *
 * Usage: DATABASE_URL=... npx tsx scripts/src/seed.ts
 */

import pg from "pg";
import bcrypt from "bcryptjs";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL required");

const connectionString = DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, "");
const ssl = DATABASE_URL.includes("sslmode=require")
  ? { rejectUnauthorized: false }
  : undefined;

async function main() {
  const client = new Client({ connectionString, ssl });
  await client.connect();

  console.log("Running migrations...");

  // Create teachers table
  await client.query(`
    CREATE TABLE IF NOT EXISTS teachers (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      block TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'teacher',
      must_change_password BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Add teacher_id to point_events if not exists
  await client.query(`
    ALTER TABLE point_events
    ADD COLUMN IF NOT EXISTS teacher_id INTEGER REFERENCES teachers(id);
  `);

  console.log("Tables ready.");

  // Seed admin if none exists
  const { rows } = await client.query(
    `SELECT id FROM teachers WHERE role = 'admin' LIMIT 1`
  );

  if (rows.length === 0) {
    const hash = await bcrypt.hash("admin123", 10);
    const result = await client.query(
      `INSERT INTO teachers (first_name, last_name, block, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      ["Admin", "User", "primary", hash, "admin", true]
    );
    const adminId = result.rows[0].id;
    console.log("\n✅ Default admin created:");
    console.log(`   ID: ${adminId}`);
    console.log(`   Password: admin123`);
    console.log(`   ⚠️  Change this password immediately after first login!\n`);
  } else {
    console.log("Admin already exists, skipping seed.");
  }

  await client.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
