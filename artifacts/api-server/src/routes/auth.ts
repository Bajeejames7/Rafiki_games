import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db, teachersTable, type Teacher } from "@workspace/db";
import {
  clearLoginFailures,
  currentTeacher,
  generateToken,
  loginBlocked,
  recordLoginFailure,
  requireAdmin,
  requireAuth,
} from "../lib/auth";
import {
  clearRecoverFailures,
  newTotpSecret,
  recordRecoverFailure,
  recoverBlocked,
  totpUri,
  verifyTotp,
} from "../lib/recovery";

const router: IRouter = Router();

// The account details the app keeps; never includes hashes or secrets.
function publicTeacher(t: Teacher) {
  return {
    id: t.id,
    username: t.username,
    firstName: t.firstName,
    lastName: t.lastName,
    block: t.block,
    role: t.role,
    mustChangePassword: t.mustChangePassword,
  };
}

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
  const normalized = username.toLowerCase().trim();
  const limitKey = `${normalized}|${req.ip}`;
  if (loginBlocked(limitKey)) {
    res.status(429).json({ error: "Too many failed attempts. Wait 15 minutes and try again." });
    return;
  }

  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.username, normalized));
  const valid = teacher ? await bcrypt.compare(password, teacher.passwordHash) : false;
  if (!teacher || !valid) {
    recordLoginFailure(limitKey);
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  clearLoginFailures(limitKey);

  const token = generateToken(teacher.id);

  req.log.info({ teacherId: teacher.id, role: teacher.role }, "Login");

  res.json({ token, teacher: publicTeacher(teacher) });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  // With JWT-style tokens, logout is handled client-side by deleting the token
  // No server-side revocation needed since tokens are self-contained
  res.json({ ok: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  res.json(publicTeacher(currentTeacher(req)));
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const teacher = currentTeacher(req);
  const { newPassword } = req.body ?? {};
  if (typeof newPassword !== "string" || newPassword.length < 4) {
    res.status(400).json({ error: "Password must be at least 4 characters" });
    return;
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(teachersTable)
    .set({ passwordHash: hash, mustChangePassword: false })
    .where(eq(teachersTable.id, teacher.id));
  res.json({ ok: true });
});

// --- Forgotten passwords -------------------------------------------------

const RecoverBody = z.object({
  username: z.string().trim().min(1),
  code: z.string().trim().regex(/^\d{3}-?\d{3}$/, "Enter the 6-digit code"),
  newPassword: z.string().min(4, "Password must be at least 4 characters"),
});

// Set a new password with either a reset code an admin gave out or, for an
// admin, the current code from their authenticator app. Signs the user in.
router.post("/auth/recover", async (req, res): Promise<void> => {
  const parsed = RecoverBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid details" });
    return;
  }
  const username = parsed.data.username.toLowerCase();
  const code = parsed.data.code.replace("-", "");
  const { newPassword } = parsed.data;

  if (recoverBlocked(username)) {
    res.status(429).json({ error: "Too many wrong codes. Wait an hour, or ask an admin for help." });
    return;
  }

  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.username, username));
  const wrong = () => {
    recordRecoverFailure(username);
    res.status(401).json({ error: "That code is wrong or has expired" });
  };
  if (!teacher) { wrong(); return; }

  const hash = await bcrypt.hash(newPassword, 10);
  const newValues = { passwordHash: hash, mustChangePassword: false, resetCodeHash: null, resetCodeExpires: null };
  let updated: Teacher[] = [];

  // 1. A reset code from an admin. The update is conditional on the same
  //    code still being stored, so it can only be used once.
  if (
    teacher.resetCodeHash &&
    teacher.resetCodeExpires &&
    teacher.resetCodeExpires.getTime() > Date.now() &&
    (await bcrypt.compare(code, teacher.resetCodeHash))
  ) {
    updated = await db.update(teachersTable)
      .set(newValues)
      .where(and(eq(teachersTable.id, teacher.id), eq(teachersTable.resetCodeHash, teacher.resetCodeHash)))
      .returning();
  }

  // 2. An admin's authenticator code. Recording the time step it matched
  //    stops the same code being used again.
  if (updated.length === 0 && teacher.role === "admin" && teacher.totpEnabled && teacher.totpSecret) {
    const step = verifyTotp(teacher.totpSecret, code, teacher.totpLastStep);
    if (step !== null) {
      updated = await db.update(teachersTable)
        .set({ ...newValues, totpLastStep: step })
        .where(and(
          eq(teachersTable.id, teacher.id),
          or(isNull(teachersTable.totpLastStep), lt(teachersTable.totpLastStep, step)),
        ))
        .returning();
    }
  }

  if (updated.length === 0) { wrong(); return; }
  clearRecoverFailures(username);
  req.log.info({ teacherId: teacher.id }, "Password recovered");
  res.json({ token: generateToken(teacher.id), teacher: publicTeacher(updated[0]) });
});

// Authenticator app for the signed-in admin's own account.
router.get("/auth/authenticator", requireAdmin, async (req, res): Promise<void> => {
  res.json({ enabled: currentTeacher(req).totpEnabled });
});

// Start linking: store a new secret (not yet trusted) and return the QR code.
router.post("/auth/authenticator/setup", requireAdmin, async (req, res): Promise<void> => {
  const teacher = currentTeacher(req);
  if (teacher.totpEnabled) {
    res.status(409).json({ error: "An authenticator is already linked. Turn it off first." });
    return;
  }
  const secret = newTotpSecret();
  await db.update(teachersTable)
    .set({ totpSecret: secret, totpLastStep: null })
    .where(eq(teachersTable.id, teacher.id));
  const uri = totpUri(secret, teacher.username);
  const qr = await QRCode.toDataURL(uri, { margin: 2, width: 480 });
  res.json({ secret, qr });
});

// Finish linking: the admin proves the app works by entering its current code.
router.post("/auth/authenticator/confirm", requireAdmin, async (req, res): Promise<void> => {
  const teacher = currentTeacher(req);
  const code = String(req.body?.code ?? "").trim();
  if (!teacher.totpSecret) {
    res.status(400).json({ error: "Start the setup again" });
    return;
  }
  const step = verifyTotp(teacher.totpSecret, code, null);
  if (step === null) {
    res.status(400).json({ error: "That code does not match. Check the phone's time and try the newest code." });
    return;
  }
  await db.update(teachersTable)
    .set({ totpEnabled: true, totpLastStep: step })
    .where(eq(teachersTable.id, teacher.id));
  req.log.info({ teacherId: teacher.id }, "Authenticator linked");
  res.json({ ok: true });
});

router.post("/auth/authenticator/disable", requireAdmin, async (req, res): Promise<void> => {
  const teacher = currentTeacher(req);
  await db.update(teachersTable)
    .set({ totpEnabled: false, totpSecret: null, totpLastStep: null })
    .where(eq(teachersTable.id, teacher.id));
  req.log.info({ teacherId: teacher.id }, "Authenticator removed");
  res.json({ ok: true });
});

export default router;
