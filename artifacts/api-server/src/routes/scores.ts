import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, teamScoresTable, pointEventsTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

const TEAMS = ["wisdom", "justice", "fortitude", "temperance"];

async function ensureTeamRows() {
  for (const teamId of TEAMS) {
    await db
      .insert(teamScoresTable)
      .values({ teamId, points: 0 })
      .onConflictDoNothing();
  }
}

// Scores are public (shown on load before login too)
router.get("/scores", async (req, res): Promise<void> => {
  await ensureTeamRows();
  const rows = await db.select().from(teamScoresTable);
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.teamId] = row.points;
  }
  res.json(result);
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

  await ensureTeamRows();

  await db
    .update(teamScoresTable)
    .set({
      points: sql`GREATEST(0, ${teamScoresTable.points} + ${amount})`,
      updatedAt: new Date(),
    })
    .where(eq(teamScoresTable.teamId, teamId));

  await db.insert(pointEventsTable).values({
    teacherId: teacher.id,
    teamId,
    teamName,
    amount,
    teacherName,
    teacherClass,
  });

  const allRows = await db.select().from(teamScoresTable);
  const result: Record<string, number> = {};
  for (const row of allRows) {
    result[row.teamId] = row.points;
  }

  req.log.info({ teamId, amount, teacherId: teacher.id }, "Point event recorded");
  res.json(result);
});

router.post("/scores/reset", requireAuth, async (req, res): Promise<void> => {
  const teacher = (req as any).teacher;
  if (teacher.role !== "admin") {
    res.status(403).json({ error: "Only admins can reset all scores" });
    return;
  }
  await ensureTeamRows();
  for (const teamId of TEAMS) {
    await db
      .update(teamScoresTable)
      .set({ points: 0, updatedAt: new Date() })
      .where(eq(teamScoresTable.teamId, teamId));
  }
  req.log.info({ adminId: teacher.id }, "All scores reset");
  res.json({ wisdom: 0, justice: 0, fortitude: 0, temperance: 0 });
});

router.get("/log", requireAuth, async (req, res): Promise<void> => {
  const events = await db
    .select()
    .from(pointEventsTable)
    .orderBy(desc(pointEventsTable.createdAt))
    .limit(500);
  res.json(events);
});

export default router;
