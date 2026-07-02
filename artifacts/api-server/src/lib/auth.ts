import { type Request, type Response, type NextFunction } from "express";
import { db, teachersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Simple token store: token -> teacherId
// In production you'd use Redis or JWT; for this app an in-memory map is fine
// since Render restarts are infrequent and tokens persist per process.
const tokenStore = new Map<string, number>();

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function storeToken(token: string, teacherId: number): void {
  tokenStore.set(token, teacherId);
}

export function revokeToken(token: string): void {
  tokenStore.delete(token);
}

export function getTeacherIdFromToken(token: string): number | undefined {
  return tokenStore.get(token);
}

// Express middleware — attaches teacher to req if valid token present
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const teacherId = getTeacherIdFromToken(token);
  if (!teacherId) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const [teacher] = await db.select().from(teachersTable).where(eq(teachersTable.id, teacherId));
  if (!teacher) {
    res.status(401).json({ error: "Teacher not found" });
    return;
  }
  (req as any).teacher = teacher;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    const teacher = (req as any).teacher;
    if (teacher?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}
