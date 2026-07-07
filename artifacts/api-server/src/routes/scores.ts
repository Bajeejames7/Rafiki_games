import { Router, type IRouter } from "express";
import { eq, desc, sql, and } from "drizzle-orm";
import { db, teamScoresTable, dailyPointsTable, pointEventsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

const TEAMS = ["wisdom", "justice", "fortitude", "temperance"];

function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function ensureTeamRows() {
  for (const teamId of TEAMS) {
    await db
      .insert(teamScoresTable)
      .values({ teamId, points: 0 })
      .onConflictDoNothing();
  }
}

async function ensureDailyRows(date: string) {
  for (const teamId of TEAMS) {
    await db
      .insert(dailyPointsTable)
      .values({ teamId, points: 0, date })
      .onConflictDoNothing();
  }
}

// Scores are public (shown on load before login too)
router.get("/scores", async (req, res): Promise<void> => {
  await ensureTeamRows();
  const today = getTodayDate();
  await ensureDailyRows(today);
  
  // Get persistent live standings
  const rows = await db.select().from(teamScoresTable);
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.teamId] = row.points;
  }
  
  // Get today's points
  const dailyRows = await db
    .select()
    .from(dailyPointsTable)
    .where(eq(dailyPointsTable.date, today));
  const todayPoints: Record<string, number> = {};
  for (const row of dailyRows) {
    todayPoints[row.teamId] = row.points;
  }
  
  res.json({ liveStandings: result, todayPoints });
});

const AddEventBody = z.object({
  teamId: z.string(),
  teamName: z.string(),
  amount: z.number().int(),
});

// All mutations require auth
router.post("/scores/event", requireAuth, async (req, res): Promise<void> => {
  const parsed = AddEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const teacher = (req as any).teacher;
  const { teamId, teamName, amount } = parsed.data;
  const teacherName = `${teacher.firstName} ${teacher.lastName}`;
  const teacherClass = teacher.block;
  const today = getTodayDate();

  await ensureTeamRows();
  await ensureDailyRows(today);

  // Update persistent live standings
  await db
    .update(teamScoresTable)
    .set({
      points: sql`GREATEST(0, ${teamScoresTable.points} + ${amount})`,
      updatedAt: new Date(),
    })
    .where(eq(teamScoresTable.teamId, teamId));

  // Update today's points
  await db
    .update(dailyPointsTable)
    .set({
      points: sql`GREATEST(0, ${dailyPointsTable.points} + ${amount})`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(dailyPointsTable.teamId, teamId),
      eq(dailyPointsTable.date, today)
    ));

  // Log the event
  await db.insert(pointEventsTable).values({
    teacherId: teacher.id,
    teamId,
    teamName,
    amount,
    teacherName,
    teacherClass,
  });

  // Return both live standings and today's points
  const allRows = await db.select().from(teamScoresTable);
  const liveStandings: Record<string, number> = {};
  for (const row of allRows) {
    liveStandings[row.teamId] = row.points;
  }
  
  const dailyRows = await db
    .select()
    .from(dailyPointsTable)
    .where(eq(dailyPointsTable.date, today));
  const todayPoints: Record<string, number> = {};
  for (const row of dailyRows) {
    todayPoints[row.teamId] = row.points;
  }

  req.log.info({ teamId, amount, teacherId: teacher.id }, "Point event recorded");
  res.json({ liveStandings, todayPoints });
});

router.post("/scores/reset", requireAuth, async (req, res): Promise<void> => {
  const teacher = (req as any).teacher;
  if (teacher.role !== "admin") {
    res.status(403).json({ error: "Only admins can reset live standings" });
    return;
  }
  
  const today = getTodayDate();
  await ensureTeamRows();
  await ensureDailyRows(today);
  
  // Reset only the persistent live standings
  for (const teamId of TEAMS) {
    await db
      .update(teamScoresTable)
      .set({ points: 0, updatedAt: new Date() })
      .where(eq(teamScoresTable.teamId, teamId));
  }
  
  // Get today's points (unchanged)
  const dailyRows = await db
    .select()
    .from(dailyPointsTable)
    .where(eq(dailyPointsTable.date, today));
  const todayPoints: Record<string, number> = {};
  for (const row of dailyRows) {
    todayPoints[row.teamId] = row.points;
  }
  
  req.log.info({ adminId: teacher.id }, "Live standings reset");
  res.json({ 
    liveStandings: { wisdom: 0, justice: 0, fortitude: 0, temperance: 0 },
    todayPoints 
  });
});

// Endpoint to reset daily points (called by cron at midnight)
router.post("/scores/reset-daily", async (req, res): Promise<void> => {
  // Simple secret-based auth for cron job
  const secret = req.headers["x-cron-secret"];
  if (secret !== process.env.CRON_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  
  const today = getTodayDate();
  await ensureDailyRows(today);
  
  // Create today's entries with 0 points (yesterday's are preserved)
  for (const teamId of TEAMS) {
    await db
      .insert(dailyPointsTable)
      .values({ teamId, points: 0, date: today })
      .onConflictDoNothing();
  }
  
  req.log.info({ date: today }, "Daily points reset for new day");
  res.json({ success: true, date: today });
});

router.get("/log", requireAuth, async (req, res): Promise<void> => {
  const teacher = (req as any).teacher;
  const isAdmin = teacher.role === "admin";
  
  // Parse query parameters
  const limit = parseInt(req.query.limit as string) || 50;
  const offset = parseInt(req.query.offset as string) || 0;
  
  let query = db
    .select()
    .from(pointEventsTable)
    .orderBy(desc(pointEventsTable.createdAt))
    .limit(limit)
    .offset(offset);
  
  // Non-admins only see last 3 days
  if (!isAdmin) {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    query = db
      .select()
      .from(pointEventsTable)
      .where(sql`${pointEventsTable.createdAt} >= ${threeDaysAgo.toISOString()}`)
      .orderBy(desc(pointEventsTable.createdAt))
      .limit(limit)
      .offset(offset);
  }
  
  const events = await query;
  res.json(events);
});

export default router;
