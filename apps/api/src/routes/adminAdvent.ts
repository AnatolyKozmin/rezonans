import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { prisma } from "../db.js";
import { adminAuth } from "../middleware.js";
import { uploadsRoot } from "../paths.js";
import { adventUpload, adventTestImageUpload, relativeAdventFile } from "../uploadMulter.js";

export const adminAdventRouter = Router();
adminAdventRouter.use(adminAuth);

const PutDaySite = z.object({
  title: z.string(),
  materialType: z.string(),
  shortSummary: z.string(),
  articleUrl: z.string().nullable().optional(),
  videoUrl: z.string().nullable().optional(),
  extraText: z.string().nullable().optional(),
  taskPrompt: z.string().optional(),
});

function defaultAdventDay(day: number) {
  return {
    title: `День ${day}`,
    materialType: "ARTICLE",
    shortSummary: "",
    articleUrl: null as string | null,
    videoUrl: null as string | null,
    extraText: null as string | null,
    taskPrompt: "",
    taskKind: "CONFIRM",
    quizOptions: null as string | null,
    correctIndex: null as number | null,
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
    taskPrompt: d.taskPrompt ?? "",
    taskKind: "CONFIRM",
    quizOptions: null,
    correctIndex: null,
  };
}

const QuestionIn = z.object({
  prompt: z.string().min(1),
  kind: z.enum(["SINGLE", "MULTI", "TEXT", "IMAGE"]),
  acceptAnyAnswer: z.boolean().optional(),
  options: z
    .array(z.object({ text: z.string().min(1), correct: z.boolean() }))
    .optional(),
  textAnswers: z.array(z.string()).optional(),
});

const PutQuestionsBody = z
  .object({
    questions: z.array(QuestionIn),
  })
  .superRefine((data, ctx) => {
    data.questions.forEach((q, i) => {
      const anyOk = q.acceptAnyAnswer === true;
      if (q.kind === "SINGLE" || q.kind === "MULTI") {
        const opts = q.options ?? [];
        if (opts.length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Нужно минимум 2 варианта",
            path: ["questions", i, "options"],
          });
        }
        if (!anyOk) {
          const correctN = opts.filter((o) => o.correct).length;
          if (q.kind === "SINGLE" && correctN !== 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Один вариант должен быть отмечен как верный",
              path: ["questions", i],
            });
          }
          if (q.kind === "MULTI" && correctN < 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Отметьте хотя бы один верный вариант",
              path: ["questions", i],
            });
          }
        }
      }
      if (q.kind === "TEXT") {
        const ta = (q.textAnswers ?? []).map((t) => t.trim()).filter(Boolean);
        if (!anyOk && ta.length < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Укажите эталонные ответы (минимум один)",
            path: ["questions", i, "textAnswers"],
          });
        }
      }
    });
  });

function unlinkUploadRel(rel: string | null | undefined) {
  if (!rel) return;
  const abs = path.join(uploadsRoot, rel);
  if (fs.existsSync(abs)) {
    try {
      fs.unlinkSync(abs);
    } catch {
      /* ignore */
    }
  }
}

const Kind = z.enum(["IMAGE", "IMAGE_TEXT", "VIDEO"]);

adminAdventRouter.get("/days", async (_req, res) => {
  const days = await prisma.adventDay.findMany({
    orderBy: { day: "asc" },
    include: {
      media: { orderBy: { position: "asc" } },
      questions: { orderBy: { position: "asc" } },
    },
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
    include: {
      media: { orderBy: { position: "asc" } },
      questions: { orderBy: { position: "asc" } },
    },
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
    include: {
      media: { orderBy: { position: "asc" } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  res.json(row);
});

adminAdventRouter.put("/days/:day/questions", async (req, res) => {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "invalid day" });
    return;
  }
  const body = PutQuestionsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  await prisma.adventDay.upsert({
    where: { day },
    create: { day, ...defaultAdventDay(day) },
    update: {},
  });

  await prisma.$transaction(async (tx) => {
    await tx.adventQuestion.deleteMany({ where: { day } });
    for (let i = 0; i < body.data.questions.length; i++) {
      const q = body.data.questions[i];
      await tx.adventQuestion.create({
        data: {
          day,
          position: i,
          prompt: q.prompt,
          kind: q.kind,
          acceptAnyAnswer: q.acceptAnyAnswer === true,
          optionsJson:
            q.kind === "SINGLE" || q.kind === "MULTI"
              ? JSON.stringify(q.options ?? [])
              : null,
          textAnswersJson:
            q.kind === "TEXT"
              ? JSON.stringify(
                  (q.textAnswers ?? [])
                    .map((t) => t.trim())
                    .filter(Boolean)
                )
              : null,
          imageFilename: null,
        },
      });
    }
  });

  const row = await prisma.adventDay.findUnique({
    where: { day },
    include: {
      media: { orderBy: { position: "asc" } },
      questions: { orderBy: { position: "asc" } },
    },
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

adminAdventRouter.post(
  "/days/:day/test-image",
  (req, res, next) => {
    const day = Number(req.params.day);
    if (!Number.isInteger(day) || day < 1 || day > 21) {
      res.status(400).json({ error: "invalid day" });
      return;
    }
    adventTestImageUpload(day).single("file")(req, res, (err: unknown) => {
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

    const rel = relativeAdventFile(day, file.filename);
    const prev = await prisma.adventDay.findUnique({ where: { day } });
    if (prev?.testImageFilename && prev.testImageFilename !== rel) {
      unlinkUploadRel(prev.testImageFilename);
    }

    const updated = await prisma.adventDay.upsert({
      where: { day },
      create: { day, ...defaultAdventDay(day), testImageFilename: rel },
      update: { testImageFilename: rel },
      include: {
        media: { orderBy: { position: "asc" } },
        questions: { orderBy: { position: "asc" } },
      },
    });
    res.json(updated);
  }
);

adminAdventRouter.delete("/days/:day/test-image", async (req, res) => {
  const day = Number(req.params.day);
  if (!Number.isInteger(day) || day < 1 || day > 21) {
    res.status(400).json({ error: "invalid day" });
    return;
  }
  const row = await prisma.adventDay.findUnique({ where: { day } });
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  unlinkUploadRel(row.testImageFilename);
  const updated = await prisma.adventDay.update({
    where: { day },
    data: { testImageFilename: null },
    include: {
      media: { orderBy: { position: "asc" } },
      questions: { orderBy: { position: "asc" } },
    },
  });
  res.json(updated);
});
