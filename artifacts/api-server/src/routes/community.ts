/**
 * Routes for Task #38 — community cohorts, weekly challenges,
 * and AI moderation with human appeals.
 *
 * Admin endpoints reuse the same `isAdminRequest` shape as aiRuns: an
 * `x-admin-token` header that must match `RD_ADMIN_TOKEN`, or a session
 * `isAdmin` flag.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  cohortChallengesTable,
  cohortMembersTable,
  cohortsTable,
  challengePostsTable,
  dishReviewsTable,
  moderationAppealsTable,
  moderationDecisionsTable,
  userPreferencesTable,
} from "@workspace/db";
import {
  assignUserToCohorts,
  ensureCohortSeeds,
  generateChallengeForCohort,
  getUserChallengeProgress,
  listAllCohorts,
  listCohortsForUser,
  nextMonday,
} from "../lib/community";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function isAdminRequest(req: Request): boolean {
  const expected = process.env["RD_ADMIN_TOKEN"];
  if (expected) {
    const header = req.header("x-admin-token");
    if (header && header === expected) return true;
  }
  const session = (req as Request & { session?: { isAdmin?: boolean } })
    .session;
  return session?.isAdmin === true;
}

function requireAdmin(req: Request, res: Response): boolean {
  if (!isAdminRequest(req)) {
    res.status(403).json({ error: "admin required" });
    return false;
  }
  return true;
}

function requireUser(req: Request, res: Response): string | null {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "login required" });
    return null;
  }
  return req.user.id;
}

// ---- USER ------------------------------------------------------------------

router.get("/community/me", async (req: Request, res: Response) => {
  const userId = requireUser(req, res);
  if (!userId) return;
  try {
    await assignUserToCohorts(userId);
    const cohorts = await listCohortsForUser(userId);
    const [prefs] = await db
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId))
      .limit(1);

    const week = nextMonday(new Date(Date.now() - 1000 * 60 * 60 * 24 * 7));
    const challengeCards = await Promise.all(
      cohorts.map(async (c) => {
        // Lazy-create the active challenge for this cohort/week.
        const { challenge } = await generateChallengeForCohort(c.id, week);
        const progress = await getUserChallengeProgress(
          userId,
          challenge,
          prefs?.calorieTarget ?? null,
        );
        return {
          cohort: { id: c.id, slug: c.slug, name: c.name },
          challenge: {
            id: challenge.id,
            title: challenge.title,
            description: challenge.description,
            metric: challenge.metric,
            targetCount: challenge.targetCount,
            rewardPoints: challenge.rewardPoints,
            weekStartDate: challenge.weekStartDate,
            status: challenge.status,
          },
          progress: {
            count: progress.count,
            ratio: Math.min(1, progress.count / challenge.targetCount),
            completed: progress.count >= challenge.targetCount,
            recent: progress.details.slice(-3),
          },
        };
      }),
    );

    res.json({ cohorts: challengeCards });
  } catch (err) {
    logger.error({ err: (err as Error).message }, "community/me failed");
    res.status(500).json({ error: "failed to load community state" });
  }
});

// ---- ADMIN COHORTS ---------------------------------------------------------

router.get("/community/cohorts", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const cohorts = await listAllCohorts();
  const counts = await db
    .select({
      cohortId: cohortMembersTable.cohortId,
      count: sql<number>`count(*)::int`,
    })
    .from(cohortMembersTable)
    .where(
      cohorts.length > 0
        ? inArray(
            cohortMembersTable.cohortId,
            cohorts.map((c) => c.id),
          )
        : sql`false`,
    )
    .groupBy(cohortMembersTable.cohortId);
  const byId = new Map(counts.map((c) => [c.cohortId, c.count]));
  const withCounts = cohorts.map((c) => ({
    ...c,
    memberCount: byId.get(c.id) ?? 0,
  }));
  res.json({ cohorts: withCounts });
});

const generateBody = z.object({
  weekStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

router.post(
  "/community/cohorts/:slug/generate-challenge",
  async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const slug = String(req.params["slug"] ?? "");
    // Make sure default cohorts exist on cold-start clusters before we look up.
    await ensureCohortSeeds();
    const [cohort] = await db
      .select()
      .from(cohortsTable)
      .where(eq(cohortsTable.slug, slug))
      .limit(1);
    if (!cohort) {
      res.status(404).json({ error: "cohort not found" });
      return;
    }
    const parsed = generateBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid body" });
      return;
    }
    const week = parsed.data.weekStartDate ?? nextMonday();
    try {
      const result = await generateChallengeForCohort(cohort.id, week);
      res.json(result);
    } catch (err) {
      logger.error({ err: (err as Error).message }, "generate-challenge failed");
      res.status(500).json({ error: "failed to generate" });
    }
  },
);

router.get("/community/challenges", async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  const rows = await db
    .select()
    .from(cohortChallengesTable)
    .orderBy(desc(cohortChallengesTable.weekStartDate))
    .limit(100);
  res.json({ challenges: rows });
});

// ---- ADMIN MODERATION ------------------------------------------------------

router.get(
  "/community/moderation/queue",
  async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const rows = await db
      .select()
      .from(moderationDecisionsTable)
      .where(inArray(moderationDecisionsTable.decision, ["flagged", "hidden"]))
      .orderBy(desc(moderationDecisionsTable.createdAt))
      .limit(200);
    res.json({ decisions: rows });
  },
);

router.get(
  "/community/moderation/appeals",
  async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const rows = await db
      .select({
        appeal: moderationAppealsTable,
        decision: moderationDecisionsTable,
      })
      .from(moderationAppealsTable)
      .innerJoin(
        moderationDecisionsTable,
        eq(moderationDecisionsTable.id, moderationAppealsTable.decisionId),
      )
      .orderBy(desc(moderationAppealsTable.createdAt))
      .limit(200);
    res.json({ appeals: rows });
  },
);

const appealBody = z.object({ reason: z.string().min(1).max(1000) });

router.post(
  "/community/moderation/decisions/:id/appeal",
  async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "bad id" });
      return;
    }
    const parsed = appealBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "reason required" });
      return;
    }
    const [decision] = await db
      .select()
      .from(moderationDecisionsTable)
      .where(eq(moderationDecisionsTable.id, id))
      .limit(1);
    if (!decision) {
      res.status(404).json({ error: "decision not found" });
      return;
    }
    if (decision.userId !== userId) {
      res.status(403).json({ error: "not your content" });
      return;
    }
    try {
      const [row] = await db
        .insert(moderationAppealsTable)
        .values({
          decisionId: id,
          userId,
          reason: parsed.data.reason.slice(0, 1000),
          status: "open",
        })
        .returning();
      res.json({ appeal: row });
    } catch (err) {
      // Unique index on (decisionId, status='open' bucket via uq_open_appeal):
      // If an open appeal already exists, surface a friendly message.
      res
        .status(409)
        .json({ error: "an open appeal already exists for this decision" });
      logger.warn({ err: (err as Error).message }, "appeal insert failed");
    }
  },
);

const resolveBody = z.object({
  outcome: z.enum(["upheld", "overturned"]),
  reviewerNote: z.string().max(2000).optional(),
});

router.post(
  "/community/moderation/appeals/:id/resolve",
  async (req: Request, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "bad id" });
      return;
    }
    const parsed = resolveBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid payload" });
      return;
    }
    const reviewerId = req.isAuthenticated() ? req.user.id : null;

    // Conditional state transition: only resolve if the appeal is still open.
    const [appeal] = await db
      .update(moderationAppealsTable)
      .set({
        status: parsed.data.outcome,
        reviewerId,
        reviewerNote: parsed.data.reviewerNote ?? null,
        decidedAt: new Date(),
      })
      .where(
        and(
          eq(moderationAppealsTable.id, id),
          eq(moderationAppealsTable.status, "open"),
        ),
      )
      .returning();
    if (!appeal) {
      res.status(409).json({ error: "appeal already resolved or missing" });
      return;
    }

    // If overturned, restore visibility on the underlying content and
    // record a follow-up 'allowed' decision (audit trail of the human
    // override).
    if (parsed.data.outcome === "overturned") {
      const [decision] = await db
        .select()
        .from(moderationDecisionsTable)
        .where(eq(moderationDecisionsTable.id, appeal.decisionId))
        .limit(1);
      if (decision) {
        if (decision.contentType === "challenge_post") {
          await db
            .update(challengePostsTable)
            .set({ hidden: 0 })
            .where(eq(challengePostsTable.id, decision.contentId));
        } else if (decision.contentType === "dish_review") {
          await db
            .update(dishReviewsTable)
            .set({ hidden: 0 })
            .where(eq(dishReviewsTable.id, decision.contentId));
        }
        await db.insert(moderationDecisionsTable).values({
          contentType: decision.contentType,
          contentId: decision.contentId,
          userId: decision.userId,
          decision: "allowed",
          severity: 0,
          categories: [],
          rationale: `Override of decision #${decision.id} after appeal #${appeal.id}.`,
          actor: "human",
          reviewerId,
          model: null,
          snapshot: decision.snapshot,
        });
      }
    }
    res.json({ appeal });
  },
);

// ---- USER: list moderation decisions on their own content (for appeal UI) --

router.get(
  "/community/moderation/mine",
  async (req: Request, res: Response) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    const rows = await db
      .select({
        decision: moderationDecisionsTable,
        appeal: moderationAppealsTable,
      })
      .from(moderationDecisionsTable)
      .leftJoin(
        moderationAppealsTable,
        and(
          eq(moderationAppealsTable.decisionId, moderationDecisionsTable.id),
          isNull(moderationAppealsTable.decidedAt),
        ),
      )
      .where(eq(moderationDecisionsTable.userId, userId))
      .orderBy(desc(moderationDecisionsTable.createdAt))
      .limit(50);
    res.json({ decisions: rows });
  },
);

export default router;
