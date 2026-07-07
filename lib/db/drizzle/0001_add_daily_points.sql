-- Migration: Add daily_points table for tracking daily resets
CREATE TABLE IF NOT EXISTS "daily_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"date" date NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create unique index on team_id + date to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS "daily_points_team_date_idx" ON "daily_points" ("team_id", "date");
