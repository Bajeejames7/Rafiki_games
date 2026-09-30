import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
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
  // Password recovery. An admin gives a teacher a one-time reset code
  // (stored hashed, expires quickly); admins can also recover with an
  // authenticator app. totp_secret is only trusted once totp_enabled is set,
  // and totp_last_step stops the same 6-digit code being used twice.
  resetCodeHash: text("reset_code_hash"),
  resetCodeExpires: timestamp("reset_code_expires", { withTimezone: true }),
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  totpLastStep: integer("totp_last_step"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Teacher = typeof teachersTable.$inferSelect;
export type InsertTeacher = typeof teachersTable.$inferInsert;

export const BLOCKS = ["primary", "jss", "sss"] as const;
export type Block = typeof BLOCKS[number];

export const BlockSchema = z.enum(BLOCKS);
