import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { type Request, type Response, type NextFunction } from "express";
import { db, teachersTable, type Teacher } from "@workspace/db";
import { eq } from "drizzle-orm";

// Stateless signed tokens: {teacherId}.{nonce}.{issuedAt}.{signature}
// The signature is an HMAC over the first three parts, so a token cannot be
// forged by editing the teacher id. Tokens survive server restarts because the
// key is stable: TOKEN_SECRET if set, otherwise derived from DATABASE_URL (which
// is already secret and fixed per deployment).

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

const signingKey: Buffer = process.env["TOKEN_SECRET"]
  ? Buffer.from(process.env["TOKEN_SECRET"])
  : createHash("sha256").update(`rafiki-token:${process.env["DATABASE_URL"] ?? ""}`).digest();

function sign(payload: string): string {
  return createHmac("sha256", signingKey).update(payload).digest("hex");
}

export function generateToken(teacherId: number): string {
  const payload = `${teacherId}.${randomBytes(16).toString("hex")}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function parseToken(token: string): { teacherId: number; timestamp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, nonce, issued, signature] = parts;
  const expected = Buffer.from(sign(`${id}.${nonce}.${issued}`), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const teacherId = parseInt(id, 10);
  const timestamp = parseInt(issued, 10);
  if (isNaN(teacherId) || isNaN(timestamp)) return null;
  if (Date.now() - timestamp > THIRTY_DAYS) return null;
  return { teacherId, timestamp };
}

export function currentTeacher(req: Request): Teacher {
  return (req as any).teacher as Teacher;
}

// Express middleware — attaches teacher to req if valid token present
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const parsed = parseToken(authHeader.slice(7));
  if (!parsed) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.id, parsed.teacherId));
  if (!teacher) {
    res.status(401).json({ error: "Teacher not found" });
    return;
  }
  (req as any).teacher = teacher;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (currentTeacher(req).role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

// Small in-memory limiter for the login route: 10 failed attempts per
// username+IP in 15 minutes. Enough to stop password guessing on a free
// single-instance server without adding a dependency.
const FAILED_WINDOW = 15 * 60 * 1000;
const MAX_FAILED = 10;
const failures = new Map<string, { count: number; first: number }>();

export function loginBlocked(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > FAILED_WINDOW) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILED;
}

export function recordLoginFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || Date.now() - entry.first > FAILED_WINDOW) {
    failures.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(key: string): void {
  failures.delete(key);
}
