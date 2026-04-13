import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type AdventMediaPublic = {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  position: number;
};

export type AdventDayPublic = {
  day: number;
  title: string;
  materialType: string;
  shortSummary: string;
  articleUrl?: string | null;
  videoUrl?: string | null;
  extraText?: string | null;
  taskPrompt: string;
  unlocked: boolean;
  media?: AdventMediaPublic[];
};

type AdventPayload = {
  currentAdventDay: number | null;
  days: AdventDayPublic[];
};

const TYPE_LABEL: Record<string, string> = {
  ARTICLE: "Статья",
  BADGE: "Плашка",
  VIDEO: "Видео",
};

/** Цвет плашки снизу карточки — три «недели» кампании */
function captionBarBg(day: number): string {
  if (day <= 7) return "#5c3d9e";
  if (day <= 14) return "#2563eb";
  return "#0d9488";
}

export function AdventCalendar() {
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

  const active = useMemo(
    () => payload?.days.find((d) => d.day === selected),
    [payload, selected]
  );

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
        Каждый день открывается по дате кампании. Листайте ленту и нажимайте на карточку — сверху материал дня. Задание и прогресс — в{" "}
        <a href="#hero-cta">Telegram-боте</a>.
      </p>

      {loadError ? <p className="alert">{loadError}</p> : null}

      {payload && active ? (
        <div className="advent-shell">
          <div className="advent-stage" aria-live="polite">
            <div key={selected} className="advent-stage-inner">
              <div className="advent-stage-head">
                <span className="advent-badge">
                  {TYPE_LABEL[active.materialType] ?? active.materialType} · день {active.day}
                </span>
                {!active.unlocked ? <span className="advent-lock-pill">скоро</span> : null}
              </div>
              <h3 className="advent-stage-title">{active.title}</h3>
              <p className="advent-stage-summary">{active.shortSummary}</p>

              {active.unlocked ? (
                <>
                  {active.extraText ? <p className="advent-extra">{active.extraText}</p> : null}

                  {active.media && active.media.length > 0 ? (
                    <div className="advent-media-stack">
                      {active.media.map((m) => (
                        <figure key={m.id} className="advent-media-block">
                          {m.kind === "VIDEO" ? (
                            <video className="advent-media-video" controls playsInline src={m.url} preload="metadata" />
                          ) : (
                            <img className="advent-media-image" src={m.url} alt="" loading="lazy" decoding="async" />
                          )}
                          {m.caption ? <figcaption className="advent-media-cap">{m.caption}</figcaption> : null}
                        </figure>
                      ))}
                    </div>
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
                  <p className="advent-task-hint">
                    <strong>Задание:</strong> {active.taskPrompt}{" "}
                    <span className="advent-task-note">— выполняется в боте после просмотра.</span>
                  </p>
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
                  const typeShort = TYPE_LABEL[d.materialType] ?? d.materialType;
                  return (
                    <button
                      key={d.day}
                      type="button"
                      role="tab"
                      data-advent-day={d.day}
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
                        <span className="advent-tile__type">{typeShort}</span>
                        <span className="advent-tile__num" aria-hidden>
                          {d.day}
                        </span>
                      </div>
                      <div className="advent-tile__caption" style={{ background: captionBarBg(d.day) }}>
                        <span className="advent-tile__caption-title">День {d.day}</span>
                        <span className="advent-tile__caption-sub">({typeShort})</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : !loadError ? (
        <p className="muted">Загрузка календаря…</p>
      ) : null}
    </section>
  );
}
