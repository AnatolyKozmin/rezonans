import { Router } from "express";
import { prisma } from "../db.js";
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
    include: { media: { orderBy: { position: "asc" } } },
  });
  const current = currentAdventDayNumber();
  const days = rows.map((d) => {
    const { correctIndex: _c, quizOptions: qRaw, media, ...rest } = d;
    return {
      ...rest,
      quizOptions: qRaw ? JSON.parse(qRaw) : null,
      unlocked: isAdventDayUnlocked(d.day),
      media: media.map(mapMedia),
    };
  });
  res.json({ currentAdventDay: current, days });
});
