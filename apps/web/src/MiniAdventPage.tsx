import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
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

type DayContent = {
  title: string;
  shortSummary: string;
  materialType: string;
  extraText: string | null;
  articleUrl: string | null;
  videoUrl: string | null;
  taskPrompt: string;
  testImageUrl: string | null;
  media: Array<{ id: string; kind: string; url: string; caption: string | null; position: number }>;
};

type LoadOk = { completed: false; day: number; dayContent: DayContent; questions: QuizQuestion[] };
type LoadDone = { completed: true; day: number; dayContent?: DayContent };

function initQs(): URLSearchParams {
  const qs = new URLSearchParams();
  if (WebApp.initData) qs.set("initData", WebApp.initData);
  return qs;
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

export function MiniAdventPage() {
  const { day: dayParam } = useParams();
  const [day, setDay] = useState<number | null>(null);
  const [bootReady, setBootReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<LoadOk | LoadDone | null>(null);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [singleSel, setSingleSel] = useState<number | null>(null);
  const [multiSel, setMultiSel] = useState<Set<number>>(() => new Set());
  const [textVal, setTextVal] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  useEffect(() => {
    WebApp.ready();
    WebApp.expand();
    let n: number | null = null;
    if (dayParam != null && dayParam !== "") {
      const x = Number(dayParam);
      if (Number.isInteger(x) && x >= 1 && x <= 21) n = x;
    }
    if (n == null) {
      n = parseDayFromStartParam(WebApp.initDataUnsafe?.start_param);
    }
    setDay(n);
    setBootReady(true);
  }, [dayParam]);

  const reload = useCallback(async () => {
    if (!bootReady) return;
    if (day == null || !Number.isInteger(day) || day < 1 || day > 21) {
      setLoadError("Не удалось определить день. Откройте тест кнопкой «Пройти тест» на сайте или в боте.");
      setLoading(false);
      return;
    }
    if (!WebApp.initData) {
      setLoadError("Откройте тест в Telegram.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const qs = initQs();
      const r = await fetch(`/api/mini/advent/${day}?${qs.toString()}`);
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok) {
        const err = typeof j.error === "string" ? j.error : r.statusText;
        setLoadError(err);
        setPayload(null);
        return;
      }
      const dayContent = j.dayContent as DayContent | undefined;
      if (j.completed === true) {
        setPayload({
          completed: true,
          day: typeof j.day === "number" ? j.day : day,
          dayContent,
        });
      } else {
        const qsList = Array.isArray(j.questions) ? (j.questions as QuizQuestion[]) : [];
        if (!dayContent) {
          setLoadError("Нет данных дня");
          setPayload(null);
          return;
        }
        setPayload({
          completed: false,
          day: typeof j.day === "number" ? j.day : day,
          dayContent,
          questions: qsList,
        });
        setStep(0);
        setAnswers({});
      }
    } catch {
      setLoadError("Не удалось загрузить тест");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [day, bootReady]);

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
  };

  const doSubmitWith = async (merged: Record<string, unknown>) => {
    if (!WebApp.initData || day == null) return;
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const r = await fetch(`/api/mini/advent/${day}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ initData: WebApp.initData, answers: merged as Record<string, unknown> }),
      });
      const j = (await r.json()) as { error?: string; questionId?: string };
      if (!r.ok) {
        const msg =
          j.error === "wrong_answer"
            ? "Есть неверный ответ — проверьте вопросы и попробуйте снова."
            : typeof j.error === "string"
              ? j.error
              : "Ошибка отправки";
        setSubmitErr(msg);
        WebApp.showAlert(msg);
        return;
      }
      WebApp.showAlert("Готово! День засчитан.");
      setPayload({ completed: true, day });
    } catch {
      const msg = "Сеть или сервер недоступны";
      setSubmitErr(msg);
      WebApp.showAlert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onImage = async (file: File | null) => {
    if (!file || !q || q.kind !== "IMAGE" || !WebApp.initData || day == null) return;
    setImageUploading(true);
    setSubmitErr(null);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const qs = initQs();
      const r = await fetch(`/api/mini/advent/${day}/question/${q.id}/image?${qs.toString()}`, {
        method: "POST",
        body: fd,
      });
      const j = (await r.json()) as { filename?: string; error?: string };
      if (!r.ok || !j.filename) {
        WebApp.showAlert(j.error ?? "Не удалось загрузить файл");
        return;
      }
      setAnswers((a) => ({ ...a, [q.id]: { filename: j.filename } }));
    } catch {
      WebApp.showAlert("Ошибка загрузки");
    } finally {
      setImageUploading(false);
    }
  };

  if (!bootReady) {
    return (
      <div className="mini-shell mini-shell--loading">
        <div className="mini-loading" aria-busy>
          <span className="mini-loading__dot" />
          <span className="mini-loading__dot" />
          <span className="mini-loading__dot" />
        </div>
        <p className="mini-muted">Подключение к Telegram…</p>
      </div>
    );
  }

  if (day == null || day < 1 || day > 21) {
    return (
      <div className="mini-shell mini-shell--loading">
        <p className="mini-alert">Не удалось определить день теста. Откройте кнопкой «Пройти тест» на сайте или в боте.</p>
        <button type="button" className="mini-btn mini-btn--ghost" onClick={() => WebApp.close()}>
          Закрыть
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mini-shell mini-shell--loading">
        <div className="mini-loading" aria-busy>
          <span className="mini-loading__dot" />
          <span className="mini-loading__dot" />
          <span className="mini-loading__dot" />
        </div>
        <p className="mini-muted">Загрузка теста…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mini-shell mini-shell--loading">
        <p className="mini-alert">{loadError}</p>
        <button type="button" className="mini-btn mini-btn--ghost" onClick={() => WebApp.close()}>
          Закрыть
        </button>
      </div>
    );
  }

  if (payload?.completed) {
    const title = payload.dayContent?.title;
    return (
      <div className="mini-shell mini-shell--quiz">
        <div className="mini-success-card">
          <div className="mini-success-card__icon">✓</div>
          <p className="mini-done">
            {title ? `${title} — день засчитан.` : `День ${payload.day} засчитан.`}
          </p>
        </div>
        <button type="button" className="mini-btn mini-btn--primary" onClick={() => WebApp.close()}>
          Закрыть
        </button>
      </div>
    );
  }

  if (!q) {
    return (
      <div className="mini-shell mini-shell--loading">
        <p className="mini-alert">Нет вопросов</p>
      </div>
    );
  }

  const dc = payload && !payload.completed ? payload.dayContent : null;

  return (
    <div className="mini-shell mini-shell--quiz">
      <header className="mini-header">
        <div className="mini-header__row">
          <span className="mini-header__badge">День {day}</span>
          {total > 0 ? (
            <span className="mini-header__progress">
              Вопрос {step + 1} / {total}
            </span>
          ) : null}
        </div>
      </header>

      <main className="mini-main">
        {dc ? (
          <div className="mini-day-block">
            <p className="mini-hero__badge">Материал дня</p>
            <h1 className="mini-title">{dc.title}</h1>
            <p className="mini-sub">{dc.shortSummary}</p>
            {dc.extraText?.trim() ? <p className="mini-muted mini-day-extra">{dc.extraText}</p> : null}
            <div className="mini-day-links">
              {dc.articleUrl ? (
                <a className="mini-day-link" href={dc.articleUrl} target="_blank" rel="noreferrer">
                  Статья
                </a>
              ) : null}
              {dc.videoUrl ? (
                <a className="mini-day-link" href={dc.videoUrl} target="_blank" rel="noreferrer">
                  Видео
                </a>
              ) : null}
            </div>
            {dc.testImageUrl ? (
              <img className="mini-q-card__img mini-day-test-img" src={dc.testImageUrl} alt="" loading="lazy" />
            ) : null}
            {dc.media.length > 0 ? (
              <div className="mini-day-media">
                {dc.media.map((m) => (
                  <figure key={m.id} className="mini-day-media-item">
                    {m.kind === "VIDEO" ? (
                      <video className="mini-q-card__img" controls playsInline src={m.url} preload="metadata" />
                    ) : (
                      <img className="mini-q-card__img" src={m.url} alt="" loading="lazy" />
                    )}
                    {m.caption ? <figcaption className="mini-muted">{m.caption}</figcaption> : null}
                  </figure>
                ))}
              </div>
            ) : null}
            {dc.taskPrompt?.trim() ? <p className="mini-day-task-prompt">{dc.taskPrompt}</p> : null}
            <h2 className="mini-section-title">Тест</h2>
          </div>
        ) : null}
        <article className="mini-q-card">
          <div className="mini-q-card__top">
            <span className="mini-q-card__step">Вопрос {step + 1}</span>
          </div>
          {q.imageUrl ? (
            <img className="mini-q-card__img" src={q.imageUrl} alt="" loading="lazy" decoding="async" />
          ) : null}
          <p className="mini-q-card__prompt">{q.prompt}</p>

          {q.kind === "SINGLE" && q.options ? (
            <div className="mini-options" role="radiogroup">
              {q.options.map((o, i) => (
                <label
                  key={i}
                  className={`mini-option ${singleSel === i ? "mini-option--selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="single"
                    checked={singleSel === i}
                    onChange={() => setSingleSel(i)}
                  />
                  <span>{o.text || `Вариант ${i + 1}`}</span>
                </label>
              ))}
            </div>
          ) : null}

          {q.kind === "MULTI" && q.options ? (
            <div className="mini-options">
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
                    <span>{o.text || `Вариант ${i + 1}`}</span>
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
                <span className="mini-muted">Файл загружен</span>
              ) : null}
            </div>
          ) : null}
        </article>
      </main>

      {submitErr ? <p className="mini-alert">{submitErr}</p> : null}

      <div className="mini-footer">
        {step > 0 ? (
          <button
            type="button"
            className="mini-btn mini-btn--ghost"
            disabled={submitting}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Назад
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="mini-btn mini-btn--primary"
          disabled={!canNext || submitting}
          onClick={onNext}
        >
          {step + 1 >= total ? (submitting ? "Отправка…" : "Готово") : "Далее"}
        </button>
      </div>
    </div>
  );
}
