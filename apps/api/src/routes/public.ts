import { Router } from "express";
import { prisma } from "../db.js";
import { config } from "../config.js";
import { currentAdventDayNumber, isAdventDayUnlocked } from "../campaign.js";

export const publicRouter = Router();

publicRouter.get("/site", async (_req, res) => {
  const rows = await prisma.siteContent.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  res.json(map);
});

publicRouter.get("/trainings", async (_req, res) => {
  const list = await prisma.training.findMany({
    orderBy: [{ sortOrder: "asc" }, { startsAt: "asc" }],
  });
  res.json(list);
});

function mapMedia(m: { id: string; kind: string; filename: string; caption: string | null; position: number }) {
  return {
    id: m.id,
    kind: m.kind,
    caption: m.caption,
    position: m.position,
    url: `/uploads/${m.filename}`,
  };
}

/** Публичный адвент для сайта: без ответов квиза, разблокировка по календарю кампании */
publicRouter.get("/advent", async (_req, res) => {
  const rows = await prisma.adventDay.findMany({
    orderBy: { day: "asc" },
    include: {
      media: { orderBy: { position: "asc" } },
      questions: {
        orderBy: { position: "asc" },
        select: { id: true, prompt: true, kind: true },
      },
    },
  });
  const current = currentAdventDayNumber();

  // Миллисекунды до следующей полуночи в TZ кампании
  const nowParts = new Intl.DateTimeFormat("en-US", {
    timeZone: config.tz,
    hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  }).formatToParts(new Date());
  const tzH  = Number(nowParts.find((p) => p.type === "hour")?.value   ?? 0);
  const tzM  = Number(nowParts.find((p) => p.type === "minute")?.value ?? 0);
  const tzS  = Number(nowParts.find((p) => p.type === "second")?.value ?? 0);
  const msUntilMidnight = 86_400_000 - (tzH * 3600 + tzM * 60 + tzS) * 1000;
  const nextDayAt = new Date(Date.now() + msUntilMidnight).toISOString();
  const days = rows.map((d) => {
    const {
      correctIndex: _c,
      quizOptions: qRaw,
      media,
      testImageFilename: tif,
      questions,
      ...rest
    } = d;
    return {
      ...rest,
      quizOptions: qRaw ? JSON.parse(qRaw) : null,
      testImageUrl: tif ? `/uploads/${tif}` : null,
      miniQuiz: questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        kind: q.kind,
      })),
      unlocked: isAdventDayUnlocked(d.day),
      media: media.map(mapMedia),
    };
  });
  res.json({ currentAdventDay: current, nextDayAt, days });
});
