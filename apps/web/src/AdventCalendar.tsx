import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";

export type AdventMediaPublic = {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  position: number;
};

export type MiniQuizPreview = { id: string; prompt: string; kind: string };

export type AdventDayPublic = {
  day: number;
  title: string;
  materialType: string;
  shortSummary: string;
  articleUrl?: string | null;
  videoUrl?: string | null;
  extraText?: string | null;
  taskPrompt: string;
  taskKind?: string;
  quizOptions?: string[] | null;
  testImageUrl?: string | null;
  miniQuiz?: MiniQuizPreview[];
  unlocked: boolean;
  media?: AdventMediaPublic[];
};

type AdventPayload = {
  currentAdventDay: number | null;
  days: AdventDayPublic[];
};

function sortAdventMedia(media: AdventMediaPublic[]) {
  return [...media].sort((a, b) => a.position - b.position);
}

function hasPublicTestBlock(d: AdventDayPublic): boolean {
  if (d.miniQuiz && d.miniQuiz.length > 0) return true;
  if (d.testImageUrl) return true;
  if (d.taskPrompt?.trim()) return true;
  return false;
}

/** Ссылка на бота с deep-link дня для t.me; иначе — общий URL или якорь на CTA. */
function adventTestBotHref(botUrl: string, day: number): string {
  const fallback = "#hero-cta";
  const raw = botUrl.trim();
  if (!raw || raw === "#") return fallback;

  let href = raw;
  if (/^t\.me\//i.test(href)) href = `https://${href}`;

  if (!/^https?:\/\//i.test(href)) {
    return fallback;
  }

  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    if (host === "t.me" || host === "telegram.me" || host.endsWith(".t.me")) {
      u.searchParams.set("start", `advent_${day}`);
      return u.toString();
    }
  } catch {
    return fallback;
  }

  return href;
}

/** Только Mini App в Telegram (квиз не открываем через чат бота). */
function adventTestTelegramMiniHref(miniAppBase: string, day: number): string {
  const raw = miniAppBase.trim();
  if (!raw) return "#advent-miniapp-missing";
  let href = raw;
  if (/^t\.me\//i.test(href)) href = `https://${href}`;
  try {
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    if (host === "t.me" || host === "telegram.me" || host.endsWith(".t.me")) {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        u.searchParams.set("startapp", String(day));
        return u.toString();
      }
    }
  } catch {
    /* ignore */
  }
  return "#advent-miniapp-missing";
}

function AdventMediaSlide({ m }: { m: AdventMediaPublic }) {
  return (
    <figure className="advent-media-block">
      {m.kind === "VIDEO" ? (
        <video className="advent-media-video" controls playsInline src={m.url} preload="metadata" />
      ) : (
        <img className="advent-media-image" src={m.url} alt="" loading="lazy" decoding="async" />
      )}
      {m.caption ? <figcaption className="advent-media-cap">{m.caption}</figcaption> : null}
    </figure>
  );
}

/** Несколько плашек/фото/видео — листаются кнопками, точками и свайпом. */
function AdventMediaCarousel({ media, dayKey }: { media: AdventMediaPublic[]; dayKey: number }) {
  const sorted = useMemo(() => sortAdventMedia(media), [media]);
  const [idx, setIdx] = useState(0);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setIdx(0);
  }, [dayKey]);

  useEffect(() => {
    setIdx((i) => Math.min(i, Math.max(0, sorted.length - 1)));
  }, [sorted.length]);

  if (sorted.length === 0) return null;
  if (sorted.length === 1) {
    return (
      <div className="advent-media-stack">
        <AdventMediaSlide m={sorted[0]} />
      </div>
    );
  }

  const go = (dir: -1 | 1) => {
    setIdx((i) => Math.max(0, Math.min(sorted.length - 1, i + dir)));
  };

  const onTouchStart = (e: TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (dx > 56) go(-1);
    else if (dx < -56) go(1);
  };

  const m = sorted[idx];

  return (
    <div
      className="advent-media-carousel"
      role="region"
      aria-roledescription="карусель"
      aria-label={`Материалы дня, слайд ${idx + 1} из ${sorted.length}`}
    >
      <div className="advent-media-carousel__viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div key={m.id} className="advent-media-carousel__slide">
          <AdventMediaSlide m={m} />
        </div>
        <button
          type="button"
          className="advent-media-carousel__nav advent-media-carousel__nav--prev"
          onClick={() => go(-1)}
          disabled={idx <= 0}
          aria-label="Предыдущий материал"
        >
          <span aria-hidden>‹</span>
        </button>
        <button
          type="button"
          className="advent-media-carousel__nav advent-media-carousel__nav--next"
          onClick={() => go(1)}
          disabled={idx >= sorted.length - 1}
          aria-label="Следующий материал"
        >
          <span aria-hidden>›</span>
        </button>
      </div>
      <div className="advent-media-carousel__dots" role="tablist" aria-label="Выбор слайда">
        {sorted.map((item, i) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={i === idx}
            className={`advent-media-carousel__dot ${i === idx ? "is-active" : ""}`}
            onClick={() => setIdx(i)}
            aria-label={`Материал ${i + 1} из ${sorted.length}`}
          />
        ))}
      </div>
      <p className="advent-media-carousel__hint">Свайп влево / вправо или стрелки — несколько материалов дня</p>
    </div>
  );
}

export function AdventCalendar({
  botUrl = "#",
  telegramMiniAppBase = "",
}: {
  botUrl?: string;
  /** https://t.me/bot_username/webapp_short_name — задаётся в админке /admin/site или SiteContent cta_telegram_miniapp */
  telegramMiniAppBase?: string;
} = {}) {
  const [payload, setPayload] = useState<AdventPayload | null>(null);
  const [selected, setSelected] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/advent");
        if (!r.ok) throw new Error(String(r.status));
        const data: AdventPayload = await r.json();
        setPayload(data);
        const cur = data.currentAdventDay;
        if (cur !== null && cur >= 1 && cur <= 21) {
          setSelected(cur);
        } else {
          setSelected(1);
        }
      } catch {
        setLoadError("Не удалось загрузить календарь.");
      }
    })();
  }, []);

  const scrollDayIntoView = useCallback((day: number, behavior: ScrollBehavior = "smooth") => {
    const root = scrollerRef.current;
    if (!root) return;
    const el = root.querySelector<HTMLElement>(`[data-advent-day="${day}"]`);
    el?.scrollIntoView({ behavior, inline: "center", block: "nearest" });
  }, []);

  useEffect(() => {
    if (!payload) return;
    const behavior: ScrollBehavior = initialScrollDone.current ? "smooth" : "auto";
    initialScrollDone.current = true;
    const t = window.setTimeout(() => scrollDayIntoView(selected, behavior), 50);
    return () => window.clearTimeout(t);
  }, [payload, selected, scrollDayIntoView]);

  const active = useMemo(() => {
    if (!payload?.days.length) return undefined;
    return payload.days.find((d) => d.day === selected) ?? payload.days[0];
  }, [payload, selected]);

  const goPrev = () => {
    if (!payload?.days.length) return;
    const next = Math.max(1, selected - 1);
    setSelected(next);
  };

  const goNext = () => {
    if (!payload?.days.length) return;
    const next = Math.min(21, selected + 1);
    setSelected(next);
  };

  return (
    <section className="advent-section" id="advent" aria-labelledby="advent-heading">
      <h2 className="section-title" id="advent-heading">
        Адвент-календарь
      </h2>
      <p className="advent-lead">
        Каждый день открывается по дате кампании. Листайте ленту и нажимайте на карточку — сверху материал дня. Тест — кнопка{" "}
        <strong>Пройти тест</strong> ниже; открывается в приложении Telegram (Mini App).
      </p>

      {loadError ? <p className="alert">{loadError}</p> : null}

      {payload && payload.days.length === 0 ? (
        <p className="muted">
          Дни адвента ещё не заведены в базе. Выполните seed или добавьте дни в админке (/admin).
        </p>
      ) : null}

      {payload && payload.days.length > 0 && active ? (
        <div className="advent-shell">
          <div className="advent-stage" aria-live="polite">
            <div key={selected} className="advent-stage-inner">
              <div className="advent-stage-head">
                <span className="advent-badge">День {active.day}</span>
                {!active.unlocked ? <span className="advent-lock-pill">скоро</span> : null}
              </div>
              <h3 className="advent-stage-title">{active.title}</h3>
              <p className="advent-stage-summary">{active.shortSummary}</p>

              {active.unlocked ? (
                <>
                  {active.extraText ? <p className="advent-extra">{active.extraText}</p> : null}

                  {active.media && active.media.length > 0 ? (
                    <AdventMediaCarousel media={active.media} dayKey={active.day} />
                  ) : null}

                  <div className="advent-links">
                    {active.articleUrl ? (
                      <a className="advent-link advent-link--article" href={active.articleUrl} target="_blank" rel="noreferrer">
                        Открыть статью
                      </a>
                    ) : null}
                    {active.videoUrl ? (
                      <a className="advent-link advent-link--video" href={active.videoUrl} target="_blank" rel="noreferrer">
                        Смотреть видео
                      </a>
                    ) : null}
                  </div>
                  {hasPublicTestBlock(active) ? (
                    <div className="advent-test-block">
                      <h4 className="advent-test-title">Тест дня</h4>
                      {active.testImageUrl ? (
                        <img
                          className="advent-test-image"
                          src={active.testImageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : null}
                      {active.taskPrompt?.trim() ? (
                        <p className="advent-test-prompt">{active.taskPrompt}</p>
                      ) : null}
                      {active.miniQuiz && active.miniQuiz.length > 0 ? (
                        <ol className="advent-quiz-options">
                          {active.miniQuiz.map((q) => (
                            <li key={q.id}>{q.prompt}</li>
                          ))}
                        </ol>
                      ) : null}
                      {(() => {
                        const testHref =
                          active.miniQuiz && active.miniQuiz.length > 0
                            ? adventTestTelegramMiniHref(telegramMiniAppBase, active.day)
                            : adventTestBotHref(botUrl, active.day);
                        const hrefMissing = testHref.startsWith("#");
                        return (
                          <>
                            {hrefMissing ? (
                              <p className="alert advent-test-config-miss">
                                Ссылка на Telegram не задана: кнопка не откроет бота. Укажите «Ссылка на бота» в{" "}
                                <a href="/admin/site">админке → сайт</a> (и при квизе — прямую ссылку Mini App).
                              </p>
                            ) : null}
                            <a
                              className="btn btn-primary advent-test-bot-btn"
                              href={testHref}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Пройти тест
                            </a>
                            <p className="advent-task-note">
                              {hrefMissing
                                ? "После настройки ссылок перезагрузите страницу."
                                : active.miniQuiz && active.miniQuiz.length > 0
                                  ? telegramMiniAppBase.trim()
                                    ? "Открывается только Mini App в Telegram (материал дня и тест внутри)."
                                    : "Укажите прямую ссылку Mini App в админке — квиз не идёт через чат бота."
                                  : "Ссылка откроет бота для зачёта дня без квиза."}
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="advent-locked-panel">
                  <p>Этот день ещё закрыт: контент откроется в свою дату по календарю кампании.</p>
                  <p className="advent-locked-sub">Активный день кампании совпадает с центральной линией на ленте.</p>
                </div>
              )}
            </div>
          </div>

          <div className="advent-carousel" aria-label="Лента дней адвента">
            <button type="button" className="advent-carousel__nav advent-carousel__nav--prev" onClick={goPrev} aria-label="Предыдущий день">
              <span aria-hidden>‹</span>
            </button>
            <button type="button" className="advent-carousel__nav advent-carousel__nav--next" onClick={goNext} aria-label="Следующий день">
              <span aria-hidden>›</span>
            </button>

            <div className="advent-carousel__viewport">
              <div className="advent-carousel__center-line" aria-hidden />
              <div ref={scrollerRef} className="advent-carousel__scroller" role="tablist" aria-label="Дни 1–21">
                {payload.days.map((d) => {
                  const isToday = payload.currentAdventDay === d.day;
                  return (
                    <button
                      key={d.day}
                      type="button"
                      role="tab"
                      data-advent-day={d.day}
                      aria-label={`День ${d.day}`}
                      aria-selected={selected === d.day}
                      className={[
                        "advent-tile",
                        selected === d.day ? "is-active" : "",
                        !d.unlocked ? "is-locked" : "",
                        isToday ? "is-today" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => setSelected(d.day)}
                    >
                      <div className="advent-tile__preview">
                        <span className="advent-tile__num" aria-hidden>
                          {d.day}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : payload === null && !loadError ? (
        <p className="muted">Загрузка календаря…</p>
      ) : null}
    </section>
  );
}
