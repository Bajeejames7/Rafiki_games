import { pgTable, serial, text, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPointEventSchema = createInsertSchema(pointEventsTable).omit({ id: true, createdAt: true });
export type InsertPointEvent = z.infer<typeof insertPointEventSchema>;
export type PointEvent = typeof pointEventsTable.$inferSelect;
export type TeamScore = typeof teamScoresTable.$inferSelect;
export type DailyPoints = typeof dailyPointsTable.$inferSelect;
