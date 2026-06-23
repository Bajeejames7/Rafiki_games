import { Router, type IRouter } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db, teamScoresTable, pointEventsTable } from "@workspace/db";
import { z } from "zod/v4";

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
  teacherName: z.string().default(""),
  teacherClass: z.string().default(""),
});

router.post("/scores/event", async (req, res): Promise<void> => {
  const parsed = AddEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { teamId, teamName, amount, teacherName, teacherClass } = parsed.data;

  await ensureTeamRows();

  await db
    .update(teamScoresTable)
    .set({
      points: sql`GREATEST(0, ${teamScoresTable.points} + ${amount})`,
      updatedAt: new Date(),
    })
    .where(eq(teamScoresTable.teamId, teamId));

  await db.insert(pointEventsTable).values({
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

  req.log.info({ teamId, amount, teacherName }, "Point event recorded");
  res.json(result);
});

router.post("/scores/reset", async (req, res): Promise<void> => {
  await ensureTeamRows();
  for (const teamId of TEAMS) {
    await db
      .update(teamScoresTable)
      .set({ points: 0, updatedAt: new Date() })
      .where(eq(teamScoresTable.teamId, teamId));
  }
  req.log.info("All scores reset");
  res.json({ wisdom: 0, justice: 0, fortitude: 0, temperance: 0 });
});

router.get("/log", async (req, res): Promise<void> => {
  const events = await db
    .select()
    .from(pointEventsTable)
    .orderBy(desc(pointEventsTable.createdAt))
    .limit(500);
  res.json(events);
});

export default router;
