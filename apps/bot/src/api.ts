import { botConfig } from "./config.js";

async function j<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${botConfig.apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status} ${path}: ${t}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  upsertUser(p: {
    telegramId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }) {
    return j(`/api/users/upsert`, { method: "POST", body: JSON.stringify(p) });
  },
  advent(telegramId: string) {
    return j(`/api/users/${telegramId}/advent`);
  },
  viewDay(telegramId: string, day: number) {
    return j(`/api/users/${telegramId}/advent/${day}/view`, { method: "POST" });
  },
  task(telegramId: string, day: number, body: object) {
    return j(`/api/users/${telegramId}/advent/${day}/task`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  trainings() {
    return j(`/api/trainings`);
  },
  signupTraining(telegramId: string, trainingId: string) {
    return j(`/api/users/${telegramId}/trainings/${trainingId}`, {
      method: "POST",
    });
  },
  giveaways(telegramId: string) {
    return j(`/api/users/${telegramId}/giveaways`);
  },
  enterGiveaway(telegramId: string, giveawayId: number) {
    return j(`/api/users/${telegramId}/giveaways/${giveawayId}/enter`, {
      method: "POST",
    });
  },
  site() {
    return j<Record<string, string>>(`/api/site`);
  },
  mute(telegramId: string, muted: boolean) {
    return j(`/api/users/${telegramId}/mute`, {
      method: "PATCH",
      body: JSON.stringify({ muted }),
    });
  },
  reminderBatch() {
    const h: Record<string, string> = {};
    if (botConfig.internalKey) h["x-internal-key"] = botConfig.internalKey;
    return j<{ day: number; telegramIds: string[] }>(`/api/internal/reminder-batch`, {
      headers: h,
    });
  },
};
