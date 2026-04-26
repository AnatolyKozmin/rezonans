import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { isAdventDayUnlocked } from "../campaign.js";
import {
  checkImageUpload,
  checkMulti,
  checkSingle,
  checkText,
  questionForClient,
} from "../adventQuizShared.js";
import { validateWebAppInitData } from "../telegramWebApp.js";
import { adventAnswerImageUpload, relativeAdventAnswerFile } from "../uploadMulter.js";

export const miniAdventRouter = Router();

function requireBotToken(res: import("express").Response): string | null {
  const t = config.telegramBotToken;
  if (!t) {
    res.status(503).json({ error: "mini_unconfigured" });
    return null;
  }
  return t;
}

function dayContentForMini(dayRow: {
  title: string;
  shortSummary: string;
  materialType: string;
  extraText: string | null;
  articleUrl: string | null;
  videoUrl: string | null;
  taskPrompt: string;
  testImageFilename: string | null;
  media: Array<{
    id: string;
    kind: string;
    filename: string;
    caption: string | null;
    position: number;
  }>;
}) {
  return {
    title: dayRow.title,
    shortSummary: dayRow.shortSummary,
    materialType: dayRow.materialType,
    extraText: dayRow.extraText,
    articleUrl: dayRow.articleUrl,
    videoUrl: dayRow.videoUrl,
    taskPrompt: dayRow.taskPrompt,
    testImageUrl: dayRow.testImageFilename ? `/uploads/${dayRow.testImageFilename}` : null,
    media: dayRow.media.map((m) => ({
      id: m.id,
      kind: m.kind,
      caption: m.caption,
      position: m.position,
      url: `/uploads/${m.filename}`,
    })),
  };
}

async function upsertUserFromTelegram(telegramId: string, user: Record<string, unknown>) {
  const username = typeof user.username === "string" ? user.username : undefined;
  const firstName = typeof user.first_name === "string" ? user.first_name : undefined;
  const lastName = typeof user.last_name === "string" ? user.last_name : undefined;
  return prisma.user.upsert({
    where: { telegramId },
    create: {
      telegramId,
      username,
      firstName,
      lastName,
      lastActivityAt: new Date(),
    },
    update: {
      username,
      firstName,
      lastName,
      lastActivityAt: new Date(),
    },
  });
}

/** Состояние теста для Mini App */
miniAdventRouter.get("/advent/:day", async (req, res) => {
  const token = requireBotToken(res);
  if (!token) return;

  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "bad_day" });
    return;
  }
  if (!isAdventDayUnlocked(day)) {
    res.status(403).json({ error: "locked" });
    return;
  }

  const initData = String(req.query.initData ?? "");
  let telegramId: string;
  let userPayload: Record<string, unknown>;
  try {
    const v = validateWebAppInitData(initData, token);
    telegramId = v.telegramId;
    userPayload = v.user;
  } catch {
    res.status(401).json({ error: "bad_init" });
    return;
  }

  const user = await upsertUserFromTelegram(telegramId, userPayload);

  const dayRow = await prisma.adventDay.findUnique({
    where: { day },
    include: { media: { orderBy: { position: "asc" } } },
  });
  if (!dayRow) {
    res.status(404).json({ error: "no_day" });
    return;
  }

  const dayContent = dayContentForMini(dayRow);

  const questions = await prisma.adventQuestion.findMany({
    where: { day },
    orderBy: { position: "asc" },
  });
  if (questions.length === 0) {
    res.status(400).json({ error: "no_questions" });
    return;
  }

  const prog = await prisma.adventProgress.findUnique({
    where: { userId_day: { userId: user.id, day } },
  });
  if (prog?.taskCompletedAt) {
    res.json({ completed: true, day, dayContent });
    return;
  }

  res.json({
    completed: false,
    day,
    dayContent,
    questions: questions.map((q) => questionForClient(q)),
  });
});

const SubmitBody = z.object({
  initData: z.string(),
  answers: z.record(z.unknown()),
});

miniAdventRouter.post("/advent/:day/submit", async (req, res) => {
  const token = requireBotToken(res);
  if (!token) return;

  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "bad_day" });
    return;
  }
  if (!isAdventDayUnlocked(day)) {
    res.status(403).json({ error: "locked" });
    return;
  }

  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  let telegramId: string;
  let userPayload: Record<string, unknown>;
  try {
    const v = validateWebAppInitData(parsed.data.initData, token);
    telegramId = v.telegramId;
    userPayload = v.user;
  } catch {
    res.status(401).json({ error: "bad_init" });
    return;
  }

  const user = await upsertUserFromTelegram(telegramId, userPayload);

  const questions = await prisma.adventQuestion.findMany({
    where: { day },
    orderBy: { position: "asc" },
  });
  if (questions.length === 0) {
    res.status(400).json({ error: "no_questions" });
    return;
  }

  const prog = await prisma.adventProgress.findUnique({
    where: { userId_day: { userId: user.id, day } },
  });
  if (prog?.taskCompletedAt) {
    res.json({ ok: true, already: true });
    return;
  }

  const { answers } = parsed.data;
  const built: Record<string, unknown> = {};

  for (const q of questions) {
    const ans = answers[q.id];
    if (ans === undefined) {
      res.status(400).json({ error: "missing_answer", questionId: q.id });
      return;
    }
    let ok = false;
    if (q.kind === "SINGLE") ok = checkSingle(q, ans);
    else if (q.kind === "MULTI") ok = checkMulti(q, ans);
    else if (q.kind === "TEXT") ok = checkText(q, ans);
    else if (q.kind === "IMAGE") ok = checkImageUpload(day, telegramId, ans);
    else {
      res.status(500).json({ error: "bad_question_kind" });
      return;
    }
    if (!ok) {
      res.status(400).json({ error: "wrong_answer", questionId: q.id });
      return;
    }
    built[q.id] = ans as unknown;
  }

  await prisma.adventProgress.upsert({
    where: { userId_day: { userId: user.id, day } },
    create: {
      userId: user.id,
      day,
      viewedAt: new Date(),
      taskCompletedAt: new Date(),
      miniQuizAnswersJson: JSON.stringify(built),
      confirmDone: true,
    },
    update: {
      taskCompletedAt: new Date(),
      miniQuizAnswersJson: JSON.stringify(built),
      confirmDone: true,
    },
  });

  res.json({ ok: true });
});

miniAdventRouter.post("/advent/:day/question/:qId/image", (req, res, next) => {
  const token = requireBotToken(res);
  if (!token) return;

  const day = Number(req.params.day);
  const qId = req.params.qId;
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "bad_day" });
    return;
  }
  if (!isAdventDayUnlocked(day)) {
    res.status(403).json({ error: "locked" });
    return;
  }

  const initData = String(req.query.initData ?? "");
  let telegramId: string;
  try {
    telegramId = validateWebAppInitData(initData, token).telegramId;
  } catch {
    res.status(401).json({ error: "bad_init" });
    return;
  }

  const upload = adventAnswerImageUpload(day, telegramId);
  upload.single("image")(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: String(err.message || err) });
      return;
    }
    void (async () => {
      try {
        const file = req.file;
        if (!file) {
          res.status(400).json({ error: "no_file" });
          return;
        }
        const q = await prisma.adventQuestion.findFirst({
          where: { id: qId, day },
        });
        if (!q || q.kind !== "IMAGE") {
          res.status(400).json({ error: "bad_question" });
          return;
        }
        const rel = relativeAdventAnswerFile(day, telegramId, file.filename);
        res.json({ filename: rel });
      } catch (e) {
        next(e);
      }
    })();
  });
});
