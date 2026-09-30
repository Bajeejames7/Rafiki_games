import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";

// The four houses. Every score route validates team ids against this list.
export const TEAM_IDS = ["wisdom", "justice", "fortitude", "temperance"] as const;
export type TeamId = typeof TEAM_IDS[number];

export const teamScoresTable = pgTable("team_scores", {
  teamId: text("team_id").primaryKey(),
  points: integer("points").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const dailyPointsTable = pgTable("daily_points", {
  id: serial("id").primaryKey(),
  teamId: text("team_id").notNull(),
  points: integer("points").notNull().default(0),
  date: date("date").notNull(), // YYYY-MM-DD format
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const pointEventsTable = pgTable("point_events", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacher_id"),           // FK to teachers.id (nullable for legacy rows)
  teacherName: text("teacher_name").notNull().default(""),
  teacherClass: text("teacher_class").notNull().default(""),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull(),
  amount: integer("amount").notNull(),
  clientEventId: text("client_event_id").unique("point_events_client_event_id_idx"), // set by the phone; dedupes retries
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertPointEvent = typeof pointEventsTable.$inferInsert;
export type PointEvent = typeof pointEventsTable.$inferSelect;
export type TeamScore = typeof teamScoresTable.$inferSelect;
export type DailyPoints = typeof dailyPointsTable.$inferSelect;
