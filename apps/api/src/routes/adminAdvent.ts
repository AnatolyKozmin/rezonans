import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { adminAuth } from "../middleware.js";
import { uploadsRoot } from "../paths.js";
import { adventUpload, relativeAdventFile } from "../uploadMulter.js";

export const adminAdventRouter = Router();
adminAdventRouter.use(adminAuth);

/** Тело из админки: только контент для сайта. Задание/квиз в БД выставляются фиксированно (без настройки в UI). */
const PutDaySite = z.object({
  title: z.string(),
  materialType: z.string(),
  shortSummary: z.string(),
  articleUrl: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  extraText: z.string().nullable().optional(),
});

/** Нейтральное задание для совместимости API/прогресса; на сайте показывается как подсказка. */
const ADVENT_TASK_BACKEND = {
  taskPrompt: "Ознакомьтесь с материалами дня на сайте.",
  taskKind: "CONFIRM",
  quizOptions: null as string | null,
  correctIndex: null as number | null,
};

function defaultAdventDay(day: number) {
  return {
    title: `День ${day}`,
    materialType: "ARTICLE",
    shortSummary: "",
    articleUrl: null as string | null,
    videoUrl: null as string | null,
    extraText: null as string | null,
    ...ADVENT_TASK_BACKEND,
  };
}

function adventDayPayloadFromSite(d: z.infer<typeof PutDaySite>) {
  return {
    title: d.title,
    materialType: d.materialType,
    shortSummary: d.shortSummary,
    articleUrl: d.articleUrl ?? null,
    videoUrl: d.videoUrl ?? null,
    extraText: d.extraText ?? null,
    ...ADVENT_TASK_BACKEND,
  };
}

const Kind = z.enum(["IMAGE", "IMAGE_TEXT", "VIDEO"]);

adminAdventRouter.get("/days", async (_req, res) => {
  const days = await prisma.adventDay.findMany({
    orderBy: { day: "asc" },
    include: { media: { orderBy: { position: "asc" } } },
  });
  res.json(days);
});

adminAdventRouter.get("/days/:day", async (req, res) => {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "invalid day" });
    return;
  }
  const row = await prisma.adventDay.findUnique({
    where: { day },
    include: { media: { orderBy: { position: "asc" } } },
  });
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.json(row);
});

adminAdventRouter.put("/days/:day", async (req, res) => {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "invalid day" });
    return;
  }
  const body = PutDaySite.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const data = adventDayPayloadFromSite(body.data);
  const row = await prisma.adventDay.upsert({
    where: { day },
    create: { day, ...data },
    update: data,
    include: { media: { orderBy: { position: "asc" } } },
  });
  res.json(row);
});

adminAdventRouter.post(
  "/days/:day/media",
  (req, res, next) => {
    const day = Number(req.params.day);
    if (!Number.isInteger(day) || day < 1 || day > 21) {
      res.status(400).json({ error: "invalid day" });
      return;
    }
    adventUpload(day).single("file")(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ error: String((err as Error).message ?? err) });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const day = Number(req.params.day);
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "file required" });
      return;
    }
    const kind = Kind.safeParse(req.body?.kind);
    if (!kind.success) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: "kind must be IMAGE | IMAGE_TEXT | VIDEO" });
      return;
    }
    const inferred = kind.data;
    if ((inferred === "IMAGE" || inferred === "IMAGE_TEXT") && !file.mimetype.startsWith("image/")) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: "для фото загрузите изображение" });
      return;
    }
    if (inferred === "VIDEO" && !file.mimetype.startsWith("video/")) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: "для видео загрузите видеофайл" });
      return;
    }

    const captionRaw =
      typeof req.body?.caption === "string" && req.body.caption.trim()
        ? req.body.caption.trim()
        : null;
    if (inferred === "IMAGE_TEXT" && !captionRaw) {
      fs.unlinkSync(file.path);
      res.status(400).json({ error: "для «фото с текстом» укажите подпись" });
      return;
    }

    await prisma.adventDay.upsert({
      where: { day },
      create: { day, ...defaultAdventDay(day) },
      update: {},
    });

    const rel = relativeAdventFile(day, file.filename);
    const maxPos = await prisma.adventDayMedia.aggregate({
      where: { day },
      _max: { position: true },
    });
    const position = (maxPos._max.position ?? -1) + 1;

    const media = await prisma.adventDayMedia.create({
      data: {
        day,
        kind: inferred,
        filename: rel,
        caption: captionRaw,
        position,
      },
    });
    res.json(media);
  }
);

const PatchMediaCaption = z.object({
  caption: z.string().nullable(),
});

adminAdventRouter.patch("/media/:id", async (req, res) => {
  const id = req.params.id;
  const body = PatchMediaCaption.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const row = await prisma.adventDayMedia.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const cap =
    body.data.caption === null ? null : String(body.data.caption).trim() || null;
  if (row.kind === "IMAGE_TEXT" && !cap) {
    res.status(400).json({ error: "для «фото с текстом» подпись обязательна" });
    return;
  }
  const updated = await prisma.adventDayMedia.update({
    where: { id },
    data: { caption: cap },
  });
  res.json(updated);
});

adminAdventRouter.delete("/media/:id", async (req, res) => {
  const id = req.params.id;
  const row = await prisma.adventDayMedia.findUnique({ where: { id } });
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const abs = path.join(uploadsRoot, row.filename);
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
  await prisma.adventDayMedia.delete({ where: { id } });
  res.json({ ok: true });
});
