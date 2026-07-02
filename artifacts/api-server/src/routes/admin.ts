import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, teachersTable, pointEventsTable, BLOCKS } from "@workspace/db";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

// List all teachers
router.get("/admin/teachers", requireAdmin, async (req, res): Promise<void> => {
  const teachers = await db
    .select({
      id: teachersTable.id,
      firstName: teachersTable.firstName,
      lastName: teachersTable.lastName,
      block: teachersTable.block,
      role: teachersTable.role,
      mustChangePassword: teachersTable.mustChangePassword,
      createdAt: teachersTable.createdAt,
    })
    .from(teachersTable)
    .orderBy(teachersTable.lastName);
  res.json(teachers);
});

const CreateTeacherBody = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  block: z.enum(BLOCKS),
  password: z.string().min(4),
  role: z.enum(["admin", "teacher"]).default("teacher"),
});

// Create teacher
router.post("/admin/teachers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateTeacherBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { firstName, lastName, block, password, role } = parsed.data;
  const hash = await bcrypt.hash(password, 10);

  const [teacher] = await db.insert(teachersTable).values({
    firstName,
    lastName,
    block,
    passwordHash: hash,
    role,
    mustChangePassword: true,
  }).returning({
    id: teachersTable.id,
    firstName: teachersTable.firstName,
    lastName: teachersTable.lastName,
    block: teachersTable.block,
    role: teachersTable.role,
    mustChangePassword: teachersTable.mustChangePassword,
  });

  req.log.info({ teacherId: teacher.id }, "Teacher created");
  res.status(201).json(teacher);
});

// Reset a teacher's password (admin only)
router.put("/admin/teachers/:id/reset-password", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters" });
    return;
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(teachersTable)
    .set({ passwordHash: hash, mustChangePassword: true })
    .where(eq(teachersTable.id, id));
  res.json({ ok: true });
});

// Delete teacher
router.delete("/admin/teachers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const admin = (req as any).teacher;
  if (admin.id === id) {
    res.status(400).json({ error: "Cannot delete yourself" });
    return;
  }
  await db.delete(teachersTable).where(eq(teachersTable.id, id));
  res.json({ ok: true });
});

// Points log with teacher details
router.get("/admin/log", requireAdmin, async (req, res): Promise<void> => {
  const events = await db
    .select()
    .from(pointEventsTable)
    .orderBy(desc(pointEventsTable.createdAt))
    .limit(1000);
  res.json(events);
});

export default router;
