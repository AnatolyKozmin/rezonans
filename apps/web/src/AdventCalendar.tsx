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

/** Тест открываем на сайте: /mini/advent/:day */
function adventTestWebHref(day: number): string {
  return `/mini/advent/${day}`;
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

export function AdventCalendar() {
  const [payload, setPayload] = useState<AdventPayload | null>(null);
  const [selected, setSelected] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const initialScrollDone = useRef(false);

  useEffect(() => {
    const loadCalendar = async () => {
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
    };

    void loadCalendar();

    // Перезагружаем в момент полуночи по МСК, чтобы открылся новый день без ручного обновления
    const scheduleRefresh = () => {
      const now = new Date();
      const msk = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Moscow",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      }).formatToParts(now);
      const h = Number(msk.find((p) => p.type === "hour")?.value ?? 0);
      const m = Number(msk.find((p) => p.type === "minute")?.value ?? 0);
      const s = Number(msk.find((p) => p.type === "second")?.value ?? 0);
      const msUntilMidnight = ((23 - h) * 3600 + (59 - m) * 60 + (60 - s)) * 1000;
      return window.setTimeout(() => {
        void loadCalendar();
        // После полуночи перепланируем на следующую
        window.setTimeout(scheduleRefresh, 1000);
      }, msUntilMidnight);
    };

    const t = scheduleRefresh();
    return () => window.clearTimeout(t);
  }, []);

  const active = useMemo(() => {
    if (!payload?.days.length) return undefined;
    return payload.days.find((d) => d.day === selected);
  }, [payload, selected]);

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

  const goPrev = () => {
    setSelected((s) => Math.max(1, s - 1));
  };

  const goNext = () => {
    setSelected((s) => Math.min(21, s + 1));
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

      {payload ? (
        <div className="advent-shell">
          {active ? (
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
                          <>
                            <p className="advent-quiz-count">
                              {active.miniQuiz.length}{" "}
                              {active.miniQuiz.length === 1
                                ? "вопрос"
                                : active.miniQuiz.length < 5
                                  ? "вопроса"
                                  : "вопросов"}
                            </p>
                            <a
                              className="btn btn-primary advent-test-bot-btn"
                              href={adventTestWebHref(active.day)}
                            >
                              Пройти тест
                            </a>
                            <p className="advent-task-note">
                              Тест открывается на этом сайте — материал и вопросы в одном окне.
                            </p>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="advent-locked-panel">
                    <p>Этот день ещё закрыт — откроется по дате кампании.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="advent-stage">
              <div className="advent-stage-inner">
                <p className="advent-stage-summary" style={{ color: "var(--text-soft)" }}>
                  Выберите день из сетки ниже
                </p>
              </div>
            </div>
          )}

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
                {Array.from({ length: 21 }, (_, i) => i + 1).map((n) => {
                  const d = payload.days.find((x) => x.day === n);
                  const isUnlocked = d?.unlocked ?? false;
                  const isToday = payload.currentAdventDay === n;
                  const isActive = selected === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="tab"
                      data-advent-day={n}
                      aria-label={`День ${n}${!isUnlocked ? " — закрыт" : ""}`}
                      aria-selected={isActive}
                      className={[
                        "advent-tile",
                        isActive ? "is-active" : "",
                        !isUnlocked ? "is-locked" : "",
                        isToday ? "is-today" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => setSelected(n)}
                    >
                      <span className="advent-tile__num" aria-hidden>{n}</span>
                      {!isUnlocked && <span className="advent-tile__lock" aria-hidden>🔒</span>}
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
