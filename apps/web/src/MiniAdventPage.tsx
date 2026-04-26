import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import WebApp from "@twa-dev/sdk";

type QOption = { text: string };

type QuizQuestion = {
  id: string;
  position: number;
  prompt: string;
  kind: string;
  imageUrl: string | null;
  options?: QOption[];
};

type DayMedia = { id: string; kind: string; url: string; caption: string | null; position: number };

type DayContent = {
  title: string;
  shortSummary: string;
  materialType: string;
  extraText: string | null;
  articleUrl: string | null;
  videoUrl: string | null;
  taskPrompt: string;
  testImageUrl: string | null;
  media: DayMedia[];
};

type LoadPayload =
  | { completed: false; day: number; dayContent: DayContent; questions: QuizQuestion[]; hasQuiz: boolean }
  | { completed: true; day: number; dayContent?: DayContent };

type Phase = "material" | "quiz" | "results" | "done";

type QuizResult = {
  questionId: string;
  prompt: string;
  correct: boolean;
  correctAnswer: string | null;
};

function getWebSessionId(): string {
  const k = "mini_advent_session_id";
  const ex = localStorage.getItem(k)?.trim();
  if (ex) return ex;
  const id = `web_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  localStorage.setItem(k, id);
  return id;
}

function parseDayFromStartParam(sp: unknown): number | null {
  if (sp == null || sp === "") return null;
  const s = String(sp).trim();
  const m1 = /^advent_(\d+)$/i.exec(s);
  if (m1) {
    const n = Number(m1[1]);
    return n >= 1 && n <= 21 ? n : null;
  }
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 21 ? n : null;
}

function initQs(sessionId: string): URLSearchParams {
  const qs = new URLSearchParams();
  if (WebApp.initData) qs.set("initData", WebApp.initData);
  qs.set("sessionId", sessionId);
  return qs;
}

function DayMaterial({ dc, day }: { dc: DayContent; day: number }) {
  const sorted = useMemo(
    () => [...dc.media].sort((a, b) => a.position - b.position),
    [dc.media]
  );
  return (
    <div className="mini-material">
      <div className="mini-material__head">
        <span className="mini-badge">День {day}</span>
        <span className="mini-badge mini-badge--type">{dc.materialType}</span>
      </div>
      <h1 className="mini-material__title">{dc.title}</h1>
      {dc.shortSummary ? <p className="mini-material__summary">{dc.shortSummary}</p> : null}
      {dc.extraText?.trim() ? <p className="mini-material__extra">{dc.extraText}</p> : null}

      {sorted.length > 0 ? (
        <div className="mini-material__media">
          {sorted.map((m) => (
            <figure key={m.id} className="mini-material__media-item">
              {m.kind === "VIDEO" ? (
                <video className="mini-material__img" controls playsInline src={m.url} preload="metadata" />
              ) : (
                <img className="mini-material__img" src={m.url} alt="" loading="lazy" />
              )}
              {m.caption ? <figcaption className="mini-material__cap">{m.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : null}

      <div className="mini-material__links">
        {dc.articleUrl ? (
          <a className="mini-material__link" href={dc.articleUrl} target="_blank" rel="noreferrer">
            Открыть статью
          </a>
        ) : null}
        {dc.videoUrl ? (
          <a className="mini-material__link" href={dc.videoUrl} target="_blank" rel="noreferrer">
            Смотреть видео
          </a>
        ) : null}
      </div>

      {dc.testImageUrl ? (
        <img className="mini-material__test-img" src={dc.testImageUrl} alt="" loading="lazy" />
      ) : null}

      {dc.taskPrompt?.trim() ? (
        <p className="mini-material__task-prompt">{dc.taskPrompt}</p>
      ) : null}
    </div>
  );
}

export function MiniAdventPage() {
  const { day: dayParam } = useParams();
  const [sessionId] = useState(() => getWebSessionId());
  const [day, setDay] = useState<number | null>(null);
  const [bootReady, setBootReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<LoadPayload | null>(null);
  const [phase, setPhase] = useState<Phase>("material");

  // Quiz state
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [singleSel, setSingleSel] = useState<number | null>(null);
  const [multiSel, setMultiSel] = useState<Set<number>>(() => new Set());
  const [textVal, setTextVal] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  // Results
  const [quizResults, setQuizResults] = useState<QuizResult[] | null>(null);
  const [quizScore, setQuizScore] = useState<number | null>(null);

  useEffect(() => {
    try {
      WebApp.ready();
      WebApp.expand();
    } catch {
      /* opened as regular web page */
    }
    let n: number | null = null;
    if (dayParam != null && dayParam !== "") {
      const x = Number(dayParam);
      if (Number.isInteger(x) && x >= 1 && x <= 21) n = x;
    }
    if (n == null && WebApp.initData) {
      n = parseDayFromStartParam(WebApp.initDataUnsafe?.start_param);
    }
    // Аналитика
    const page = n != null ? `advent_${n}` : "advent";
    const pingBody: Record<string, string> = { page };
    if (WebApp.initData) pingBody.initData = WebApp.initData;
    const sid = localStorage.getItem("mini_advent_session_id");
    if (sid) pingBody.sessionId = sid;
    fetch("/api/mini/ping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pingBody) }).catch(() => {});
    setDay(n);
    setBootReady(true);
  }, [dayParam]);

  const reload = useCallback(async () => {
    if (!bootReady) return;
    if (day == null || !Number.isInteger(day) || day < 1 || day > 21) {
      setLoadError("Не удалось определить день. Откройте тест кнопкой «Пройти тест» на сайте.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setSubmitErr(null);
    try {
      const qs = initQs(sessionId);
      const r = await fetch(`/api/mini/advent/${day}?${qs.toString()}`);
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        const msg = typeof j.error === "string" ? j.error : r.statusText;
        setLoadError(msg === "locked" ? "Этот день ещё закрыт." : msg);
        setPayload(null);
        return;
      }
      const dayContent = j.dayContent as DayContent | undefined;
      if (j.completed === true) {
        setPayload({ completed: true, day: typeof j.day === "number" ? j.day : day, dayContent });
        setPhase("done");
      } else {
        if (!dayContent) {
          setLoadError("Нет данных дня");
          setPayload(null);
          return;
        }
        const qsList = Array.isArray(j.questions) ? (j.questions as QuizQuestion[]) : [];
        const hasQuiz = j.hasQuiz === true && qsList.length > 0;
        setPayload({ completed: false, day: typeof j.day === "number" ? j.day : day, dayContent, questions: qsList, hasQuiz });
        setPhase("material");
        setStep(0);
        setAnswers({});
      }
    } catch {
      setLoadError("Не удалось загрузить страницу");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [day, bootReady, sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const questions = payload && !payload.completed ? payload.questions : [];
  const q = questions[step];
  const total = questions.length;

  useEffect(() => {
    if (!q) return;
    if (q.kind === "SINGLE") {
      const prev = answers[q.id] as { selectedIndex?: number } | undefined;
      setSingleSel(typeof prev?.selectedIndex === "number" ? prev.selectedIndex : null);
    } else if (q.kind === "MULTI") {
      const prev = answers[q.id] as { selectedIndices?: number[] } | undefined;
      setMultiSel(new Set(Array.isArray(prev?.selectedIndices) ? prev.selectedIndices : []));
    } else if (q.kind === "TEXT") {
      const prev = answers[q.id] as { text?: string } | undefined;
      setTextVal(typeof prev?.text === "string" ? prev.text : "");
    } else {
      setTextVal("");
      setSingleSel(null);
      setMultiSel(new Set());
    }
  }, [q, answers]);

  const canNext = useMemo(() => {
    if (!q) return false;
    if (q.kind === "SINGLE") return singleSel !== null;
    if (q.kind === "MULTI") return multiSel.size > 0;
    if (q.kind === "TEXT") return textVal.trim().length > 0;
    if (q.kind === "IMAGE") {
      const a = answers[q.id] as { filename?: string } | undefined;
      return typeof a?.filename === "string" && a.filename.length > 0;
    }
    return false;
  }, [q, singleSel, multiSel, textVal, answers]);

  const patchCurrentAnswer = (): Record<string, unknown> | null => {
    if (!q) return null;
    if (q.kind === "SINGLE" && singleSel !== null) return { [q.id]: { selectedIndex: singleSel } };
    if (q.kind === "MULTI") return { [q.id]: { selectedIndices: [...multiSel].sort((x, y) => x - y) } };
    if (q.kind === "TEXT") return { [q.id]: { text: textVal.trim() } };
    if (q.kind === "IMAGE") {
      const a = answers[q.id] as { filename?: string } | undefined;
      if (typeof a?.filename === "string") return { [q.id]: { filename: a.filename } };
    }
    return null;
  };

  const onNext = () => {
    if (!canNext || !q) return;
    const patch = patchCurrentAnswer();
    const merged = patch ? { ...answers, ...patch } : { ...answers };
    setAnswers(merged);
    if (step + 1 >= total) {
      void doSubmitWith(merged);
      return;
    }
    setStep((s) => s + 1);
    setSubmitErr(null);
  };

  const doSubmitWith = async (merged: Record<string, unknown>) => {
    if (day == null) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const r = await fetch(`/api/mini/advent/${day}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: WebApp.initData || undefined, sessionId, answers: merged }),
      });
      const j = (await r.json()) as { error?: string; ok?: boolean; score?: number; total?: number; results?: QuizResult[] };
      if (!r.ok) {
        const msg = typeof j.error === "string" ? j.error : "Ошибка отправки";
        setSubmitErr(msg);
        return;
      }
      setPayload((prev) => ({ completed: true, day: day, dayContent: prev && !prev.completed ? prev.dayContent : undefined }));
      setQuizResults(j.results ?? null);
      setQuizScore(j.score ?? null);
      setPhase("results");
    } catch {
      setSubmitErr("Сеть или сервер недоступны. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  };

  const onImage = async (file: File | null) => {
    if (!file || !q || q.kind !== "IMAGE" || day == null) return;
    setImageUploading(true);
    setSubmitErr(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const qs = initQs(sessionId);
      const r = await fetch(`/api/mini/advent/${day}/question/${q.id}/image?${qs.toString()}`, {
        method: "POST",
        body: fd,
      });
      const j = (await r.json()) as { filename?: string; error?: string };
      if (!r.ok || !j.filename) {
        setSubmitErr(j.error ?? "Не удалось загрузить файл");
        return;
      }
      setAnswers((a) => ({ ...a, [q.id]: { filename: j.filename } }));
    } catch {
      setSubmitErr("Ошибка загрузки файла");
    } finally {
      setImageUploading(false);
    }
  };

  // — Loading / error screens —

  if (!bootReady || loading) {
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

  if (day == null || day < 1 || day > 21) {
    return (
      <div className="mini-shell mini-shell--center">
        <p className="mini-alert">Не удалось определить день теста.</p>
        <Link to="/" className="mini-back-link">← На главную</Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mini-shell mini-shell--center">
        <p className="mini-alert">{loadError}</p>
        <Link to="/" className="mini-back-link">← На главную</Link>
      </div>
    );
  }

  // — Results phase —
  if (phase === "results" && quizResults) {
    const total = quizResults.length;
    const score = quizScore ?? quizResults.filter((r) => r.correct).length;
    const allCorrect = score === total;
    return (
      <div className="mini-shell">
        <div className="mini-shell__scroll">
          <div className="mini-results">
            <div className={`mini-results__score ${allCorrect ? "mini-results__score--perfect" : ""}`}>
              <span className="mini-results__score-num">{score}</span>
              <span className="mini-results__score-sep">/</span>
              <span className="mini-results__score-total">{total}</span>
            </div>
            <p className="mini-results__label">
              {allCorrect
                ? "Все верно — отличная работа!"
                : score === 0
                  ? "В этот раз не угадал — посмотри правильные ответы ниже."
                  : `Правильных ответов: ${score} из ${total}`}
            </p>

            <ul className="mini-results__list">
              {quizResults.map((r, i) => (
                <li key={r.questionId} className={`mini-results__item ${r.correct ? "mini-results__item--ok" : "mini-results__item--err"}`}>
                  <span className="mini-results__item-icon" aria-hidden>{r.correct ? "✓" : "✗"}</span>
                  <div className="mini-results__item-body">
                    <p className="mini-results__item-prompt">
                      <span className="mini-results__item-num">{i + 1}.</span> {r.prompt}
                    </p>
                    {!r.correct && r.correctAnswer ? (
                      <p className="mini-results__item-answer">
                        Правильно: <strong>{r.correctAnswer}</strong>
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mini-footer">
          {WebApp.initData ? null : (
            <Link to="/" className="mini-btn mini-btn--ghost">
              ← На сайт
            </Link>
          )}
          <button
            type="button"
            className="mini-btn mini-btn--primary"
            onClick={() => setPhase("done")}
          >
            {allCorrect ? "Отлично!" : "Понятно"}
          </button>
        </div>
      </div>
    );
  }

  // — Done screen —
  if (phase === "done" || payload?.completed) {
    const dc = payload && payload.completed ? payload.dayContent : undefined;
    return (
      <div className="mini-shell mini-shell--center">
        <div className="mini-success">
          <div className="mini-success__icon" aria-hidden>✓</div>
          <h2 className="mini-success__title">
            {dc?.title ? `«${dc.title}»` : `День ${day}`} — засчитан!
          </h2>
          <p className="mini-muted">Отличная работа. Возвращайся завтра за следующим заданием.</p>
        </div>
        <div className="mini-done-actions">
          {WebApp.initData ? (
            <button type="button" className="mini-btn mini-btn--primary" onClick={() => WebApp.close()}>
              Закрыть
            </button>
          ) : (
            <Link to="/" className="mini-btn mini-btn--primary">
              На главную
            </Link>
          )}
        </div>
      </div>
    );
  }

  const p = payload as Extract<LoadPayload, { completed: false }> | null;
  if (!p) return null;
  const { dayContent, hasQuiz } = p;

  // — Material phase —
  if (phase === "material") {
    return (
      <div className="mini-shell">
        <div className="mini-shell__scroll">
          <DayMaterial dc={dayContent} day={day} />
        </div>
        <div className="mini-footer">
          {WebApp.initData ? null : (
            <Link to="/" className="mini-btn mini-btn--ghost">
              ← На сайт
            </Link>
          )}
          {hasQuiz ? (
            <button
              type="button"
              className="mini-btn mini-btn--primary"
              onClick={() => { setPhase("quiz"); setStep(0); setAnswers({}); setSubmitErr(null); }}
            >
              Пройти тест
            </button>
          ) : (
            <p className="mini-muted" style={{ textAlign: "center", flex: 1 }}>
              Тест для этого дня не предусмотрен
            </p>
          )}
        </div>
      </div>
    );
  }

  // — Quiz phase —
  if (!q) {
    return (
      <div className="mini-shell mini-shell--center">
        <p className="mini-muted">Вопросы загружаются…</p>
      </div>
    );
  }

  const progressPct = total > 0 ? Math.round(((step) / total) * 100) : 0;

  return (
    <div className="mini-shell mini-shell--quiz">
      <header className="mini-quiz-header">
        <button
          type="button"
          className="mini-quiz-header__back"
          onClick={() => { setPhase("material"); setSubmitErr(null); }}
          aria-label="Назад к материалу"
        >
          ‹
        </button>
        <div className="mini-quiz-header__info">
          <span className="mini-quiz-header__day">День {day}</span>
          <span className="mini-quiz-header__step">{step + 1} / {total}</span>
        </div>
      </header>

      <div className="mini-progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
        <div className="mini-progress-bar__fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="mini-shell__scroll">
        <article className="mini-q-card">
          {q.imageUrl ? (
            <img className="mini-q-card__img" src={q.imageUrl} alt="" loading="lazy" decoding="async" />
          ) : null}
          <p className="mini-q-card__prompt">{q.prompt}</p>

          {q.kind === "SINGLE" && q.options ? (
            <div className="mini-options" role="radiogroup" aria-label="Выберите один вариант">
              {q.options.map((o, i) => (
                <label key={i} className={`mini-option ${singleSel === i ? "mini-option--selected" : ""}`}>
                  <input type="radio" name="single" checked={singleSel === i} onChange={() => setSingleSel(i)} />
                  <span className="mini-option__mark" aria-hidden />
                  <span className="mini-option__text">{o.text || `Вариант ${i + 1}`}</span>
                </label>
              ))}
            </div>
          ) : null}

          {q.kind === "MULTI" && q.options ? (
            <div className="mini-options" aria-label="Выберите все верные варианты">
              <p className="mini-options__hint">Отметьте все верные</p>
              {q.options.map((o, i) => {
                const on = multiSel.has(i);
                return (
                  <label key={i} className={`mini-option ${on ? "mini-option--selected" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        setMultiSel((prev) => {
                          const n = new Set(prev);
                          if (n.has(i)) n.delete(i);
                          else n.add(i);
                          return n;
                        });
                      }}
                    />
                    <span className="mini-option__mark" aria-hidden />
                    <span className="mini-option__text">{o.text || `Вариант ${i + 1}`}</span>
                  </label>
                );
              })}
            </div>
          ) : null}

          {q.kind === "TEXT" ? (
            <input
              className="mini-text-input"
              type="text"
              value={textVal}
              onChange={(e) => setTextVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canNext) onNext(); }}
              placeholder="Ваш ответ"
              autoComplete="off"
            />
          ) : null}

          {q.kind === "IMAGE" ? (
            <div className="mini-file-row">
              <label className="mini-btn mini-btn--ghost mini-file-label">
                {imageUploading ? "Загрузка…" : "Выбрать фото"}
                <input
                  type="file"
                  accept="image/*"
                  className="mini-file-input"
                  disabled={imageUploading}
                  onChange={(e) => void onImage(e.target.files?.[0] ?? null)}
                />
              </label>
              {(answers[q.id] as { filename?: string } | undefined)?.filename ? (
                <span className="mini-file-ok">✓ Загружено</span>
              ) : null}
            </div>
          ) : null}
        </article>
      </div>

      {submitErr ? <p className="mini-alert mini-alert--quiz">{submitErr}</p> : null}

      <div className="mini-footer">
        {step > 0 ? (
          <button
            type="button"
            className="mini-btn mini-btn--ghost"
            disabled={submitting}
            onClick={() => { setStep((s) => Math.max(0, s - 1)); setSubmitErr(null); }}
          >
            Назад
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="mini-btn mini-btn--primary"
          disabled={!canNext || submitting || imageUploading}
          onClick={onNext}
        >
          {step + 1 >= total ? (submitting ? "Отправка…" : "Отправить") : "Далее →"}
        </button>
      </div>
    </div>
  );
}
