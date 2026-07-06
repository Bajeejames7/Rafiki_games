import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, teachersTable } from "@workspace/db";
import { generateToken, requireAuth } from "../lib/auth";

const router: IRouter = Router();

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Username and password required" });
    return;
  }

  const { username, password } = parsed.data;
  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.username, username.toLowerCase().trim()));

  if (!teacher) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await bcrypt.compare(password, teacher.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const token = generateToken(teacher.id);

  req.log.info({ teacherId: teacher.id, role: teacher.role }, "Login");

  res.json({
    token,
    teacher: {
      id: teacher.id,
      username: teacher.username,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      block: teacher.block,
      role: teacher.role,
      mustChangePassword: teacher.mustChangePassword,
    },
  });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  // With JWT-style tokens, logout is handled client-side by deleting the token
  // No server-side revocation needed since tokens are self-contained
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const teacher = (req as any).teacher;
  res.json({
    id: teacher.id,
    username: teacher.username,
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    block: teacher.block,
    role: teacher.role,
    mustChangePassword: teacher.mustChangePassword,
  });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const teacher = (req as any).teacher;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters" });
    return;
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(teachersTable)
    .set({ passwordHash: hash, mustChangePassword: false })
    .where(eq(teachersTable.id, teacher.id));
  res.json({ ok: true });
});

export default router;
