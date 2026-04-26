import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const topics = [
  ["Вода", "ARTICLE", "Питьевой режим и самочувствие"],
  ["Сон", "VIDEO", "Качество сна и восстановление"],
  ["Разминка", "BADGE", "Короткая активация перед нагрузкой"],
  ["Питание", "ARTICLE", "Баланс БЖУ без крайностей"],
  ["Растяжка", "VIDEO", "Мобильность суставов"],
  ["Стресс", "ARTICLE", "Работа с напряжением"],
  ["Шаги", "BADGE", "Ежедневная активность"],
  ["Завтрак", "ARTICLE", "Старт дня и энергия"],
  ["Экраны", "ARTICLE", "Перерывы для глаз и осанки"],
  ["Дыхание", "VIDEO", "Спокойствие за 3 минуты"],
  ["Сила", "BADGE", "Базовые паттерны движения"],
  ["Кардио", "VIDEO", "Умеренная нагрузка"],
  ["Осанка", "ARTICLE", "Рабочее место и спина"],
  ["Перекусы", "ARTICLE", "Полезные варианты"],
  ["Вело", "BADGE", "Активная дорога до учёбы"],
  ["10k шагов", "ARTICLE", "Как набрать без стресса"],
  ["Медитация", "VIDEO", "Фокус и ясность"],
  ["Команда", "ARTICLE", "Поддержка окружения"],
  ["План недели", "BADGE", "Расписание тренировок"],
  ["Восстановление", "ARTICLE", "Сон, питание, лёгкая активность"],
  ["Баланс", "VIDEO", "Итоги и закрепление привычек"],
];

async function main() {
  await prisma.trainingSignup.deleteMany();
  await prisma.training.deleteMany();

  for (let day = 1; day <= 21; day++) {
    const [title, materialType, shortSummary] = topics[day - 1];
    const quizOptions = ["Подходит мне", "Скорее нет", "Нужно больше информации"];
    await prisma.adventDay.upsert({
      where: { day },
      create: {
        day,
        title: `День ${day}: ${title}`,
        materialType,
        shortSummary,
        articleUrl:
          materialType === "ARTICLE"
            ? `https://t.me/your_channel/${100 + day}`
            : null,
        videoUrl:
          materialType === "VIDEO"
            ? "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            : null,
        extraText:
          materialType === "BADGE"
            ? "Короткая памятка: двигайтесь 5–10 минут каждый час."
            : null,
        taskPrompt: "Отметьте, что вы ознакомились с материалом дня.",
        taskKind: "QUIZ",
        quizOptions: JSON.stringify(quizOptions),
        correctIndex: 0,
      },
      update: {
        title: `День ${day}: ${title}`,
        materialType,
        shortSummary,
      },
    });
  }

  const giveaways = [
    { id: 1, title: "Розыгрыш 1 — неделя 1", campaignWeek: 1, minDaysInWeek: 3 },
    { id: 2, title: "Розыгрыш 2 — неделя 1", campaignWeek: 1, minDaysInWeek: 3 },
    { id: 3, title: "Розыгрыш 3 — неделя 2", campaignWeek: 2, minDaysInWeek: 4 },
    { id: 4, title: "Розыгрыш 4 — неделя 2", campaignWeek: 2, minDaysInWeek: 4 },
    { id: 5, title: "Розыгрыш 5 — неделя 3", campaignWeek: 3, minDaysInWeek: 5 },
  ];
  for (const g of giveaways) {
    await prisma.giveaway.upsert({
      where: { id: g.id },
      create: g,
      update: {
        title: g.title,
        campaignWeek: g.campaignWeek,
        minDaysInWeek: g.minDaysInWeek,
      },
    });
  }

  const trainings = [
    {
      title: "Утренняя зарядка",
      description: "20 минут, лёгкая динамика и растяжка.",
      startsAt: new Date("2026-05-10T08:00:00+03:00"),
      location: "Спортзал главного корпуса",
      sortOrder: 1,
    },
    {
      title: "Функциональный тренинг",
      description: "Собственный вес, базовые упражнения.",
      startsAt: new Date("2026-05-12T18:30:00+03:00"),
      location: "Зал А",
      sortOrder: 2,
    },
    {
      title: "Йога-стретч",
      description: "Спокойный темп, фокус на дыхании.",
      startsAt: new Date("2026-05-15T19:00:00+03:00"),
      location: "Зал Б",
      sortOrder: 3,
    },
  ];
  for (const t of trainings) {
    await prisma.training.create({ data: t });
  }

  // cta_telegram_miniapp: https://t.me/BOT/SHORT_NAME — SHORT_NAME из @BotFather (Web App). В BotFather URL приложения: https://домен/mini/advent
  const site: Record<string, string> = {
    hero_title: "Резонанс — здоровые привычки в ритме учёбы",
    hero_sub:
      "21 день материалов, тренировок и розыгрышей для студентов. Всё в Telegram и на этом сайте.",
    faq_json: JSON.stringify([
      {
        q: "Как открывается день адвента?",
        a: "Каждый день разблокируется по календарю — не нужно проходить предыдущие дни подряд.",
      },
      {
        q: "Сколько розыгрышей можно выбрать?",
        a: "Не более трёх из пяти: следите за условиями по неделям.",
      },
      {
        q: "Где тренировки?",
        a: "Запись через бота; адрес и время приходят в рассылке.",
      },
    ]),
    support_text:
      "Напишите вопрос в зону наполнения (указано в чате кампании) или ответьте на это сообщение в боте — команда поддержки ответит в рабочее время.",
    route_md: `## Как добраться до корпуса

1. От метро — автобусы до остановки «Университет».
2. От общежитий — 10–15 минут пешком по схеме во вложении.
3. Видео-гайд: вставьте ссылку на ваш ролик.`,
    cta_bot: "https://t.me/your_bot_username",
    cta_telegram_miniapp: "https://t.me/your_bot_username/advent",
  };

  for (const [key, value] of Object.entries(site)) {
    await prisma.siteContent.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  console.log("Seed OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
