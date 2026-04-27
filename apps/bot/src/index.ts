import { Telegraf, Markup, type Context } from "telegraf";
import cron from "node-cron";
import { botConfig } from "./config.js";
import { api } from "./api.js";

const bot = new Telegraf(botConfig.token);

const mainKb = Markup.keyboard([
  ["❓ Вопрос-ответ", "🛟 Поддержка"],
  ["📱 Мини-апп", "📍 Маршрут до места"],
]).resize();

// ─── Онбординг: состояние ожидания ввода ─────────────────────────────────────
type OnboardStep = "name" | "age" | "university";
const waitingFor = new Map<string, OnboardStep>();

async function isBotAdmin(telegramId: string): Promise<boolean> {
  const r = await fetch(`${botConfig.apiBase}/api/admin/bot/admins`, {
    headers: { "x-admin-key": botConfig.adminKey },
  });
  if (!r.ok) return false;
  const admins = await r.json() as { telegramId: string }[];
  return admins.some((a) => a.telegramId === telegramId);
}

async function ensureUser(ctx: { from?: { id: number; username?: string; first_name?: string; last_name?: string } }) {
  const f = ctx.from;
  if (!f) throw new Error("no user");
  const u = await api.upsertUser({
    telegramId: String(f.id),
    username: f.username,
    firstName: f.first_name,
    lastName: f.last_name,
  });
  return { tid: String(f.id), profile: u };
}

async function askConsent(ctx: Context) {
  await ctx.reply(
    "👋 Привет! Прежде чем начать — нам нужно твоё согласие на обработку персональных данных.\n\n" +
      "Мы сохраним твои ФИО, возраст и ВУЗ для организации кампании «Резонанс». " +
      "Данные используются только внутри проекта и не передаются третьим лицам.",
    Markup.inlineKeyboard([[Markup.button.callback("✅ Да, согласен(на)", "pd_consent")]])
  );
}

async function askName(ctx: Context, tid: string) {
  waitingFor.set(tid, "name");
  await ctx.reply("Отлично! Теперь введи своё *ФИО* (Фамилия Имя Отчество):", {
    parse_mode: "Markdown",
    ...Markup.removeKeyboard(),
  });
}

async function askAge(ctx: Context, tid: string) {
  waitingFor.set(tid, "age");
  await ctx.reply("Сколько тебе лет?");
}

async function askUniversity(ctx: Context, tid: string) {
  waitingFor.set(tid, "university");
  await ctx.reply("В каком ВУЗе ты учишься или работаешь?");
}

async function finishOnboarding(ctx: Context) {
  await ctx.reply(
    "✅ Всё готово! Добро пожаловать в кампанию «Резонанс» 🎉\n\nВот главное меню:",
    mainKb
  );
}

/** Прямая ссылка Mini App: https://t.me/bot/short?startapp=day */
function buildMiniAppTmeLink(base: string | undefined, day: number): string | null {
  const raw = base?.trim() ?? "";
  if (!raw) return null;
  let href = raw;
  if (/^t\.me\//i.test(href)) href = `https://${href}`;
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    if (!(host === "t.me" || host === "telegram.me" || host.endsWith(".t.me"))) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    u.searchParams.set("startapp", String(day));
    return u.toString();
  } catch {
    return null;
  }
}

type AdventDayPayload = {
  day: number;
  title: string;
  shortSummary: string;
  materialType: string;
  articleUrl?: string | null;
  videoUrl?: string | null;
  extraText?: string | null;
  taskPrompt: string;
  taskKind: string;
  quizOptions: string[] | null;
  testImageUrl?: string | null;
  miniQuizQuestionCount?: number;
  unlocked: boolean;
  progress: { taskCompletedAt: string | null } | null;
};

/** Дни без квиза в БД — задание и кнопки остаются в чате */
async function replyLegacyAdventDay(ctx: Context, d: AdventDayPayload, day: number) {
  const testPhotoUrl = d.testImageUrl
    ? new URL(d.testImageUrl, botConfig.apiBase).toString()
    : null;

  let text =
    `📌 *${d.title}*\n_${d.shortSummary}_\n\n` + (d.extraText ? `${d.extraText}\n\n` : "");
  if (d.articleUrl) text += `📰 Статья: ${d.articleUrl}\n`;
  if (d.videoUrl) text += `🎬 Видео: ${d.videoUrl}\n`;

  const promptLine = d.taskPrompt.trim();
  if (promptLine) text += `\n*Задание:* ${promptLine}`;
  else text += `\n*Задание:* подтвердите выполнение кнопкой ниже.`;

  const captionMax = 1024;
  const doneSuffix = "\n\n✅ Задание уже выполнено.";

  const sendDone = async () => {
    const full = text + doneSuffix;
    if (testPhotoUrl && full.length <= captionMax) {
      await ctx.replyWithPhoto(testPhotoUrl, {
        caption: full,
        parse_mode: "Markdown",
      });
    } else if (testPhotoUrl) {
      await ctx.replyWithPhoto(testPhotoUrl, {
        caption: "Иллюстрация",
      });
      await ctx.reply(full, { parse_mode: "Markdown" });
    } else {
      await ctx.reply(full, { parse_mode: "Markdown" });
    }
  };

  if (d.progress?.taskCompletedAt) {
    await sendDone();
    return;
  }

  const confirmKb = Markup.inlineKeyboard([[Markup.button.callback("Подтверждаю", `conf:${day}`)]]);
  const quizKb =
    d.taskKind === "QUIZ" && d.quizOptions?.length
      ? (() => {
          const keys = d.quizOptions.map((_, i) =>
            Markup.button.callback(`Вариант ${i + 1}`, `quiz:${day}:${i}`)
          );
          const rows: ReturnType<typeof Markup.button.callback>[][] = [];
          for (let i = 0; i < keys.length; i += 2) rows.push(keys.slice(i, i + 2));
          return Markup.inlineKeyboard(rows);
        })()
      : confirmKb;

  if (testPhotoUrl && text.length <= captionMax) {
    await ctx.replyWithPhoto(testPhotoUrl, {
      caption: text,
      parse_mode: "Markdown",
      ...quizKb,
    });
  } else if (testPhotoUrl) {
    await ctx.replyWithPhoto(testPhotoUrl, {
      caption: "Иллюстрация",
    });
    await ctx.reply(text, {
      parse_mode: "Markdown",
      ...quizKb,
    });
  } else {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      ...quizKb,
    });
  }
}

bot.start(async (ctx) => {
  const { tid, profile } = await ensureUser(ctx);
  if (!profile.pdConsentAt) {
    await askConsent(ctx);
    return;
  }
  if (!profile.fullName) { await askName(ctx, tid); return; }
  if (!profile.age)      { await askAge(ctx, tid);  return; }
  if (!profile.university) { await askUniversity(ctx, tid); return; }
  await ctx.reply(
    "С возвращением! Вот главное меню:",
    mainKb
  );
});

bot.action("pd_consent", async (ctx) => {
  await ctx.answerCbQuery();
  const f = ctx.from;
  if (!f) return;
  const tid = String(f.id);
  await api.updateProfile(tid, { pdConsent: true });
  await askName(ctx, tid);
});

bot.command("menu", async (ctx) => {
  const { tid, profile } = await ensureUser(ctx);
  if (!profile.pdConsentAt) { await askConsent(ctx); return; }
  if (!profile.fullName)    { await askName(ctx, tid); return; }
  if (!profile.age)         { await askAge(ctx, tid);  return; }
  if (!profile.university)  { await askUniversity(ctx, tid); return; }
  await ctx.reply("Главное меню:", mainKb);
});

// ─── Обработка текстовых ответов во время онбординга ─────────────────────────
bot.on("text", async (ctx, next) => {
  const f = ctx.from;
  if (!f) return next();
  const tid = String(f.id);
  const step = waitingFor.get(tid);
  if (!step) return next();

  const text = ctx.message.text.trim();

  if (step === "name") {
    if (text.split(/\s+/).length < 2) {
      await ctx.reply("Пожалуйста, введи полное ФИО (минимум имя и фамилия):");
      return;
    }
    await api.updateProfile(tid, { fullName: text });
    await askAge(ctx, tid);
    return;
  }

  if (step === "age") {
    const age = parseInt(text, 10);
    if (isNaN(age) || age < 10 || age > 120) {
      await ctx.reply("Введи корректный возраст (числом, например: 21):");
      return;
    }
    await api.updateProfile(tid, { age });
    await askUniversity(ctx, tid);
    return;
  }

  if (step === "university") {
    await api.updateProfile(tid, { university: text });
    waitingFor.delete(tid);
    await finishOnboarding(ctx);
    return;
  }

  return next();
});

function adventGrid(current: number | null) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  let row: ReturnType<typeof Markup.button.callback>[] = [];
  for (let d = 1; d <= 21; d++) {
    const open = current !== null && d <= current;
    const label = open ? `${d}` : `🔒${d}`;
    row.push(Markup.button.callback(label, `advent:${d}`));
    if (d % 7 === 0) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  return Markup.inlineKeyboard(rows);
}

bot.hears("🎄 Адвент", async (ctx) => {
  const { tid } = await ensureUser(ctx);
  const data = (await api.advent(tid)) as {
    currentAdventDay: number | null;
    days: Array<{
      day: number;
      title: string;
      unlocked: boolean;
      progress: { taskCompletedAt: string | null } | null;
    }>;
  };
  const cur = data.currentAdventDay;
  const lines = data.days.map((d) => {
    const done = d.progress?.taskCompletedAt ? "✅" : d.unlocked ? "○" : "🔒";
    return `${done} ${d.day}. ${d.title}`;
  });
  await ctx.reply(
    `Адвент-календарь (сегодняшний день кампании: ${cur ?? "вне окна"})\n\n` +
      lines.join("\n") +
      "\n\nНажмите номер дня ниже:",
    adventGrid(cur)
  );
});

bot.action(/advent:(\d+)/, async (ctx) => {
  const day = Number(ctx.match[1]);
  const { tid } = await ensureUser(ctx);
  const data = (await api.advent(tid)) as { days: AdventDayPayload[] };
  const d = data.days.find((x) => x.day === day);
  if (!d) {
    await ctx.answerCbQuery("Нет данных");
    return;
  }
  if (!d.unlocked) {
    await ctx.answerCbQuery("Ещё не открыт");
    return;
  }
  await api.viewDay(tid, day);

  const miniQuizCount = d.miniQuizQuestionCount ?? 0;
  if (miniQuizCount > 0) {
    const openUrl = buildMiniAppTmeLink(botConfig.miniAppTmeBase, day);
    if (openUrl) {
      await ctx.answerCbQuery();
      await ctx.reply(`Открыть день ${day} в Mini App: ${openUrl}`);
      return;
    }
    await ctx.answerCbQuery(
      "Задайте TELEGRAM_MINIAPP_TME (https://t.me/бот/short_name) на сервере бота — тогда день откроется в Mini App.",
      { show_alert: true }
    );
    return;
  }

  await ctx.answerCbQuery();
  await replyLegacyAdventDay(ctx, d, day);
});

bot.action(/quiz:(\d+):(\d+)/, async (ctx) => {
  const { tid } = await ensureUser(ctx);
  const day = Number(ctx.match[1]);
  const idx = Number(ctx.match[2]);
  try {
    await api.task(tid, day, { quizAnswerIndex: idx });
    await ctx.answerCbQuery("Отлично!");
    await ctx.reply("✅ Задание принято! Можно возвращаться к адвенту через меню.");
  } catch {
    await ctx.answerCbQuery("Пока неверно — попробуйте другой вариант.");
  }
});

bot.action(/conf:(\d+)/, async (ctx) => {
  const { tid } = await ensureUser(ctx);
  const day = Number(ctx.match[1]);
  try {
    await api.task(tid, day, { confirm: true });
    await ctx.answerCbQuery("Принято!");
    await ctx.reply("✅ Задание засчитано.");
  } catch {
    await ctx.answerCbQuery("Не удалось сохранить");
  }
});

bot.hears("🏋️ Тренировки", async (ctx) => {
  await ensureUser(ctx);
  const list = (await api.trainings()) as Array<{
    id: string;
    title: string;
    description: string;
    startsAt: string;
    location: string;
  }>;
  if (!list.length) {
    await ctx.reply("Пока нет доступных тренировок.");
    return;
  }
  const rows = list.map((t) => [
    Markup.button.callback(`${t.title}`, `train:${t.id}`),
  ]);
  await ctx.reply("Выберите тренировку для записи:", Markup.inlineKeyboard(rows));
});

bot.action(/train:([a-z0-9]+)/, async (ctx) => {
  const { tid } = await ensureUser(ctx);
  const id = ctx.match[1];
  const list = (await api.trainings()) as Array<{
    id: string;
    title: string;
    description: string;
    startsAt: string;
    location: string;
  }>;
  const t = list.find((x) => x.id === id);
  if (!t) {
    await ctx.answerCbQuery("Не найдено");
    return;
  }
  await ctx.answerCbQuery();
  const when = new Date(t.startsAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
  await ctx.reply(
    `*${t.title}*\n${t.description}\n\n🕐 ${when}\n📍 ${t.location}\n\nЗаписаться?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback("Да, записать", `signup:${t.id}`),
          Markup.button.callback("Отмена", "noop"),
        ],
      ]),
    }
  );
});

bot.action("noop", async (ctx) => ctx.answerCbQuery());

bot.action(/signup:([a-z0-9]+)/, async (ctx) => {
  const { tid } = await ensureUser(ctx);
  const id = ctx.match[1];
  await api.signupTraining(tid, id);
  await ctx.answerCbQuery("Вы записаны!");
  await ctx.reply("✅ Запись подтверждена. Следите за рассылками о времени и изменениях.");
});

bot.hears("❓ Вопрос-ответ", async (ctx) => {
  await ensureUser(ctx);
  const site = await api.site();
  const raw = site.faq_json;
  if (!raw) {
    await ctx.reply("Раздел скоро пополним.");
    return;
  }
  const faq = JSON.parse(raw) as { q: string; a: string }[];
  if (!faq.length) {
    await ctx.reply("Раздел скоро пополним.");
    return;
  }

  // Разбиваем на части если FAQ большой (лимит сообщения Telegram — 4096 символов)
  const chunks: string[] = [];
  let current = "❓ *Вопросы и ответы*\n\n";
  faq.forEach((item, i) => {
    const block = `*${i + 1}. ${item.q}*\n${item.a}\n\n`;
    if ((current + block).length > 3800) {
      chunks.push(current.trim());
      current = block;
    } else {
      current += block;
    }
  });
  if (current.trim()) chunks.push(current.trim());

  for (const chunk of chunks) {
    await ctx.reply(chunk, { parse_mode: "Markdown" });
  }
});

bot.hears("🛟 Поддержка", async (ctx) => {
  await ensureUser(ctx);
  const site = await api.site();
  await ctx.reply(site.support_text ?? "Напишите в зону наполнения вашего чата кампании.");
});

bot.hears("🎁 Розыгрыши", async (ctx) => {
  const { tid } = await ensureUser(ctx);
  const data = (await api.giveaways(tid)) as {
    totalGiveawayEntries: number;
    giveaways: Array<{
      id: number;
      title: string;
      minDaysInWeek: number;
      campaignWeek: number;
      completedDaysInWeek: number;
      eligible: boolean;
      participated: boolean;
      canEnter: boolean;
    }>;
  };
  const lines = data.giveaways.map((g) => {
    const st = g.participated
      ? "✅ вы участвуете"
      : g.canEnter
        ? "можно вступить"
        : g.eligible
          ? "лимит 3/5"
          : `нужно дней за неделю: ${g.minDaysInWeek}, у вас: ${g.completedDaysInWeek}`;
    return `*${g.title}* (неделя ${g.campaignWeek})\n_${st}_`;
  });
  await ctx.reply(
    `Участий использовано: ${data.totalGiveawayEntries} из 3 (максимум разных розыгрышей).\n\n` +
      lines.join("\n\n"),
    { parse_mode: "Markdown" }
  );
  const enterable = data.giveaways.filter((g) => g.canEnter);
  if (enterable.length) {
    const rows = enterable.map((g) => [
      Markup.button.callback(`Вступить: ${g.title}`, `gw:${g.id}`),
    ]);
    await ctx.reply("Выберите розыгрыш:", Markup.inlineKeyboard(rows));
  }
});

bot.action(/gw:(\d+)/, async (ctx) => {
  const { tid } = await ensureUser(ctx);
  const id = Number(ctx.match[1]);
  try {
    await api.enterGiveaway(tid, id);
    await ctx.answerCbQuery("Вы в списке участников!");
    await ctx.reply("Заявка принята. Удачи! Итоги — по расписанию организаторов.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    await ctx.answerCbQuery("Нельзя", { show_alert: true });
    await ctx.reply(`Не получилось: ${msg}`);
  }
});

bot.hears("📍 Маршрут до места", async (ctx) => {
  await ensureUser(ctx);
  const address = "📍 Москва, Малый Zlatоустинский пер., 7, стр. 1";
  const mapUrl = `${botConfig.webUrl}/route-map.png`;
  const caption =
    `*Адрес:* Москва, Малый Златоустинский пер., 7, стр. 1\n\n` +
    `🗺 Открыть в картах:\n` +
    `[Яндекс Карты](https://yandex.ru/maps/?text=Малый+Златоустинский+пер.+7+стр.+1+Москва) · ` +
    `[Google Maps](https://maps.google.com/?q=Малый+Златоустинский+пер.+7+стр.+1,+Москва)`;
  try {
    await ctx.replyWithPhoto(mapUrl, { caption, parse_mode: "Markdown" });
  } catch {
    await ctx.reply(caption, { parse_mode: "Markdown" });
  }
});

bot.hears("📱 Мини-апп", async (ctx) => {
  await ensureUser(ctx);
  const webAppUrl = `${botConfig.webUrl}`;
  await ctx.reply(
    "Открой мини-приложение кнопкой ниже — так Telegram передаст данные для входа.",
    Markup.inlineKeyboard([[Markup.button.webApp("📱 Открыть Мини-апп", webAppUrl)]])
  );
});

bot.hears("🔕 Без напоминаний", async (ctx) => {
  const { tid } = await ensureUser(ctx);
  await api.mute(tid, true);
  await ctx.reply("Напоминания об адвенте отключены. Команда /remind включит снова.");
});

bot.command("remind", async (ctx) => {
  const { tid } = await ensureUser(ctx);
  await api.mute(tid, false);
  await ctx.reply("Напоминания снова включены.");
});

cron.schedule("0 */2 * * *", async () => {
  try {
    const batch = await api.reminderBatch();
    for (const tid of batch.telegramIds) {
      await bot.telegram.sendMessage(
        tid,
        `Напоминание: не забудьте открыть день ${batch.day} в адвент-календаре 🎄`
      );
    }
  } catch (e) {
    console.error("reminder cron", e);
  }
});

// ─── Рассылки: бот каждую минуту проверяет очередь ─────────────────────────
cron.schedule("* * * * *", async () => {
  try {
    const h: Record<string, string> = {};
    if (botConfig.internalKey) h["x-internal-key"] = botConfig.internalKey;
    const r = await fetch(`${botConfig.apiBase}/api/internal/pending-broadcast`, { headers: h });
    if (!r.ok) return;
    const data = await r.json() as { broadcast: { message: string } | null; telegramIds: string[] };
    if (!data.broadcast) return;

    let sent = 0;
    for (const tid of data.telegramIds) {
      try {
        await bot.telegram.sendMessage(tid, data.broadcast.message);
        sent++;
      } catch { /* пользователь заблокировал бота */ }
    }
    console.log(`Broadcast sent to ${sent}/${data.telegramIds.length} users`);
  } catch (e) {
    console.error("broadcast cron", e);
  }
});

// ─── Напоминание неактивным пользователям Mini App (раз в 12 часов) ─────────
cron.schedule("0 9,21 * * *", async () => {
  try {
    const h: Record<string, string> = {};
    if (botConfig.internalKey) h["x-internal-key"] = botConfig.internalKey;
    const r = await fetch(`${botConfig.apiBase}/api/internal/inactive-mini-users`, { headers: h });
    if (!r.ok) return;
    const data = await r.json() as { telegramIds: string[] };
    for (const tid of data.telegramIds) {
      try {
        await bot.telegram.sendMessage(
          tid,
          `👋 Привет! Ты давно не заходил в адвент-календарь.\n\nОткрывай новые дни — тебя ждут задания и материалы 🎄`,
          {
            reply_markup: {
              inline_keyboard: [[
                { text: "📱 Открыть Мини-апп", web_app: { url: `${botConfig.webUrl}` } },
              ]],
            },
          }
        );
      } catch { /* пользователь заблокировал бота */ }
    }
    if (data.telegramIds.length) {
      console.log(`Inactivity reminders sent to ${data.telegramIds.length} users`);
    }
  } catch (e) {
    console.error("inactivity reminder cron", e);
  }
});

// ─── Команда /broadcast для бот-админов ──────────────────────────────────────
bot.command("broadcast", async (ctx) => {
  const f = ctx.from;
  if (!f) return;
  if (!(await isBotAdmin(String(f.id)))) {
    await ctx.reply("⛔ Нет доступа.");
    return;
  }
  const text = ctx.message.text.replace(/^\/broadcast\s*/, "").trim();
  if (!text) {
    await ctx.reply("Использование: /broadcast Текст сообщения");
    return;
  }
  const h: Record<string, string> = {
    "content-type": "application/json",
    "x-admin-key": botConfig.adminKey,
  };
  const r = await fetch(`${botConfig.apiBase}/api/admin/bot/broadcasts`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ message: text }),
  });
  if (r.ok) {
    await ctx.reply("✅ Рассылка поставлена в очередь. Будет отправлена в течение минуты.");
  } else {
    await ctx.reply("❌ Ошибка при создании рассылки.");
  }
});

bot.launch().then(() => console.log("Bot started"));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
