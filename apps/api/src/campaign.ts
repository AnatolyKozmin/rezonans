import { getCampaignStart, config } from "./config.js";

function parseYmd(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** «Сегодня» в часовом поясе кампании */
export function todayInCampaignTz(now = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: g("year"), m: g("month"), d: g("day") };
}

function utcFromYmd(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

/** Разница в днях между датой старта кампании и «сегодня» (0-based offset) */
export function daysSinceCampaignStart(now = new Date()): number | null {
  const start = parseYmd(config.campaignStartDate);
  const t = todayInCampaignTz(now);
  const a = utcFromYmd(start.y, start.m, start.d);
  const b = utcFromYmd(t.y, t.m, t.d);
  const diff = Math.round((b - a) / 86400000);
  return diff;
}

/** Номер текущего дня кампании 1..21 или null до/после */
export function currentAdventDayNumber(now = new Date()): number | null {
  const diff = daysSinceCampaignStart(now);
  if (diff === null) return null;
  const day = diff + 1;
  if (day < 1 || day > 21) return null;
  return day;
}

/** День N доступен по календарю */
export function isAdventDayUnlocked(day: number, now = new Date()): boolean {
  const cur = currentAdventDayNumber(now);
  if (cur === null) return false;
  return day <= cur;
}

export function campaignWeekForDay(day: number): 1 | 2 | 3 {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  return 3;
}

export function adventDaysRangeForWeek(week: 1 | 2 | 3): { from: number; to: number } {
  if (week === 1) return { from: 1, to: 7 };
  if (week === 2) return { from: 8, to: 14 };
  return { from: 15, to: 21 };
}
