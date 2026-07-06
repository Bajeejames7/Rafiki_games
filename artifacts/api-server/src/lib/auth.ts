import { type Request, type Response, type NextFunction } from "express";
import { db, teachersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// JWT-style tokens with embedded teacherId
// Format: {teacherId}.{randomBytes}.{timestamp}
// This eliminates the need for server-side storage, tokens survive restarts

export function generateToken(teacherId: number): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const randomPart = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const timestamp = Date.now();
  return `${teacherId}.${randomPart}.${timestamp}`;
}

export function parseToken(token: string): { teacherId: number; timestamp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const teacherId = parseInt(parts[0], 10);
  const timestamp = parseInt(parts[2], 10);
  if (isNaN(teacherId) || isNaN(timestamp)) return null;
  
  // Tokens expire after 30 days
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - timestamp > THIRTY_DAYS) return null;
  
  return { teacherId, timestamp };
}

// Express middleware — attaches teacher to req if valid token present
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const parsed = parseToken(token);
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
  await requireAuth(req, res, async () => {
    const teacher = (req as any).teacher;
    if (teacher?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}
