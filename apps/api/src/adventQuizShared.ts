import fs from "node:fs";
import path from "node:path";
import { uploadsRoot } from "./paths.js";

export type OptionRow = { text: string; correct: boolean };

export function parseOptions(q: { optionsJson: string | null }): OptionRow[] {
  if (!q.optionsJson) return [];
  const raw = JSON.parse(q.optionsJson) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => ({
    text: String((o as OptionRow).text ?? ""),
    correct: Boolean((o as OptionRow).correct),
  }));
}

export function parseTextAnswers(q: { textAnswersJson: string | null }): string[] {
  if (!q.textAnswersJson) return [];
  const raw = JSON.parse(q.textAnswersJson) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x));
}

export function checkSingle(
  q: { optionsJson: string | null; acceptAnyAnswer?: boolean | null },
  ans: unknown
): boolean {
  const opts = parseOptions(q);
  if (opts.length < 2) return false;
  const body = ans as { selectedIndex?: number };
  const i = body.selectedIndex;
  if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= opts.length) return false;
  if (q.acceptAnyAnswer) return true;
  const correctCount = opts.filter((o) => o.correct).length;
  if (correctCount !== 1) return false;
  const picked = opts[i];
  return picked ? picked.correct === true : false;
}

export function checkMulti(
  q: { optionsJson: string | null; acceptAnyAnswer?: boolean | null },
  ans: unknown
): boolean {
  const opts = parseOptions(q);
  if (opts.length < 2) return false;
  const body = ans as { selectedIndices?: number[] };
  const sel = body.selectedIndices;
  if (!Array.isArray(sel)) return false;
  const integers = sel.filter((x) => Number.isInteger(x));
  const set = new Set(integers);
  if (q.acceptAnyAnswer) {
    if (set.size < 1) return false;
    for (const i of set) {
      if (i < 0 || i >= opts.length) return false;
    }
    return true;
  }
  const correctIdx = new Set<number>();
  opts.forEach((o, i) => {
    if (o.correct) correctIdx.add(i);
  });
  if (correctIdx.size < 1) return false;
  if (set.size !== correctIdx.size) return false;
  for (const i of correctIdx) {
    if (!set.has(i)) return false;
  }
  for (const i of set) {
    if (i < 0 || i >= opts.length) return false;
  }
  return true;
}

export function checkText(q: { textAnswersJson: string | null; acceptAnyAnswer?: boolean | null }, ans: unknown): boolean {
  const body = ans as { text?: string };
  const t = String(body.text ?? "").trim().toLowerCase();
  if (!t) return false;
  if (q.acceptAnyAnswer) return true;
  const accepted = parseTextAnswers(q);
  if (accepted.length < 1) return false;
  return accepted.some((a) => a.trim().toLowerCase() === t);
}

/** Ответ файлом после загрузки в Mini App (путь под advent/{day}/a/{telegramId}/). */
export function checkImageUpload(day: number, telegramId: string, ans: unknown): boolean {
  const body = ans as { filename?: string };
  const filename = body.filename;
  if (typeof filename !== "string" || !filename.trim()) return false;
  const prefix = `advent/${day}/a/${telegramId}/`;
  if (!filename.startsWith(prefix)) return false;
  if (filename.includes("..")) return false;
  const abs = path.join(uploadsRoot, filename);
  return fs.existsSync(abs);
}

/** Возвращает читаемую метку правильного ответа для показа после сабмита. */
export function correctAnswerLabel(
  q: {
    kind: string;
    acceptAnyAnswer?: boolean | null;
    optionsJson: string | null;
    textAnswersJson: string | null;
  }
): string | null {
  if (q.acceptAnyAnswer) return null;
  if (q.kind === "SINGLE") {
    const opts = parseOptions(q);
    const idx = opts.findIndex((o) => o.correct);
    return idx >= 0 ? opts[idx].text : null;
  }
  if (q.kind === "MULTI") {
    const opts = parseOptions(q);
    const correct = opts.filter((o) => o.correct).map((o) => o.text);
    return correct.length > 0 ? correct.join(", ") : null;
  }
  if (q.kind === "TEXT") {
    const accepted = parseTextAnswers(q);
    return accepted.length > 0 ? accepted[0] : null;
  }
  return null; // IMAGE — файл, нет текстового ответа
}

export function questionForClient(q: {
  id: string;
  position: number;
  prompt: string;
  kind: string;
  acceptAnyAnswer?: boolean | null;
  optionsJson: string | null;
  imageFilename: string | null;
}) {
  const base = {
    id: q.id,
    position: q.position,
    prompt: q.prompt,
    kind: q.kind,
    acceptAnyAnswer: Boolean(q.acceptAnyAnswer),
    imageUrl: q.imageFilename ? `/uploads/${q.imageFilename}` : null as string | null,
  };
  if (q.kind === "SINGLE" || q.kind === "MULTI") {
    const opts = q.optionsJson ? (JSON.parse(q.optionsJson) as OptionRow[]) : [];
    return { ...base, options: opts.map((o) => ({ text: o.text })) };
  }
  return base;
}
