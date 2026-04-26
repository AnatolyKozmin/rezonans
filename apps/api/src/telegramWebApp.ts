import crypto from "node:crypto";

const MAX_AUTH_AGE_SEC = 86400;

/** Проверка подписи initData из Telegram Mini App (см. core.telegram.org/bots/webapps). */
export function validateWebAppInitData(
  initData: string,
  botToken: string
): { telegramId: string; user: Record<string, unknown> } {
  if (!initData?.trim() || !botToken) {
    throw new Error("bad_init");
  }
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("bad_init");

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SEC) {
    throw new Error("stale_init");
  }

  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (calculated !== hash) {
    throw new Error("bad_hash");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("no_user");
  let user: Record<string, unknown>;
  try {
    user = JSON.parse(userRaw) as Record<string, unknown>;
  } catch {
    throw new Error("no_user");
  }
  const id = user.id;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new Error("no_user");
  }
  const telegramId = String(id);
  return { telegramId, user };
}
