import "dotenv/config";

/** Убирает пробелы и внешние кавычки из значения .env (частая ошибка: ADMIN_API_KEY="secret") */
function envString(raw: string | undefined, fallback: string): string {
  let v = (raw ?? "").trim() || fallback;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim() || fallback;
  }
  return v;
}

export const config = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "file:./dev.db",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  publicUrl: process.env.API_PUBLIC_URL ?? "http://localhost:4000",
  campaignStartDate: process.env.CAMPAIGN_START_DATE ?? "2026-04-14",
  tz: process.env.TZ ?? "Europe/Moscow",
  adventReminderHours: Number(process.env.ADVENT_REMINDER_HOURS ?? 24),
  adminApiKey: envString(process.env.ADMIN_API_KEY, "dev-admin-key"),
  adminTelegramIds: (process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export function getCampaignStart(): Date {
  const [y, m, d] = config.campaignStartDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
