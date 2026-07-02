import { pgTable, serial, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { z } from "zod";

export const teachersTable = pgTable("teachers", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(), // used for login
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  block: text("block").notNull(), // "primary" | "jss" | "sss"
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("teacher"), // "admin" | "teacher"
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Teacher = typeof teachersTable.$inferSelect;
export type InsertTeacher = typeof teachersTable.$inferInsert;

export const BLOCKS = ["primary", "jss", "sss"] as const;
export type Block = typeof BLOCKS[number];

export const BlockSchema = z.enum(BLOCKS);
