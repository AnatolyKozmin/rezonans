import { useEffect, useRef, useState } from "react";
import { AdventCalendar } from "./AdventCalendar";
import WebApp from "@twa-dev/sdk";

type Training = {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  location: string;
};

type Faq = { q: string; a: string };

function FaqItem({ q, a }: Faq) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <div className={`faq-item ${open ? "faq-item--open" : ""}`}>
      <button
        type="button"
        className="faq-item__q"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{q}</span>
        <span className="faq-item__icon" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 6.5L9 11.5L14 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>
      <div
        ref={bodyRef}
        className="faq-item__body"
        style={{ maxHeight: open ? bodyRef.current?.scrollHeight : 0 }}
      >
        <p className="faq-item__a">{a}</p>
      </div>
    </div>
  );
}

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
    // Если открыто через Telegram Mini App — сообщаем что загрузились
    try { if (WebApp.initData) { WebApp.ready(); WebApp.expand(); } } catch { /* браузер */ }

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
          <a className="btn btn-ghost" href="#faq">
            Вопросы и ответы
          </a>
        </div>
      </header>

      {err ? <p className="section-title alert">{err}</p> : null}

      <AdventCalendar />

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
          <FaqItem key={f.q} q={f.q} a={f.a} />
        ))}
        {faq.length === 0 ? <p className="muted">Вопросы появятся после наполнения.</p> : null}
      </div>

      <h2 className="section-title" id="route">
        Как добраться
      </h2>
      <div className="card">
        <img
          src="/route-map.png"
          alt="Схема маршрута от метро Китай-город"
          className="route-map-img"
          loading="lazy"
          decoding="async"
        />
        <pre className="route-block">{site.route_md ?? "Текст появится после наполнения."}</pre>
      </div>

      <footer className="footer" />
    </div>
  );
}
