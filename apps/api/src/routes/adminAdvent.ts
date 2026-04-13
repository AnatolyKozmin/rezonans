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

const PutDay = z.object({
  title: z.string().optional(),
  materialType: z.string().optional(),
  shortSummary: z.string().optional(),
  articleUrl: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  extraText: z.string().nullable().optional(),
  taskPrompt: z.string().optional(),
  taskKind: z.enum(["QUIZ", "CONFIRM"]).optional(),
  quizOptions: z.array(z.string()).nullable().optional(),
  correctIndex: z.number().nullable().optional(),
});

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
  const body = PutDay.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const d = body.data;
  const row = await prisma.adventDay.update({
    where: { day },
    data: {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.materialType !== undefined && { materialType: d.materialType }),
      ...(d.shortSummary !== undefined && { shortSummary: d.shortSummary }),
      ...(d.articleUrl !== undefined && { articleUrl: d.articleUrl }),
      ...(d.videoUrl !== undefined && { videoUrl: d.videoUrl }),
      ...(d.extraText !== undefined && { extraText: d.extraText }),
      ...(d.taskPrompt !== undefined && { taskPrompt: d.taskPrompt }),
      ...(d.taskKind !== undefined && { taskKind: d.taskKind }),
      ...(d.quizOptions !== undefined && {
        quizOptions: d.quizOptions === null ? null : JSON.stringify(d.quizOptions),
      }),
      ...(d.correctIndex !== undefined && { correctIndex: d.correctIndex }),
    },
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
