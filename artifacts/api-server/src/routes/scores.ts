import { Router, type IRouter } from "express";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { db, teamScoresTable, dailyPointsTable, pointEventsTable, TEAM_IDS } from "@workspace/db";
import { currentTeacher, requireAuth } from "../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

type Scores = Record<string, number>;
type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The school runs on Nairobi time. The server (Render) runs on UTC, so "today"
// has to be computed in the school's zone or the day rolls over at 03:00.
const SCHOOL_TZ = "Africa/Nairobi";
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // EAT is UTC+3, no daylight saving

function getTodayDate(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TZ }).format(new Date());
}

/** Monday 00:00 of the current school week, as an instant. */
function startOfSchoolWeek(): Date {
  const local = new Date(Date.now() + NAIROBI_OFFSET_MS); // wall-clock time in UTC fields
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const monday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysSinceMonday);
  return new Date(monday - NAIROBI_OFFSET_MS);
}

async function ensureRows(q: Db | Tx, date: string) {
  await q.insert(teamScoresTable)
    .values(TEAM_IDS.map((teamId) => ({ teamId, points: 0 })))
    .onConflictDoNothing();
  await q.insert(dailyPointsTable)
    .values(TEAM_IDS.map((teamId) => ({ teamId, points: 0, date })))
    .onConflictDoNothing();
}

async function readScores(q: Db | Tx, date: string): Promise<{ liveStandings: Scores; todayPoints: Scores }> {
  const liveStandings: Scores = {};
  for (const row of await q.select().from(teamScoresTable)) liveStandings[row.teamId] = row.points;
  const todayPoints: Scores = {};
  for (const row of await q.select().from(dailyPointsTable).where(eq(dailyPointsTable.date, date))) {
    todayPoints[row.teamId] = row.points;
  }
  return { liveStandings, todayPoints };
}

// Scores are public (shown on load before login too)
router.get("/scores", async (_req, res): Promise<void> => {
  const today = getTodayDate();
  await ensureRows(db, today);
  res.json(await readScores(db, today));
});

// Points awarded this school week (Monday 00:00 Nairobi time onwards): per
// house for the week, and per house for each day. Computed here rather than on
// the phone, because a phone only holds the most recent page of the log.
// "Awarded" means positive amounts; −1 corrections and admin resets are not
// awards.
router.get("/scores/week", requireAuth, async (_req, res): Promise<void> => {
  const since = startOfSchoolWeek();
  // The zone is inlined, not a bind parameter: Postgres only accepts the GROUP
  // BY if it is textually the same expression as the SELECT.
  const day = sql<string>`to_char(${pointEventsTable.createdAt} at time zone '${sql.raw(SCHOOL_TZ)}', 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      teamId: pointEventsTable.teamId,
      total: sql<number>`sum(${pointEventsTable.amount})::int`,
      awards: sql<number>`count(*)::int`,
      teachers: sql<string[]>`array_agg(distinct ${pointEventsTable.teacherName})`,
    })
    .from(pointEventsTable)
    .where(and(gte(pointEventsTable.createdAt, since), sql`${pointEventsTable.amount} > 0`))
    .groupBy(day, pointEventsTable.teamId);

  const totals: Scores = {};
  for (const teamId of TEAM_IDS) totals[teamId] = 0;
  const days = new Map<string, { date: string; totals: Scores; awards: number; teachers: Set<string> }>();
  for (const row of rows) {
    totals[row.teamId] = (totals[row.teamId] ?? 0) + Number(row.total);
    const entry = days.get(row.day) ?? { date: row.day, totals: {}, awards: 0, teachers: new Set<string>() };
    entry.totals[row.teamId] = Number(row.total);
    entry.awards += Number(row.awards);
    for (const name of row.teachers ?? []) if (name) entry.teachers.add(name);
    days.set(row.day, entry);
  }

  res.json({
    since: since.toISOString(),
    today: getTodayDate(),
    totals,
    days: [...days.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => ({ ...d, teachers: [...d.teachers].sort() })),
  });
});

const AddEventBody = z.object({
  teamId: z.enum(TEAM_IDS),
  teamName: z.string().min(1).max(40),
  amount: z.number().int().refine((n) => n !== 0, "Amount cannot be zero"),
  // Older app builds do not send one; their events are simply not deduped.
  clientEventId: z.string().min(8).max(64).optional(),
});

// Teachers award points from the buttons (−50, +50, +100, +200). Anything
// larger is an admin correction. (Older app builds still send ±1/5/10.)
const TEACHER_MAX_AMOUNT = 200;

// All mutations require auth
router.post("/scores/event", requireAuth, async (req, res): Promise<void> => {
  const parsed = AddEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid points" });
    return;
  }

  const teacher = currentTeacher(req);
  const { teamId, teamName, amount, clientEventId } = parsed.data;
  if (teacher.role !== "admin" && Math.abs(amount) > TEACHER_MAX_AMOUNT) {
    res.status(403).json({ error: `Teachers can change points by at most ${TEACHER_MAX_AMOUNT} at a time` });
    return;
  }
  const today = getTodayDate();

  // One transaction: the live total, today's total and the log entry either all
  // change or none do. The log entry goes in first: if this client_event_id was
  // already recorded (a retried request), nothing is inserted and the totals
  // are left alone.
  const { duplicate, scores } = await db.transaction(async (tx) => {
    await ensureRows(tx, today);
    const inserted = await tx.insert(pointEventsTable).values({
      teacherId: teacher.id,
      teamId,
      teamName,
      amount,
      clientEventId,
      teacherName: `${teacher.firstName} ${teacher.lastName}`,
      teacherClass: teacher.block,
    }).onConflictDoNothing().returning({ id: pointEventsTable.id });
    if (inserted.length === 0) return { duplicate: true, scores: await readScores(tx, today) };

    await tx
      .update(teamScoresTable)
      .set({ points: sql`GREATEST(0, ${teamScoresTable.points} + ${amount})`, updatedAt: new Date() })
      .where(eq(teamScoresTable.teamId, teamId));
    await tx
      .update(dailyPointsTable)
      .set({ points: sql`GREATEST(0, ${dailyPointsTable.points} + ${amount})`, updatedAt: new Date() })
      .where(and(eq(dailyPointsTable.teamId, teamId), eq(dailyPointsTable.date, today)));
    return { duplicate: false, scores: await readScores(tx, today) };
  });

  req.log.info({ teamId, amount, teacherId: teacher.id, duplicate }, "Point event recorded");
  res.json(scores);
});

// Admin: set one house's live standing back to 0. Today's points are left
// alone, and the log records the correction so the history still adds up.
router.post("/scores/reset-team", requireAuth, async (req, res): Promise<void> => {
  const teacher = currentTeacher(req);
  if (teacher.role !== "admin") {
    res.status(403).json({ error: "Only admins can reset a house" });
    return;
  }
  const parsed = z.object({ teamId: z.enum(TEAM_IDS), teamName: z.string().min(1).max(40) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Unknown house" });
    return;
  }
  const { teamId, teamName } = parsed.data;
  const today = getTodayDate();

  const result = await db.transaction(async (tx) => {
    await ensureRows(tx, today);
    const [row] = await tx.select().from(teamScoresTable).where(eq(teamScoresTable.teamId, teamId)).for("update");
    const previous = row?.points ?? 0;
    if (previous > 0) {
      await tx.update(teamScoresTable).set({ points: 0, updatedAt: new Date() }).where(eq(teamScoresTable.teamId, teamId));
      await tx.insert(pointEventsTable).values({
        teacherId: teacher.id,
        teamId,
        teamName,
        amount: -previous,
        teacherName: `${teacher.firstName} ${teacher.lastName}`,
        teacherClass: teacher.block,
      });
    }
    return readScores(tx, today);
  });

  req.log.info({ adminId: teacher.id, teamId }, "House reset");
  res.json(result);
});

router.post("/scores/reset", requireAuth, async (req, res): Promise<void> => {
  const teacher = currentTeacher(req);
  if (teacher.role !== "admin") {
    res.status(403).json({ error: "Only admins can reset live standings" });
    return;
  }

  const today = getTodayDate();
  // Reset only the persistent live standings; today's points are unchanged.
  const result = await db.transaction(async (tx) => {
    await ensureRows(tx, today);
    await tx.update(teamScoresTable).set({ points: 0, updatedAt: new Date() });
    return readScores(tx, today);
  });

  req.log.info({ adminId: teacher.id }, "Live standings reset");
  res.json(result);
});

const MAX_LOG_PAGE = 200;

router.get("/log", requireAuth, async (req, res): Promise<void> => {
  const teacher = currentTeacher(req);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 50, 1), MAX_LOG_PAGE);
  const offset = Math.max(parseInt(String(req.query.offset), 10) || 0, 0);

  // Non-admins only see the last 3 days
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const events = await db
    .select()
    .from(pointEventsTable)
    .where(teacher.role === "admin" ? undefined : gte(pointEventsTable.createdAt, threeDaysAgo))
    .orderBy(desc(pointEventsTable.createdAt), desc(pointEventsTable.id))
    .limit(limit)
    .offset(offset);
  res.json(events);
});

export default router;
