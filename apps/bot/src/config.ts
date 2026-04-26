import "dotenv/config";

export const botConfig = {
  token: process.env.TELEGRAM_BOT_TOKEN ?? "",
  apiBase: process.env.API_BASE_URL ?? "http://localhost:4000",
  internalKey: process.env.INTERNAL_API_KEY ?? "",
  webUrl: process.env.PUBLIC_WEB_URL ?? "http://localhost:5173",
  /** https://t.me/bot_username/short_name — открытие Mini App по нажатию дня (без сообщений в чат) */
  miniAppTmeBase: (process.env.TELEGRAM_MINIAPP_TME ?? "").trim(),
};

if (!botConfig.token) {
  console.warn("TELEGRAM_BOT_TOKEN is empty — set it in apps/bot/.env");
}
