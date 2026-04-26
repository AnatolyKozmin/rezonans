import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import WebApp from "@twa-dev/sdk";

type DayCard = {
  day: number;
  title: string;
  materialType: string;
  shortSummary: string;
  unlocked: boolean;
  hasQuiz: boolean;
};

type ApiDay = {
  day: number;
  title: string;
  materialType: string;
  shortSummary: string;
  unlocked: boolean;
  hasQuiz: boolean;
};

const TYPE_ICON: Record<string, string> = {
  ARTICLE: "📄",
  VIDEO: "🎬",
  BADGE: "🏆",
};

export function MiniHomePage() {
  const [days, setDays] = useState<DayCard[] | null>(null);
  const [currentDay, setCurrentDay] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    try { WebApp.ready(); WebApp.expand(); } catch { /* web page */ }

    // Аналитика
    const qs = new URLSearchParams();
    if (WebApp.initData) qs.set("initData", WebApp.initData);
    const sid = localStorage.getItem("mini_advent_session_id");
    if (sid) qs.set("sessionId", sid);
    qs.set("page", "home");
    fetch("/api/mini/ping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(qs)) }).catch(() => {});

    (async () => {
      try {
        // Персональный прогресс через /api/mini/days (учитывает дату первого входа)
        const params = new URLSearchParams();
        if (WebApp.initData) params.set("initData", WebApp.initData);
        const r = await fetch(`/api/mini/days?${params}`);
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json() as { currentAdventDay: number | null; effectiveAdventDay: number | null; days: ApiDay[] };
        setCurrentDay(j.effectiveAdventDay ?? j.currentAdventDay);
        // Показываем все 21 день — отсутствующие в БД заполняем заглушкой
        const byDay = new Map(j.days.map((d) => [d.day, d]));
        const cards: DayCard[] = Array.from({ length: 21 }, (_, i) => {
          const n = i + 1;
          const d = byDay.get(n);
          return d
            ? { day: n, title: d.title, materialType: d.materialType, shortSummary: d.shortSummary, unlocked: d.unlocked, hasQuiz: d.hasQuiz ?? false }
            : { day: n, title: `День ${n}`, materialType: "ARTICLE", shortSummary: "", unlocked: false, hasQuiz: false };
        });
        setDays(cards);
      } catch {
        setLoadError("Не удалось загрузить данные");
      }
    })();
  }, []);

  if (loadError) {
    return (
      <div className="mini-shell mini-shell--center">
        <p className="mini-alert">{loadError}</p>
      </div>
    );
  }

  if (!days) {
    return (
      <div className="mini-shell mini-shell--center">
        <div className="mini-loading" aria-busy>
          <span className="mini-loading__dot" />
          <span className="mini-loading__dot" />
          <span className="mini-loading__dot" />
        </div>
        <p className="mini-muted">Загрузка…</p>
      </div>
    );
  }

  const unlockedCount = days.filter((d) => d.unlocked).length;

  return (
    <div className="mini-shell">
      <header className="mini-home-header">
        <div className="mini-home-header__top">
          <h1 className="mini-home-header__title">Адвент-календарь</h1>
          {!WebApp.initData && (
            <Link to="/" className="mini-back-link">На сайт →</Link>
          )}
        </div>
        <p className="mini-home-header__sub">
          {unlockedCount === 0
            ? "Скоро начнётся"
            : `Открыто ${unlockedCount} из 21`}
        </p>
      </header>

      <div className="mini-shell__scroll">
        <div className="mini-day-grid">
          {days.map((d) => {
            const isToday = d.day === currentDay;
            if (!d.unlocked) {
              return (
                <div
                  key={d.day}
                  className="mini-day-card mini-day-card--locked"
                  aria-label={`День ${d.day} — ещё закрыт`}
                >
                  <span className="mini-day-card__num">{d.day}</span>
                  <span className="mini-day-card__lock" aria-hidden>🔒</span>
                </div>
              );
            }
            return (
              <Link
                key={d.day}
                to={`/mini/advent/${d.day}`}
                className={`mini-day-card mini-day-card--open ${isToday ? "mini-day-card--today" : ""}`}
                aria-label={`День ${d.day}: ${d.title}`}
              >
                <div className="mini-day-card__top">
                  <span className="mini-day-card__num">{d.day}</span>
                  {isToday && <span className="mini-day-card__today-dot" aria-label="сегодня" />}
                </div>
                <span className="mini-day-card__icon" aria-hidden>
                  {TYPE_ICON[d.materialType] ?? "📖"}
                </span>
                <p className="mini-day-card__title">{d.title}</p>
                {d.hasQuiz && (
                  <span className="mini-day-card__quiz-badge" aria-label="есть тест">Тест</span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
