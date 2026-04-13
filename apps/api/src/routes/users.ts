import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  adventDaysRangeForWeek,
  currentAdventDayNumber,
  isAdventDayUnlocked,
} from "../campaign.js";

export const usersRouter = Router();

const UpsertUser = z.object({
  telegramId: z.string(),
  username: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

usersRouter.post("/upsert", async (req, res) => {
  const body = UpsertUser.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const u = await prisma.user.upsert({
    where: { telegramId: body.data.telegramId },
    create: {
      telegramId: body.data.telegramId,
      username: body.data.username,
      firstName: body.data.firstName,
      lastName: body.data.lastName,
      lastActivityAt: new Date(),
    },
    update: {
      username: body.data.username,
      firstName: body.data.firstName,
      lastName: body.data.lastName,
      lastActivityAt: new Date(),
    },
  });
  res.json(u);
});

usersRouter.patch("/:telegramId/mute", async (req, res) => {
  const telegramId = req.params.telegramId;
  const muted = Boolean(req.body?.muted);
  const user = await prisma.user.updateMany({
    where: { telegramId },
    data: { reminderMuted: muted },
  });
  if (user.count === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ ok: true });
});

usersRouter.get("/:telegramId/advent", async (req, res) => {
  const telegramId = req.params.telegramId;
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const days = await prisma.adventDay.findMany({
    orderBy: { day: "asc" },
    include: { media: { orderBy: { position: "asc" } } },
  });
  const progress = await prisma.adventProgress.findMany({
    where: { userId: user.id },
  });
  const pmap = new Map(progress.map((p) => [p.day, p]));
  const current = currentAdventDayNumber();
  const payload = days.map((d) => {
    const { correctIndex: _c, media, ...rest } = d;
    return {
      ...rest,
      quizOptions: d.quizOptions ? JSON.parse(d.quizOptions) : null,
      unlocked: isAdventDayUnlocked(d.day),
      progress: pmap.get(d.day) ?? null,
      media: media.map((m) => ({
        id: m.id,
        kind: m.kind,
        caption: m.caption,
        position: m.position,
        url: `/uploads/${m.filename}`,
      })),
    };
  });
  res.json({ currentAdventDay: current, days: payload });
});

usersRouter.post("/:telegramId/advent/:day/view", async (req, res) => {
  const telegramId = req.params.telegramId;
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "Invalid day" });
    return;
  }
  if (!isAdventDayUnlocked(day)) {
    res.status(403).json({ error: "Day locked" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const row = await prisma.adventProgress.upsert({
    where: { userId_day: { userId: user.id, day } },
    create: { userId: user.id, day, viewedAt: new Date() },
    update: { viewedAt: new Date() },
  });
  res.json(row);
});

const TaskBody = z.object({
  quizAnswerIndex: z.number().optional(),
  confirm: z.boolean().optional(),
});

usersRouter.post("/:telegramId/advent/:day/task", async (req, res) => {
  const telegramId = req.params.telegramId;
  const day = Number(req.params.day);
  const body = TaskBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  if (!isAdventDayUnlocked(day)) {
    res.status(403).json({ error: "Day locked" });
    return;
  }
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const meta = await prisma.adventDay.findUnique({ where: { day } });
  if (!meta) {
    res.status(404).json({ error: "No content" });
    return;
  }
  let ok = false;
  if (meta.taskKind === "QUIZ") {
    const idx = body.data.quizAnswerIndex;
    if (idx === undefined) {
      res.status(400).json({ error: "quizAnswerIndex required" });
      return;
    }
    ok = meta.correctIndex === idx;
  } else if (meta.taskKind === "CONFIRM") {
    ok = body.data.confirm === true;
  }
  if (!ok) {
    res.status(400).json({ error: "wrong_answer" });
    return;
  }
  const row = await prisma.adventProgress.upsert({
    where: { userId_day: { userId: user.id, day } },
    create: {
      userId: user.id,
      day,
      viewedAt: new Date(),
      taskCompletedAt: new Date(),
      quizAnswerIndex: body.data.quizAnswerIndex ?? null,
      confirmDone: meta.taskKind === "CONFIRM",
    },
    update: {
      taskCompletedAt: new Date(),
      quizAnswerIndex: body.data.quizAnswerIndex ?? null,
      confirmDone: meta.taskKind === "CONFIRM",
    },
  });
  res.json(row);
});

usersRouter.post("/:telegramId/trainings/:trainingId", async (req, res) => {
  const telegramId = req.params.telegramId;
  const trainingId = req.params.trainingId;
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const t = await prisma.training.findUnique({ where: { id: trainingId } });
  if (!t) {
    res.status(404).json({ error: "Training not found" });
    return;
  }
  const row = await prisma.trainingSignup.upsert({
    where: {
      userId_trainingId: { userId: user.id, trainingId },
    },
    create: { userId: user.id, trainingId },
    update: {},
  });
  res.json(row);
});

usersRouter.delete("/:telegramId/trainings/:trainingId", async (req, res) => {
  const telegramId = req.params.telegramId;
  const trainingId = req.params.trainingId;
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  await prisma.trainingSignup.deleteMany({
    where: { userId: user.id, trainingId },
  });
  res.json({ ok: true });
});

async function countCompletedDaysInWeek(userId: string, week: 1 | 2 | 3) {
  const { from, to } = adventDaysRangeForWeek(week);
  return prisma.adventProgress.count({
    where: {
      userId,
      day: { gte: from, lte: to },
      taskCompletedAt: { not: null },
    },
  });
}

usersRouter.get("/:telegramId/giveaways", async (req, res) => {
  const telegramId = req.params.telegramId;
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const giveaways = await prisma.giveaway.findMany({ orderBy: { id: "asc" } });
  const entries = await prisma.giveawayEntry.findMany({
    where: { userId: user.id },
  });
  const entrySet = new Set(entries.map((e) => e.giveawayId));
  const totalEntries = entries.length;

  const result = [];
  for (const g of giveaways) {
    const done = await countCompletedDaysInWeek(user.id, g.campaignWeek as 1 | 2 | 3);
    const eligible = done >= g.minDaysInWeek;
    const participated = entrySet.has(g.id);
    const canEnter = eligible && !participated && totalEntries < 3;
    result.push({
      ...g,
      completedDaysInWeek: done,
      eligible,
      participated,
      canEnter,
    });
  }
  res.json({ totalGiveawayEntries: totalEntries, giveaways: result });
});

usersRouter.post("/:telegramId/giveaways/:giveawayId/enter", async (req, res) => {
  const telegramId = req.params.telegramId;
  const giveawayId = Number(req.params.giveawayId);
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const g = await prisma.giveaway.findUnique({ where: { id: giveawayId } });
  if (!g) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const count = await prisma.giveawayEntry.count({ where: { userId: user.id } });
  const existing = await prisma.giveawayEntry.findUnique({
    where: {
      userId_giveawayId: { userId: user.id, giveawayId },
    },
  });
  if (existing) {
    res.json({ ok: true, already: true });
    return;
  }
  if (count >= 3) {
    res.status(400).json({ error: "max_three_giveaways" });
    return;
  }
  const done = await countCompletedDaysInWeek(user.id, g.campaignWeek as 1 | 2 | 3);
  if (done < g.minDaysInWeek) {
    res.status(400).json({ error: "not_eligible", need: g.minDaysInWeek, have: done });
    return;
  }
  await prisma.giveawayEntry.create({
    data: { userId: user.id, giveawayId },
  });
  res.json({ ok: true });
});

usersRouter.get("/:telegramId/reminder-check", async (req, res) => {
  const telegramId = req.params.telegramId;
  const user = await prisma.user.findUnique({ where: { telegramId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const current = currentAdventDayNumber();
  if (current === null) {
    res.json({ shouldRemind: false, reason: "no_active_day" });
    return;
  }
  const prog = await prisma.adventProgress.findUnique({
    where: { userId_day: { userId: user.id, day: current } },
  });
  if (prog?.taskCompletedAt) {
    res.json({ shouldRemind: false, reason: "done" });
    return;
  }
  const hours = Number(process.env.ADVENT_REMINDER_HOURS ?? 24);
  const threshold = Date.now() - hours * 3600000;
  const need =
    !prog ||
    prog.viewedAt.getTime() < threshold ||
    (prog.viewedAt && !prog.taskCompletedAt && prog.viewedAt.getTime() < threshold);
  res.json({
    shouldRemind: !!need && !user.reminderMuted,
    day: current,
  });
});
