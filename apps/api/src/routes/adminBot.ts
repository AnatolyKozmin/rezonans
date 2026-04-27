import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { adminAuth } from "../middleware.js";
import { uploadsRoot } from "../paths.js";

export const adminBotRouter = Router();
adminBotRouter.use(adminAuth);

// ─── Bot Admins ──────────────────────────────────────────────────────────────

adminBotRouter.get("/admins", async (_req, res) => {
  const admins = await prisma.botAdmin.findMany({ orderBy: { addedAt: "asc" } });
  res.json(admins);
});

adminBotRouter.post("/admins", async (req, res) => {
  const body = z.object({
    telegramId: z.string().min(1),
    name: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const admin = await prisma.botAdmin.upsert({
    where: { telegramId: body.data.telegramId },
    create: { telegramId: body.data.telegramId, name: body.data.name ?? "" },
    update: { name: body.data.name ?? "" },
  });
  res.json(admin);
});

adminBotRouter.delete("/admins/:id", async (req, res) => {
  await prisma.botAdmin.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ─── Broadcasts ──────────────────────────────────────────────────────────────

adminBotRouter.get("/broadcasts", async (_req, res) => {
  const broadcasts = await prisma.broadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(broadcasts);
});

adminBotRouter.post("/broadcasts", async (req, res) => {
  const body = z.object({ message: z.string().min(1).max(4096) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const broadcast = await prisma.broadcast.create({
    data: { message: body.data.message, status: "PENDING" },
  });
  res.json(broadcast);
});

adminBotRouter.delete("/broadcasts/:id", async (req, res) => {
  await prisma.broadcast.updateMany({
    where: { id: req.params.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  res.json({ ok: true });
});

// ─── Giveaways ───────────────────────────────────────────────────────────────

adminBotRouter.get("/giveaways", async (_req, res) => {
  const giveaways = await prisma.giveaway.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { entries: true } } },
  });
  res.json(giveaways);
});

adminBotRouter.post("/giveaways/:id/pick", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }

  const giveaway = await prisma.giveaway.findUnique({ where: { id } });
  if (!giveaway) { res.status(404).json({ error: "not found" }); return; }
  if (giveaway.winnersPicked) {
    res.json({ alreadyPicked: true, winnerTelegramId: giveaway.winnerTelegramId, winnerName: giveaway.winnerName });
    return;
  }

  const entries = await prisma.giveawayEntry.findMany({
    where: { giveawayId: id },
    include: { user: { select: { telegramId: true, firstName: true, lastName: true, fullName: true, username: true } } },
  });
  if (!entries.length) { res.status(400).json({ error: "no_entries" }); return; }

  const winner = entries[Math.floor(Math.random() * entries.length)];
  const u = winner.user;
  const winnerName =
    u.fullName ??
    ([u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.telegramId);

  await prisma.giveaway.update({
    where: { id },
    data: { winnersPicked: true, winnerTelegramId: u.telegramId, winnerName },
  });

  res.json({ ok: true, winnerTelegramId: u.telegramId, winnerName, totalEntries: entries.length });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

adminBotRouter.get("/stats", async (_req, res) => {
  try {
  const now = new Date();
  const day1 = new Date(now); day1.setHours(0, 0, 0, 0);
  const day7 = new Date(day1); day7.setDate(day7.getDate() - 6);
  const day30 = new Date(day1); day30.setDate(day30.getDate() - 29);

  const [
    totalUsers,
    usersWithConsent,
    totalOpens,
    opens24h,
    opens7d,
    opens30d,
    uniqueUsers7d,
    topPages,
    opensByDay,
    userOpenCounts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { pdConsentAt: { not: null } } }),
    prisma.miniAppOpen.count(),
    prisma.miniAppOpen.count({ where: { openedAt: { gte: new Date(Date.now() - 86400000) } } }),
    prisma.miniAppOpen.count({ where: { openedAt: { gte: day7 } } }),
    prisma.miniAppOpen.count({ where: { openedAt: { gte: day30 } } }),
    prisma.miniAppOpen.groupBy({
      by: ["telegramId"],
      where: { openedAt: { gte: day7 }, telegramId: { not: null } },
      _count: true,
    }).then((r) => r.length),
    prisma.miniAppOpen.groupBy({
      by: ["page"],
      _count: { _all: true },
      orderBy: { _count: { page: "desc" } },
      take: 10,
    }),
    // Открытия по дням за последние 30 дней
    prisma.$queryRaw<{ date: string; count: bigint }[]>`
      SELECT date(openedAt) as date, COUNT(*) as count
      FROM MiniAppOpen
      WHERE openedAt >= ${day30.toISOString()}
      GROUP BY date(openedAt)
      ORDER BY date ASC
    `,
    // Сколько раз каждый telegramId открывал мини-апп
    prisma.miniAppOpen.groupBy({
      by: ["telegramId"],
      where: { telegramId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { telegramId: "desc" } },
      take: 20,
    }),
  ]);

  res.json({
    users: { total: totalUsers, withConsent: usersWithConsent },
    opens: { total: totalOpens, last24h: opens24h, last7d: opens7d, last30d: opens30d },
    uniqueUsers7d,
    topPages: topPages.map((p) => ({ page: p.page, count: p._count._all })),
    opensByDay: opensByDay.map((r) => ({ date: r.date, count: Number(r.count) })),
    topUsers: userOpenCounts.map((r) => ({ telegramId: r.telegramId, opens: r._count._all })),
  });
  } catch (e) {
    console.error("stats error", e);
    res.status(500).json({ error: String(e) });
  }
});

// ─── Per-user open count ──────────────────────────────────────────────────────

adminBotRouter.get("/users/:telegramId/opens", async (req, res) => {
  const opens = await prisma.miniAppOpen.findMany({
    where: { telegramId: req.params.telegramId },
    orderBy: { openedAt: "desc" },
    take: 100,
  });
  const total = await prisma.miniAppOpen.count({ where: { telegramId: req.params.telegramId } });
  res.json({ total, opens });
});



adminBotRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { adventProgress: true } },
    },
  });

  const completedCounts = await prisma.adventProgress.groupBy({
    by: ["userId"],
    where: { taskCompletedAt: { not: null } },
    _count: { _all: true },
  });
  const ccMap = new Map(completedCounts.map((c) => [c.userId, c._count._all]));

  res.json(users.map((u) => ({
    id: u.id,
    telegramId: u.telegramId,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: u.fullName,
    age: u.age,
    university: u.university,
    pdConsentAt: u.pdConsentAt,
    createdAt: u.createdAt,
    lastActivityAt: u.lastActivityAt,
    completedDays: ccMap.get(u.id) ?? 0,
  })));
});

adminBotRouter.get("/users/:telegramId/results", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { telegramId: req.params.telegramId } });
  if (!user) { res.status(404).json({ error: "not found" }); return; }

  const progresses = await prisma.adventProgress.findMany({
    where: { userId: user.id, taskCompletedAt: { not: null } },
    orderBy: { day: "asc" },
  });

  const dayNums = progresses.map((p) => p.day);
  const days = await prisma.adventDay.findMany({
    where: { day: { in: dayNums } },
    select: { day: true, title: true },
  });
  const dayMap = new Map(days.map((d) => [d.day, d.title]));

  const questions = await prisma.adventQuestion.findMany({
    where: { day: { in: dayNums } },
    orderBy: { position: "asc" },
  });
  const qByDay = new Map<number, typeof questions>();
  for (const q of questions) {
    if (!qByDay.has(q.day)) qByDay.set(q.day, []);
    qByDay.get(q.day)!.push(q);
  }

  const safeActor = user.telegramId.replace(/[^a-zA-Z0-9_-]/g, "");

  const result = progresses.map((prog) => {
    const answers: Record<string, unknown> = prog.miniQuizAnswersJson
      ? JSON.parse(prog.miniQuizAnswersJson)
      : {};

    // Uploaded images: uploads/advent/{day}/a/{actorId}/
    const imgDir = path.join(uploadsRoot, "advent", String(prog.day), "a", safeActor);
    let uploadedImages: string[] = [];
    try {
      uploadedImages = fs.readdirSync(imgDir)
        .filter((f) => /\.(jpe?g|png|gif|webp)$/i.test(f))
        .map((f) => `/uploads/advent/${prog.day}/a/${safeActor}/${f}`);
    } catch { /* dir doesn't exist */ }

    const qs = qByDay.get(prog.day) ?? [];
    const questionsWithAnswers = qs.map((q) => {
      const ans = answers[q.id];
      let answerDisplay: string | null = null;
      if (q.kind === "SINGLE" || q.kind === "MULTI") {
        const opts: { text: string; correct: boolean }[] = q.optionsJson ? JSON.parse(q.optionsJson) : [];
        if (q.kind === "SINGLE" && typeof ans === "number") {
          answerDisplay = opts[ans as number]?.text ?? String(ans);
        } else if (q.kind === "MULTI" && Array.isArray(ans)) {
          answerDisplay = (ans as number[]).map((i) => opts[i]?.text ?? String(i)).join(", ");
        }
      } else if (q.kind === "TEXT") {
        answerDisplay = typeof ans === "string" ? ans : null;
      } else if (q.kind === "IMAGE") {
        answerDisplay = typeof ans === "string" ? ans : "(фото)";
      }
      return { id: q.id, prompt: q.prompt, kind: q.kind, answer: answerDisplay };
    });

    return {
      day: prog.day,
      title: dayMap.get(prog.day) ?? `День ${prog.day}`,
      completedAt: prog.taskCompletedAt,
      questions: questionsWithAnswers,
      uploadedImages,
    };
  });

  res.json({ user: { ...user }, results: result });
});

