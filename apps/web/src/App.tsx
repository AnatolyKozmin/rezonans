import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdventCalendar } from "./AdventCalendar";

type Training = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
};

type Faq = { q: string; a: string };

const NAV = [
  { href: "#top", label: "Главная" },
  { href: "#advent", label: "Адвент" },
  { href: "#features", label: "Программа" },
  { href: "#trainings", label: "Тренировки" },
  { href: "#faq", label: "Вопросы" },
  { href: "#route", label: "Маршрут" },
] as const;

const FEATURES = [
  {
    icon: "📅",
    title: "Адвент 21 день",
    body: "Статьи, плашки и видео — каждый день открывается по календарю, с заданием после материала.",
  },
  {
    icon: "🏆",
    title: "Тренировки и призы",
    body: "Запись на занятия в боте и до трёх участий в пяти розыгрышах при выполнении условий по неделям.",
  },
  {
    icon: "💬",
    title: "Поддержка и маршрут",
    body: "Ответы на частые вопросы, зона наполнения и схема, как добраться до корпуса.",
  },
];

export function App() {
  const [site, setSite] = useState<Record<string, string>>({});
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, t] = await Promise.all([
          fetch("/api/site").then((r) => r.json()),
          fetch("/api/trainings").then((r) => r.json()),
        ]);
        setSite(s);
        setTrainings(t);
      } catch {
        setErr("Не удалось загрузить данные. Запустите API на :4000.");
      }
    })();
  }, []);

  let faq: Faq[] = [];
  try {
    if (site.faq_json) faq = JSON.parse(site.faq_json);
  } catch {
    /* ignore */
  }

  const bot = site.cta_bot ?? "#";
  const telegramMiniApp = site.cta_telegram_miniapp?.trim() ?? "";
  const title = site.hero_title ?? "Резонанс";
  const sub = site.hero_sub ?? "";

  return (
    <div className="shell" id="top">
      <nav className="site-nav" aria-label="Навигация по странице">
        <div className="site-nav__track">
          {NAV.map((item) => (
            <a
              key={item.href}
              className={item.href === "#advent" ? "site-nav__link site-nav__link--advent" : "site-nav__link"}
              href={item.href}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="site-logo-bar">
        <img
          className="site-logo"
          src="/rezonans_logo.svg"
          alt="Резонанс — логотип кампании"
          width={406}
          height={406}
          decoding="async"
          fetchPriority="high"
        />
      </div>

      <header className="hero" id="intro">
        <div className="hero-top">
          <span className="pill">21 день · кампания · ЗОЖ</span>
          <div className="swatches" aria-hidden title="Палитра гайдлайна">
            <span className="swatch" style={{ background: "#dadbdf" }} />
            <span className="swatch" style={{ background: "#b8ff00" }} />
            <span className="swatch" style={{ background: "#7e52ff" }} />
            <span className="swatch" style={{ background: "#252736", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)" }} />
          </div>
        </div>
        <h1 className="hero-brand">{title}</h1>
        <p className="hero-script">поговорим о привычках прямо сейчас</p>
        {sub ? <p className="hero-lead">{sub}</p> : null}
        <div className="cta-row" id="hero-cta">
          <a className="btn btn-primary" href={bot}>
            Telegram-бот
          </a>
          <a className="btn btn-ghost" href="#faq">
            Вопросы и ответы
          </a>
        </div>
      </header>

      {err ? <p className="section-title alert">{err}</p> : null}

      <AdventCalendar botUrl={bot} telegramMiniAppBase={telegramMiniApp} />

      <h2 className="section-title" id="features">
        Что внутри
      </h2>
      <div className="grid cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <div className="card-icon" aria-hidden>
              {f.icon}
            </div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>

      <h2 className="section-title" id="trainings">
        Расписание тренировок
      </h2>
      <div className="trainings">
        {trainings.map((tr) => (
          <div key={tr.id} className="train">
            <h4>{tr.title}</h4>
            <p>{tr.description}</p>
            <div className="meta">
              {new Date(tr.startsAt).toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
              })}{" "}
              · {tr.location}
            </div>
          </div>
        ))}
        {!trainings.length && !err ? <p className="muted">Скоро появится расписание.</p> : null}
      </div>

      <h2 className="section-title" id="faq">
        Вопросы и ответы
      </h2>
      <div className="faq">
        {faq.map((f) => (
          <details key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>

      <h2 className="section-title" id="route">
        Как добраться
      </h2>
      <div className="card">
        <pre className="route-block">{site.route_md ?? "Текст появится после наполнения."}</pre>
      </div>

      <footer className="footer">
        Дизайн-гайдлайн: тёмный фон <span className="mono">#252736</span>, акценты{" "}
        <span className="mono">#B8FF00</span> и <span className="mono">#7E52FF</span>, шрифты Russo One и Nunito. Настройте
        бота и даты кампании в <span className="mono">.env</span>.{" "}
        <Link to="/admin" className="footer-admin-link">
          Админка адвента
        </Link>
        {" · "}
        <Link to="/admin/site" className="footer-admin-link">
          FAQ и маршрут
        </Link>
      </footer>
    </div>
  );
}
