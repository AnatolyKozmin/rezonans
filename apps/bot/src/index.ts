import { Telegraf, Markup } from "telegraf";
import cron from "node-cron";
import { botConfig } from "./config.js";
import { api } from "./api.js";

const bot = new Telegraf(botConfig.token);

const mainKb = Markup.keyboard([
  ["🎄 Адвент", "🏋️ Тренировки"],
  ["❓ Вопрос-ответ", "🛟 Поддержка"],
  ["🎁 Розыгрыши", "📍 Как добраться"],
  ["🌐 Сайт", "🔕 Без напоминаний"],
]).resize();

async function ensureUser(ctx: { from?: { id: number; username?: string; first_name?: string; last_name?: string } }) {
  const f = ctx.from;
  if (!f) throw new Error("no user");
  await api.upsertUser({
    telegramId: String(f.id),
    username: f.username,
    firstName: f.first_name,
    lastName: f.last_name,
  });
  return String(f.id);
}

bot.start(async (ctx) => {
  const id = await ensureUser(ctx);
  await ctx.reply(
    "Привет! Это бот кампании «Резонанс». Здесь адвент на 21 день, запись на тренировки и розыгрыши.\n\n" +
      `Ваш ID: ${id} (пригодится для поддержки).`,
    mainKb
  );
});

bot.command("menu", async (ctx) => {
  await ensureUser(ctx);
  await ctx.reply("Главное меню:", mainKb);
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
  const tid = await ensureUser(ctx);
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
  const tid = await ensureUser(ctx);
  const day = Number(ctx.match[1]);
  const data = (await api.advent(tid)) as {
    days: Array<{
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
      unlocked: boolean;
      progress: { taskCompletedAt: string | null } | null;
    }>;
  };
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
  await ctx.answerCbQuery();

  const testPhotoUrl = d.testImageUrl
    ? new URL(d.testImageUrl, botConfig.apiBase).toString()
    : null;

  let text =
    `📌 *${d.title}*\n_${d.shortSummary}_\n\n` +
    (d.extraText ? `${d.extraText}\n\n` : "");
  if (d.articleUrl) text += `📰 Статья: ${d.articleUrl}\n`;
  if (d.videoUrl) text += `🎬 Видео: ${d.videoUrl}\n`;

  const promptLine = d.taskPrompt.trim();
  if (promptLine) {
    text += `\n*Тест:* ${promptLine}`;
  } else if (d.taskKind === "QUIZ" && d.quizOptions?.length) {
    text += `\n*Тест:* выберите верный вариант ниже.`;
  } else if (d.taskKind === "CONFIRM") {
    text += `\n*Тест:* подтвердите выполнение кнопкой ниже.`;
  }

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
        caption: "Иллюстрация к тесту",
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
      : Markup.inlineKeyboard([[Markup.button.callback("Подтверждаю", `conf:${day}`)]]);

  if (testPhotoUrl && text.length <= captionMax) {
    await ctx.replyWithPhoto(testPhotoUrl, {
      caption: text,
      parse_mode: "Markdown",
      ...quizKb,
    });
  } else if (testPhotoUrl) {
    await ctx.replyWithPhoto(testPhotoUrl, {
      caption: "Иллюстрация к тесту",
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
});

bot.action(/quiz:(\d+):(\d+)/, async (ctx) => {
  const tid = await ensureUser(ctx);
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
  const tid = await ensureUser(ctx);
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
  const tid = await ensureUser(ctx);
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
  const tid = await ensureUser(ctx);
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
  const text = faq.map((x) => `*${x.q}*\n${x.a}`).join("\n\n");
  await ctx.reply(text, { parse_mode: "Markdown" });
});

bot.hears("🛟 Поддержка", async (ctx) => {
  await ensureUser(ctx);
  const site = await api.site();
  await ctx.reply(site.support_text ?? "Напишите в зону наполнения вашего чата кампании.");
});

bot.hears("🎁 Розыгрыши", async (ctx) => {
  const tid = await ensureUser(ctx);
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
  const tid = await ensureUser(ctx);
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

bot.hears("📍 Как добраться", async (ctx) => {
  await ensureUser(ctx);
  const site = await api.site();
  await ctx.reply(site.route_md ?? "Скоро добавим схему и видео.");
});

bot.hears("🌐 Сайт", async (ctx) => {
  await ensureUser(ctx);
  await ctx.reply(`Откройте лендинг кампании: ${botConfig.webUrl}`);
});

bot.hears("🔕 Без напоминаний", async (ctx) => {
  const tid = await ensureUser(ctx);
  await api.mute(tid, true);
  await ctx.reply("Напоминания об адвенте отключены. Команда /remind включит снова.");
});

bot.command("remind", async (ctx) => {
  const tid = await ensureUser(ctx);
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

bot.launch().then(() => console.log("Bot started"));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
