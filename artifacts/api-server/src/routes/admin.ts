import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, teachersTable, pointEventsTable, BLOCKS } from "@workspace/db";
import { currentTeacher, requireAdmin } from "../lib/auth";
import { RESET_CODE_TTL, newResetCode } from "../lib/recovery";

const router: IRouter = Router();

function idParam(raw: string | string[] | undefined): number | null {
  const id = parseInt(String(raw), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// List all teachers
router.get("/admin/teachers", requireAdmin, async (req, res): Promise<void> => {
  const teachers = await db
    .select({
      id: teachersTable.id,
      username: teachersTable.username,
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
  username: z.string().trim().min(2).regex(/^[a-zA-Z0-9._-]+$/, "Username: letters, numbers, . _ - only"),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  block: z.enum(BLOCKS),
  password: z.string().min(4),
  role: z.enum(["admin", "teacher"]).default("teacher"),
});

// Create teacher
router.post("/admin/teachers", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateTeacherBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid details" });
    return;
  }
  const { username, firstName, lastName, block, password, role } = parsed.data;
  const hash = await bcrypt.hash(password, 10);

  try {
    const [teacher] = await db.insert(teachersTable).values({
      username: username.toLowerCase(),
      firstName,
      lastName,
      block,
      passwordHash: hash,
      role,
      mustChangePassword: true,
    }).returning({
      id: teachersTable.id,
      username: teachersTable.username,
      firstName: teachersTable.firstName,
      lastName: teachersTable.lastName,
      block: teachersTable.block,
      role: teachersTable.role,
      mustChangePassword: teachersTable.mustChangePassword,
    });

    req.log.info({ teacherId: teacher.id }, "Teacher created");
    res.status(201).json(teacher);
  } catch (e: any) {
    if (e?.code === "23505") {
      res.status(409).json({ error: "Username already taken" });
    } else {
      throw e;
    }
  }
});

// Reset a teacher's password (admin only)
router.put("/admin/teachers/:id/reset-password", requireAdmin, async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  const { newPassword } = req.body ?? {};
  if (id === null) {
    res.status(400).json({ error: "Invalid teacher" });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters" });
    return;
  }
  const hash = await bcrypt.hash(newPassword, 10);
  const updated = await db.update(teachersTable)
    .set({ passwordHash: hash, mustChangePassword: true })
    .where(eq(teachersTable.id, id))
    .returning({ id: teachersTable.id });
  if (updated.length === 0) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  res.json({ ok: true });
});

// Issue a one-time reset code for a teacher who forgot their password. The
// admin reads it out; the teacher enters it under "Forgot password?" and
// chooses a new password. A new code replaces any earlier one.
router.post("/admin/teachers/:id/reset-code", requireAdmin, async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid teacher" });
    return;
  }
  const code = newResetCode();
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL);
  const updated = await db.update(teachersTable)
    .set({ resetCodeHash: await bcrypt.hash(code, 10), resetCodeExpires: expiresAt })
    .where(eq(teachersTable.id, id))
    .returning({ username: teachersTable.username });
  if (updated.length === 0) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }
  req.log.info({ teacherId: id, by: currentTeacher(req).id }, "Reset code issued");
  res.json({ code, username: updated[0].username, expiresAt: expiresAt.toISOString() });
});

// Delete teacher. Their point history stays: the log keeps the name and class
// it was written with, and only the link to the deleted account is cleared
// (point_events.teacher_id references teachers.id, so this has to happen
// first or the delete fails).
router.delete("/admin/teachers/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = idParam(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid teacher" });
    return;
  }
  if (currentTeacher(req).id === id) {
    res.status(400).json({ error: "Cannot delete yourself" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(pointEventsTable).set({ teacherId: null }).where(eq(pointEventsTable.teacherId, id));
    await tx.delete(teachersTable).where(eq(teachersTable.id, id));
  });
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
