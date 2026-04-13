import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { adminAuth } from "../middleware.js";
import crypto from "node:crypto";

export const adminRouter = Router();
adminRouter.use(adminAuth);

const AdventSeed = z.object({
  day: z.number(),
  title: z.string(),
  materialType: z.string(),
  shortSummary: z.string(),
  articleUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  extraText: z.string().optional(),
  taskPrompt: z.string(),
  taskKind: z.enum(["QUIZ", "CONFIRM"]),
  quizOptions: z.array(z.string()).optional(),
  correctIndex: z.number().optional(),
});

adminRouter.post("/advent-days", async (req, res) => {
  const arr = z.array(AdventSeed).safeParse(req.body);
  if (!arr.success) {
    res.status(400).json({ error: arr.error.flatten() });
    return;
  }
  for (const row of arr.data) {
    await prisma.adventDay.upsert({
      where: { day: row.day },
      create: {
        day: row.day,
        title: row.title,
        materialType: row.materialType,
        shortSummary: row.shortSummary,
        articleUrl: row.articleUrl,
        videoUrl: row.videoUrl,
        extraText: row.extraText,
        taskPrompt: row.taskPrompt,
        taskKind: row.taskKind,
        quizOptions: row.quizOptions ? JSON.stringify(row.quizOptions) : null,
        correctIndex: row.correctIndex ?? null,
      },
      update: {
        title: row.title,
        materialType: row.materialType,
        shortSummary: row.shortSummary,
        articleUrl: row.articleUrl,
        videoUrl: row.videoUrl,
        extraText: row.extraText,
        taskPrompt: row.taskPrompt,
        taskKind: row.taskKind,
        quizOptions: row.quizOptions ? JSON.stringify(row.quizOptions) : null,
        correctIndex: row.correctIndex ?? null,
      },
    });
  }
  res.json({ ok: true, count: arr.data.length });
});

adminRouter.post("/giveaways/:id/pick-winners", async (req, res) => {
  const id = Number(req.params.id);
  const count = Number(req.query.count ?? 1);
  const g = await prisma.giveaway.findUnique({
    where: { id },
    include: { entries: { include: { user: true } } },
  });
  if (!g) {
    res.status(404).json({ error: "not found" });
    return;
  }
  if (g.entries.length === 0) {
    res.status(400).json({ error: "no_entries" });
    return;
  }
  const pool = [...g.entries];
  const winners: { telegramId: string; userId: string }[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = crypto.randomInt(0, pool.length);
    const w = pool.splice(idx, 1)[0];
    winners.push({ telegramId: w.user.telegramId, userId: w.userId });
  }
  await prisma.giveaway.update({
    where: { id },
    data: { winnersPicked: true },
  });
  res.json({ giveawayId: id, winners });
});
