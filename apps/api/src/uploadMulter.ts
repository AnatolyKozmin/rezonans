import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { uploadsRoot } from "./paths.js";

function destForDay(day: number) {
  const dir = path.join(uploadsRoot, "advent", String(day));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function adventUpload(day: number) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, destForDay(day));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".bin";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 120 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
        cb(null, true);
        return;
      }
      cb(new Error("Недопустимый тип файла. Загрузите изображение или видео."));
    },
  });
}

/** Относительный путь для БД и URL: advent/3/filename.jpg */
export function relativeAdventFile(day: number, filename: string): string {
  return path.join("advent", String(day), filename).split(path.sep).join("/");
}

/** Фото-ответ: advent/{day}/a/{actorId}/… */
export function adventAnswerImageUpload(day: number, actorId: string) {
  const safeActor = actorId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeActor) {
    throw new Error("bad_actor_id");
  }
  const dir = path.join(uploadsRoot, "advent", String(day), "a", safeActor);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
        return;
      }
      cb(new Error("Загрузите изображение (JPEG, PNG и т.п.)."));
    },
  });
}

/** Относительный путь файла ответа для checkImageUpload */
export function relativeAdventAnswerFile(day: number, actorId: string, filename: string): string {
  const safeActor = actorId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join("advent", String(day), "a", safeActor, filename).split(path.sep).join("/");
}

/** Одно изображение к тесту дня (не карусель). */
export function adventTestImageUpload(day: number) {
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, destForDay(day));
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
      cb(null, `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
        return;
      }
      cb(new Error("Загрузите изображение (JPEG, PNG и т.п.)."));
    },
  });
}
