import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { isAdventDayUnlocked, isAdventDayUnlockedForUser, effectiveAdventDayForUser, currentAdventDayNumber } from "../campaign.js";
import {
  checkImageUpload,
  checkMulti,
  checkSingle,
  checkText,
  correctAnswerLabel,
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

function normalizeActorId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "");
}

/** Состояние теста для Mini App */
miniAdventRouter.get("/advent/:day", async (req, res) => {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "bad_day" });
    return;
  }

  const initData = String(req.query.initData ?? "");
  let user: Awaited<ReturnType<typeof upsertUserFromTelegram>> | null = null;
  if (initData) {
    const token = requireBotToken(res);
    if (!token) return;
    try {
      const v = validateWebAppInitData(initData, token);
      user = await upsertUserFromTelegram(v.telegramId, v.user);
    } catch {
      res.status(401).json({ error: "bad_init" });
      return;
    }
  }

  // Персональный unlock: если день не открыт глобально — проверяем дату первого входа
  const globalUnlocked = isAdventDayUnlocked(day);
  if (!globalUnlocked) {
    if (!user) { res.status(403).json({ error: "locked" }); return; }
    const u = await prisma.user.findUnique({ where: { telegramId: user.telegramId }, select: { miniAppFirstOpenAt: true } });
    if (!isAdventDayUnlockedForUser(day, u?.miniAppFirstOpenAt ?? null)) {
      res.status(403).json({ error: "locked" }); return;
    }
  }

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

  // Дней без теста — только контент
  if (questions.length === 0) {
    res.json({ completed: false, day, dayContent, questions: [], hasQuiz: false });
    return;
  }

  if (user) {
    const prog = await prisma.adventProgress.findUnique({
      where: { userId_day: { userId: user.id, day } },
    });
    if (prog?.taskCompletedAt) {
      res.json({ completed: true, day, dayContent, hasQuiz: true });
      return;
    }
  }

  res.json({
    completed: false,
    day,
    dayContent,
    hasQuiz: true,
    questions: questions.map((q) => questionForClient(q)),
  });
});

/** Аналитика: фиксируем открытие страницы Mini App */
miniAdventRouter.post("/ping", async (req, res) => {
  const { initData, sessionId, page } = req.body as { initData?: string; sessionId?: string; page?: string };
  let telegramId: string | null = null;
  if (initData) {
    const token = config.telegramBotToken;
    if (token) {
      try {
        const v = validateWebAppInitData(initData, token);
        telegramId = v.telegramId;
      } catch { /* игнорируем невалидный initData */ }
    }
  }

  // Сохраняем miniAppFirstOpenAt при первом входе
  if (telegramId) {
    await prisma.user.updateMany({
      where: { telegramId, miniAppFirstOpenAt: null },
      data: { miniAppFirstOpenAt: new Date() },
    });
  }

  await prisma.miniAppOpen.create({
    data: { telegramId, sessionId: sessionId ?? null, page: page ?? "home" },
  });
  res.json({ ok: true });
});

/** Список дней с персональным прогрессом для Mini App Home */
miniAdventRouter.get("/days", async (req, res) => {
  const initData = String(req.query.initData ?? "");
  let firstOpenAt: Date | null = null;

  if (initData) {
    const token = config.telegramBotToken;
    if (token) {
      try {
        const v = validateWebAppInitData(initData, token);
        const user = await prisma.user.findUnique({
          where: { telegramId: v.telegramId },
          select: { miniAppFirstOpenAt: true },
        });
        firstOpenAt = user?.miniAppFirstOpenAt ?? null;
      } catch { /* анонимный пользователь */ }
    }
  }

  const days = await prisma.adventDay.findMany({
    orderBy: { day: "asc" },
    include: { _count: { select: { questions: true } } },
  });

  const currentDay = currentAdventDayNumber();
  const effectiveDay = effectiveAdventDayForUser(firstOpenAt);

  res.json({
    currentAdventDay: currentDay,
    effectiveAdventDay: effectiveDay,
    days: days.map((d) => ({
      day: d.day,
      title: d.title,
      materialType: d.materialType,
      shortSummary: d.shortSummary,
      unlocked: isAdventDayUnlockedForUser(d.day, firstOpenAt),
      hasQuiz: d._count.questions > 0,
    })),
  });
});

const SubmitBody = z.object({
  initData: z.string().optional(),
  sessionId: z.string().optional(),
  answers: z.record(z.unknown()),
});

miniAdventRouter.post("/advent/:day/submit", async (req, res) => {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "bad_day" });
    return;
  }

  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  let user: Awaited<ReturnType<typeof upsertUserFromTelegram>> | null = null;
  let actorId = "";
  if (parsed.data.initData) {
    const token = requireBotToken(res);
    if (!token) return;
    try {
      const v = validateWebAppInitData(parsed.data.initData, token);
      user = await upsertUserFromTelegram(v.telegramId, v.user);
      actorId = normalizeActorId(v.telegramId);
    } catch {
      res.status(401).json({ error: "bad_init" });
      return;
    }
  } else {
    actorId = normalizeActorId(parsed.data.sessionId ?? "");
    if (!actorId) {
      res.status(400).json({ error: "session_required" });
      return;
    }
  }

  // Персональный unlock
  if (!isAdventDayUnlocked(day)) {
    if (!user) { res.status(403).json({ error: "locked" }); return; }
    const u = await prisma.user.findUnique({ where: { telegramId: user.telegramId }, select: { miniAppFirstOpenAt: true } });
    if (!isAdventDayUnlockedForUser(day, u?.miniAppFirstOpenAt ?? null)) {
      res.status(403).json({ error: "locked" }); return;
    }
  }

  const questions = await prisma.adventQuestion.findMany({
    where: { day },
    orderBy: { position: "asc" },
  });
  if (questions.length === 0) {
    res.status(400).json({ error: "no_questions" });
    return;
  }

  if (user) {
    const prog = await prisma.adventProgress.findUnique({
      where: { userId_day: { userId: user.id, day } },
    });
    if (prog?.taskCompletedAt) {
      res.json({ ok: true, already: true });
      return;
    }
  }

  const { answers } = parsed.data;
  const built: Record<string, unknown> = {};

  type ResultItem = {
    questionId: string;
    prompt: string;
    correct: boolean;
    correctAnswer: string | null;
  };
  const results: ResultItem[] = [];
  let score = 0;

  for (const q of questions) {
    const ans = answers[q.id];
    let correct = false;

    if (ans !== undefined) {
      if (q.kind === "SINGLE") correct = checkSingle(q, ans);
      else if (q.kind === "MULTI") correct = checkMulti(q, ans);
      else if (q.kind === "TEXT") correct = checkText(q, ans);
      else if (q.kind === "IMAGE") correct = checkImageUpload(day, actorId, ans);
    }

    if (correct) score++;
    built[q.id] = ans;

    results.push({
      questionId: q.id,
      prompt: q.prompt,
      correct,
      correctAnswer: correct ? null : correctAnswerLabel(q),
    });
  }

  if (user) {
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
  }

  res.json({ ok: true, score, total: questions.length, results });
});

miniAdventRouter.post("/advent/:day/question/:qId/image", (req, res, next) => {
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
  const sessionId = String(req.query.sessionId ?? "");
  let actorId = "";
  if (initData) {
    const token = requireBotToken(res);
    if (!token) return;
    try {
      actorId = normalizeActorId(validateWebAppInitData(initData, token).telegramId);
    } catch {
      res.status(401).json({ error: "bad_init" });
      return;
    }
  } else {
    actorId = normalizeActorId(sessionId);
    if (!actorId) {
      res.status(400).json({ error: "session_required" });
      return;
    }
  }

  const upload = adventAnswerImageUpload(day, actorId);
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
        const rel = relativeAdventAnswerFile(day, actorId, file.filename);
        res.json({ filename: rel });
      } catch (e) {
        next(e);
      }
    })();
  });
});
