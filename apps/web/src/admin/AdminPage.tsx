import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminNav } from "./AdminNav";
import { ADMIN_KEY_STORAGE, normalizeAdminKey, readStoredAdminKey } from "./keyStorage";

type MediaRow = {
  id: string;
  kind: string;
  filename: string;
  caption: string | null;
  position: number;
};

type QuestionRow = {
  id: string;
  position: number;
  prompt: string;
  kind: string;
  acceptAnyAnswer?: boolean;
  optionsJson: string | null;
  textAnswersJson: string | null;
  imageFilename: string | null;
};

type DayRow = {
  day: number;
  title: string;
  materialType: string;
  shortSummary: string;
  articleUrl: string | null;
  videoUrl: string | null;
  extraText: string | null;
  taskPrompt: string;
  taskKind: string;
  quizOptions: string | null;
  correctIndex: number | null;
  testImageFilename: string | null;
  questions?: QuestionRow[];
  media: MediaRow[];
};

type QKind = "SINGLE" | "MULTI" | "TEXT" | "IMAGE";

type QuestionDraft = {
  key: string;
  prompt: string;
  kind: QKind;
  acceptAnyAnswer: boolean;
  options: { text: string; correct: boolean }[];
  textAnswersLines: string;
};

function defaultOptions(kind: QKind): { text: string; correct: boolean }[] {
  if (kind === "SINGLE") {
    return [
      { text: "", correct: true },
      { text: "", correct: false },
    ];
  }
  if (kind === "MULTI") {
    return [
      { text: "", correct: true },
      { text: "", correct: false },
      { text: "", correct: false },
    ];
  }
  return [];
}

function draftsFromApi(rows: QuestionRow[] | undefined): QuestionDraft[] {
  if (!rows?.length) return [];
  return rows.map((q) => ({
    key: q.id,
    prompt: q.prompt,
    kind: q.kind as QKind,
    acceptAnyAnswer: q.acceptAnyAnswer === true,
    options: q.optionsJson
      ? (JSON.parse(q.optionsJson) as { text: string; correct: boolean }[])
      : defaultOptions(q.kind as QKind),
    textAnswersLines: q.textAnswersJson
      ? (JSON.parse(q.textAnswersJson) as string[]).join("\n")
      : "",
  }));
}

export function AdminPage() {
  const [key, setKey] = useState(readStoredAdminKey);
  const [savedKey, setSavedKey] = useState(readStoredAdminKey);
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [selected, setSelected] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadKind, setUploadKind] = useState<"IMAGE" | "IMAGE_TEXT" | "VIDEO">("IMAGE");
  const [uploadCaption, setUploadCaption] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingTestImage, setPendingTestImage] = useState<File | null>(null);

  // Обратный отсчёт до следующего дня
  const [nextDayAt, setNextDayAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>("");
  useEffect(() => {
    fetch("/api/advent").then((r) => r.json()).then((j) => { if (j.nextDayAt) setNextDayAt(j.nextDayAt); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!nextDayAt) return;
    const tick = () => {
      const ms = new Date(nextDayAt).getTime() - Date.now();
      if (ms <= 0) { setCountdown("сейчас откроется"); return; }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1_000);
      setCountdown(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextDayAt]);
  const [mediaCaptionDrafts, setMediaCaptionDrafts] = useState<Record<string, string>>({});
  const [savingCaptionId, setSavingCaptionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    shortSummary: "",
    materialType: "ARTICLE",
    extraText: "",
    articleUrl: "",
    videoUrl: "",
    taskPrompt: "",
  });
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[]>([]);
  const [savingQuestions, setSavingQuestions] = useState(false);

  const authHeaders = useCallback(
    (): HeadersInit => ({
      "content-type": "application/json",
      "x-admin-key": savedKey,
    }),
    [savedKey]
  );

  const loadDays = useCallback(async () => {
    if (!savedKey) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/advent/days", { headers: authHeaders() });
      if (r.status === 401) {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setSavedKey("");
        setKey("");
        setDays(null);
        setErr(
          "Ключ не подошёл. Для Docker с compose без своего ADMIN_API_KEY в корневом .env введите: dev-admin-key (без кавычек). Иначе — то же значение, что в ADMIN_API_KEY на сервере."
        );
        return;
      }
      if (!r.ok) throw new Error(await r.text());
      const data: DayRow[] = await r.json();
      setDays(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [savedKey, authHeaders]);

  useEffect(() => {
    loadDays();
  }, [loadDays]);

  useEffect(() => {
    setPendingFile(null);
    setPendingTestImage(null);
    setUploadCaption("");
    setMediaCaptionDrafts({});
  }, [selected]);

  const current = days?.find((d) => d.day === selected);
  const dayForApi = current?.day ?? selected;

  useEffect(() => {
    if (current) {
      setForm({
        title: current.title,
        shortSummary: current.shortSummary,
        materialType: current.materialType,
        extraText: current.extraText ?? "",
        articleUrl: current.articleUrl ?? "",
        videoUrl: current.videoUrl ?? "",
        taskPrompt: current.taskPrompt ?? "",
      });
      setQuestionDrafts(draftsFromApi(current.questions));
      return;
    }
    if (days === null) return;
    setForm({
      title: `День ${selected}`,
      shortSummary: "",
      materialType: "ARTICLE",
      extraText: "",
      articleUrl: "",
      videoUrl: "",
      taskPrompt: "",
    });
    setQuestionDrafts([]);
  }, [current, selected, days]);

  const saveDay = async () => {
    if (!savedKey) return;
    setErr(null);
    try {
      const r = await fetch(`/api/admin/advent/days/${dayForApi}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({
          title: form.title,
          shortSummary: form.shortSummary,
          materialType: form.materialType,
          extraText: form.extraText || null,
          articleUrl: form.articleUrl || null,
          videoUrl: form.videoUrl || null,
          taskPrompt: form.taskPrompt,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  };

  const saveQuestions = async () => {
    if (!savedKey) return;
    for (let i = 0; i < questionDrafts.length; i++) {
      const d = questionDrafts[i]!;
      if (!d.prompt.trim()) {
        setErr(`Вопрос ${i + 1}: введите текст вопроса`);
        return;
      }
      if (d.kind === "TEXT" && !d.acceptAnyAnswer) {
        const lines = d.textAnswersLines.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length < 1) {
          setErr(`Вопрос ${i + 1}: укажите эталонные ответы (каждый с новой строки)`);
          return;
        }
      }
      if (d.kind === "SINGLE" || d.kind === "MULTI") {
        const opts = d.options.map((o) => o.text.trim()).filter(Boolean);
        if (opts.length < 2) {
          setErr(`Вопрос ${i + 1}: нужно минимум два непустых варианта`);
          return;
        }
        if (!d.acceptAnyAnswer) {
          const nCorrect = d.options.filter((o) => o.correct && o.text.trim()).length;
          if (d.kind === "SINGLE" && nCorrect !== 1) {
            setErr(`Вопрос ${i + 1}: отметьте ровно один верный вариант`);
            return;
          }
          if (d.kind === "MULTI" && nCorrect < 1) {
            setErr(`Вопрос ${i + 1}: отметьте хотя бы один верный вариант`);
            return;
          }
        }
      }
    }

    const payload = questionDrafts.map((d) => {
      const any = d.acceptAnyAnswer ? { acceptAnyAnswer: true as const } : {};
      if (d.kind === "TEXT") {
        return {
          prompt: d.prompt.trim(),
          kind: d.kind,
          ...any,
          textAnswers: d.textAnswersLines.split("\n").map((l) => l.trim()).filter(Boolean),
        };
      }
      if (d.kind === "IMAGE") {
        return { prompt: d.prompt.trim(), kind: d.kind, ...any };
      }
      return {
        prompt: d.prompt.trim(),
        kind: d.kind,
        ...any,
        options: d.options
          .filter((o) => o.text.trim())
          .map((o) => ({ text: o.text.trim(), correct: o.correct })),
      };
    });

    setErr(null);
    setSavingQuestions(true);
    try {
      const r = await fetch(`/api/admin/advent/days/${dayForApi}/questions`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ questions: payload }),
      });
      if (!r.ok) throw new Error(await r.text());
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения вопросов");
    } finally {
      setSavingQuestions(false);
    }
  };

  const uploadTestImage = async (file: File) => {
    if (!savedKey) return;
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await fetch(`/api/admin/advent/days/${dayForApi}/test-image`, {
        method: "POST",
        headers: { "x-admin-key": savedKey },
        body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      setPendingTestImage(null);
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    }
  };

  const deleteTestImage = async () => {
    if (!savedKey || !confirm("Убрать фото у теста?")) return;
    setErr(null);
    try {
      const r = await fetch(`/api/admin/advent/days/${dayForApi}/test-image`, {
        method: "DELETE",
        headers: { "x-admin-key": savedKey },
      });
      if (!r.ok) throw new Error(await r.text());
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const login = () => {
    const n = normalizeAdminKey(key);
    sessionStorage.setItem(ADMIN_KEY_STORAGE, n);
    setSavedKey(n);
    setKey(n);
    setErr(null);
  };

  const logout = () => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setSavedKey("");
    setDays(null);
    setKey("");
  };

  const uploadFile = async (file: File) => {
    if (!savedKey) return;
    if (uploadKind === "IMAGE_TEXT" && !uploadCaption.trim()) {
      setErr("Для «фото с текстом» введите подпись");
      return;
    }
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", uploadKind);
    if (uploadCaption.trim()) fd.append("caption", uploadCaption.trim());
    try {
      const r = await fetch(`/api/admin/advent/days/${dayForApi}/media`, {
        method: "POST",
        headers: { "x-admin-key": savedKey },
        body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      setUploadCaption("");
      setPendingFile(null);
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    }
  };

  const saveMediaCaption = async (id: string, kind: string) => {
    if (!savedKey) return;
    const row = current?.media?.find((x) => x.id === id);
    if (!row) return;
    const text =
      mediaCaptionDrafts[id] !== undefined ? mediaCaptionDrafts[id] : (row.caption ?? "");
    if (kind === "IMAGE_TEXT" && !text.trim()) {
      setErr("Для «фото с текстом» подпись не может быть пустой");
      return;
    }
    setErr(null);
    const caption = text.trim() ? text.trim() : null;
    setSavingCaptionId(id);
    try {
      const r = await fetch(`/api/admin/advent/media/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ caption }),
      });
      if (!r.ok) throw new Error(await r.text());
      setMediaCaptionDrafts((d) => {
        const next = { ...d };
        delete next[id];
        return next;
      });
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения подписи");
    } finally {
      setSavingCaptionId(null);
    }
  };

  const deleteMedia = async (id: string) => {
    if (!savedKey || !confirm("Удалить материал?")) return;
    try {
      const r = await fetch(`/api/admin/advent/media/${id}`, {
        method: "DELETE",
        headers: { "x-admin-key": savedKey },
      });
      if (!r.ok) throw new Error(await r.text());
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  if (!savedKey) {
    return (
      <div className="admin-shell">
        <div className="admin-card">
          <h1 className="admin-title">Админка адвента</h1>
          <p className="admin-muted">
            Как у переменной <span className="mono">ADMIN_API_KEY</span> на API (корневой <span className="mono">.env</span> для Docker compose или{" "}
            <span className="mono">apps/api/.env</span> локально). Кавычки в поле вводить не нужно.
          </p>
          {err ? <div className="admin-alert">{err}</div> : null}
          <input
            className="admin-input"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Ключ администратора"
            autoComplete="off"
          />
          <button type="button" className="admin-btn admin-btn--primary" onClick={login}>
            Войти
          </button>
          <p className="admin-footer-link">
            <Link to="/">← На сайт</Link>
            {" · "}
            <Link to="/admin/site">FAQ и маршрут</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell admin-shell--wide">
      <header className="admin-top">
        <div>
          <h1 className="admin-title">Админка · дни адвента</h1>
          <p className="admin-muted">
            {loading || days === null
              ? "Загрузка списка дней…"
              : `День ${selected} из 21 · контент задаётся здесь; материалы — в папку uploads на сервере`}
          </p>
          {countdown && (
            <p className="admin-countdown">
              <span className="admin-countdown__label">Следующий день через</span>
              <span className="admin-countdown__time">{countdown}</span>
            </p>
          )}
        </div>
        <div className="admin-top-actions">
          <Link to="/" className="admin-link">
            На сайт
          </Link>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={logout}>
            Выйти
          </button>
        </div>
      </header>

      <AdminNav active="advent" />

      {err ? <div className="admin-alert">{err}</div> : null}

      <div className="admin-advent-stack">
        <section className="admin-day-panel" aria-label="Выбор дня адвента">
          <h2 className="admin-day-panel__title">Дни 1–21</h2>
          <p className="admin-day-panel__hint">Выберите день — ниже откроются поля и файлы для этого номера.</p>
          <div className="admin-day-grid" role="tablist" aria-label="Дни адвента">
            {Array.from({ length: 21 }, (_, i) => i + 1).map((d) => {
              const dayData = days?.find((x) => x.day === d);
              const qCount = dayData?.questions?.length ?? null;
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={selected === d}
                  className={`admin-day-btn ${selected === d ? "is-active" : ""} ${qCount && qCount > 0 ? "has-quiz" : ""}`}
                  onClick={() => setSelected(d)}
                  title={qCount !== null ? (qCount > 0 ? `${qCount} вопр.` : "Без теста") : undefined}
                >
                  <span className="admin-day-btn__num">{d}</span>
                  {qCount !== null && qCount > 0 ? (
                    <span className="admin-day-btn__q" aria-label={`${qCount} вопросов`}>{qCount}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <main className="admin-main">
          {loading || days === null ? (
            <p className="admin-muted">Загрузка…</p>
          ) : (
            <>
              {!current ? (
                <p className="admin-muted" style={{ marginBottom: "1rem" }}>
                  {days.length === 0
                    ? "В базе пока нет дней — заполните поля ниже и нажмите «Сохранить день», чтобы создать этот день."
                    : `Дня ${selected} ещё нет в базе — сохраните форму, чтобы добавить его. Загрузка файлов тоже создаст день с черновиком текста (потом отредактируйте).`}
                </p>
              ) : null}
              <section className="admin-section">
                <h2>Тексты и ссылки (сайт)</h2>
                <p className="admin-muted" style={{ marginTop: "-0.5rem" }}>
                  Тип дня влияет на подписи в карточке адвента на сайте. Тест с вопросами — в Telegram Mini App (см. блок ниже).
                </p>
                <label className="admin-label">
                  Заголовок
                  <input
                    className="admin-input"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  />
                </label>
                <label className="admin-label">
                  Кратко (анонс)
                  <textarea
                    className="admin-textarea"
                    rows={3}
                    value={form.shortSummary}
                    onChange={(e) => setForm((f) => ({ ...f, shortSummary: e.target.value }))}
                  />
                </label>
                <label className="admin-label">
                  Тип дня (плашка на сайте)
                  <select
                    className="admin-input"
                    value={form.materialType}
                    onChange={(e) => setForm((f) => ({ ...f, materialType: e.target.value }))}
                  >
                    <option value="ARTICLE">ARTICLE</option>
                    <option value="BADGE">BADGE</option>
                    <option value="VIDEO">VIDEO</option>
                  </select>
                </label>
                <label className="admin-label">
                  Доп. текст
                  <textarea
                    className="admin-textarea"
                    rows={2}
                    value={form.extraText}
                    onChange={(e) => setForm((f) => ({ ...f, extraText: e.target.value }))}
                  />
                </label>
                <div className="admin-row">
                  <label className="admin-label">
                    Ссылка на статью (Telegram и т.п.)
                    <input
                      className="admin-input"
                      value={form.articleUrl}
                      onChange={(e) => setForm((f) => ({ ...f, articleUrl: e.target.value }))}
                    />
                  </label>
                  <label className="admin-label">
                    Ссылка на видео (внешняя)
                    <input
                      className="admin-input"
                      value={form.videoUrl}
                      onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
                    />
                  </label>
                </div>
                <button type="button" className="admin-btn admin-btn--primary" onClick={saveDay}>
                  Сохранить день
                </button>
              </section>

              <section className="admin-section">
                <h2>Тест дня (Mini App)</h2>
                <p className="admin-muted" style={{ marginTop: "-0.5rem" }}>
                  Вопросы проходят в Mini App в Telegram, зачёт дня — после всех верных ответов. Типы: один верный вариант, несколько верных, текст, фото-ответ.
                  Если список вопросов пуст и вы сохраните его — теста нет (для такого дня останется подтверждение в боте без квиза).
                </p>
                <label className="admin-label">
                  Вступительный текст на сайте (необязательно)
                  <textarea
                    className="admin-textarea"
                    rows={2}
                    value={form.taskPrompt}
                    onChange={(e) => setForm((f) => ({ ...f, taskPrompt: e.target.value }))}
                    placeholder="Коротко о тесте — показывается на сайте над кнопкой в Telegram"
                  />
                </label>
                <div className="admin-row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: "1rem" }}>
                  <label className="admin-label admin-file" style={{ marginBottom: 0 }}>
                    Иллюстрация к блоку теста на сайте (необязательно)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        setPendingTestImage(f ?? null);
                      }}
                    />
                  </label>
                  {pendingTestImage ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      onClick={() => void uploadTestImage(pendingTestImage)}
                    >
                      Загрузить
                    </button>
                  ) : null}
                </div>
                {pendingTestImage ? (
                  <p className="admin-muted" style={{ margin: "0.25rem 0 0" }}>
                    Файл: <span className="mono">{pendingTestImage.name}</span>
                  </p>
                ) : null}
                {current?.testImageFilename ? (
                  <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-start" }}>
                    <img
                      className="admin-media-img"
                      src={`/uploads/${current.testImageFilename}`}
                      alt=""
                      style={{ maxHeight: 160, borderRadius: 8 }}
                    />
                    <button type="button" className="admin-btn admin-btn--danger" onClick={() => void deleteTestImage()}>
                      Убрать иллюстрацию
                    </button>
                  </div>
                ) : null}

                <div style={{ marginTop: "1.25rem" }}>
                  <div className="admin-row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
                    <h3 className="admin-muted" style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                      Вопросы
                    </h3>
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost"
                      onClick={() =>
                        setQuestionDrafts((list) => [
                          ...list,
                          {
                            key: crypto.randomUUID(),
                            prompt: "",
                            kind: "SINGLE",
                            acceptAnyAnswer: false,
                            options: defaultOptions("SINGLE"),
                            textAnswersLines: "",
                          },
                        ])
                      }
                    >
                      + Добавить вопрос
                    </button>
                  </div>

                  {questionDrafts.length === 0 ? (
                    <p className="admin-muted" style={{ marginTop: "0.5rem" }}>
                      Пока нет вопросов — добавьте или сохраните пустой список, чтобы убрать тест.
                    </p>
                  ) : null}

                  <ul style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}>
                    {questionDrafts.map((qd, qi) => (
                      <li
                        key={qd.key}
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          borderRadius: 12,
                          padding: "1rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        <div className="admin-row" style={{ flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center" }}>
                          <span className="admin-badge">#{qi + 1}</span>
                          <span className="admin-badge" style={{ background: "rgba(126,82,255,0.18)", color: "#c5aaff" }}>
                            {qd.acceptAnyAnswer
                              ? "Любой ответ"
                              : qd.kind === "SINGLE"
                                ? "Один верный"
                                : qd.kind === "MULTI"
                                  ? "Несколько верных"
                                  : qd.kind === "TEXT"
                                    ? "Текст"
                                    : "Фото"}
                          </span>
                          <span style={{ flex: 1 }} />
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "1rem", minWidth: 0 }}
                            disabled={qi === 0}
                            title="Переместить вверх"
                            onClick={() =>
                              setQuestionDrafts((list) => {
                                const next = [...list];
                                [next[qi - 1], next[qi]] = [next[qi]!, next[qi - 1]!];
                                return next;
                              })
                            }
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            style={{ padding: "0.35rem 0.6rem", fontSize: "1rem", minWidth: 0 }}
                            disabled={qi >= questionDrafts.length - 1}
                            title="Переместить вниз"
                            onClick={() =>
                              setQuestionDrafts((list) => {
                                const next = [...list];
                                [next[qi], next[qi + 1]] = [next[qi + 1]!, next[qi]!];
                                return next;
                              })
                            }
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--danger"
                            style={{ padding: "0.35rem 0.75rem", fontSize: "0.82rem", minWidth: 0 }}
                            onClick={() => setQuestionDrafts((list) => list.filter((_, i) => i !== qi))}
                          >
                            Удалить
                          </button>
                        </div>
                        <label className="admin-label">
                          Текст вопроса
                          <textarea
                            className="admin-textarea"
                            rows={2}
                            value={qd.prompt}
                            onChange={(e) =>
                              setQuestionDrafts((list) =>
                                list.map((x, i) => (i === qi ? { ...x, prompt: e.target.value } : x))
                              )
                            }
                          />
                        </label>
                        <label className="admin-label">
                          Тип ответа
                          <select
                            className="admin-input"
                            value={qd.kind}
                            onChange={(e) => {
                              const kind = e.target.value as QKind;
                              setQuestionDrafts((list) =>
                                list.map((x, i) =>
                                  i === qi
                                    ? {
                                        ...x,
                                        kind,
                                        acceptAnyAnswer: false,
                                        options: kind === "SINGLE" || kind === "MULTI" ? defaultOptions(kind) : [],
                                        textAnswersLines: kind === "TEXT" ? x.textAnswersLines : "",
                                      }
                                    : x
                                )
                              );
                            }}
                          >
                            <option value="SINGLE">Один правильный вариант</option>
                            <option value="MULTI">Несколько правильных</option>
                            <option value="TEXT">Текст в поле ввода</option>
                            <option value="IMAGE">Ответ картинкой</option>
                          </select>
                        </label>

                        {(qd.kind === "SINGLE" || qd.kind === "MULTI" || qd.kind === "TEXT") && (
                          <label
                            className="admin-label"
                            style={{
                              marginTop: "0.35rem",
                              display: "flex",
                              flexDirection: "row",
                              alignItems: "flex-start",
                              gap: "0.6rem",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              style={{ marginTop: "0.2rem" }}
                              checked={qd.acceptAnyAnswer}
                              onChange={(e) =>
                                setQuestionDrafts((list) =>
                                  list.map((x, i) => (i === qi ? { ...x, acceptAnyAnswer: e.target.checked } : x))
                                )
                              }
                            />
                            <span className="admin-muted">
                              Любой ответ засчитывается (режим без одного правильного варианта)
                            </span>
                          </label>
                        )}

                        {qd.kind === "SINGLE" || qd.kind === "MULTI" ? (
                          <div style={{ marginTop: "0.5rem" }}>
                            <p className="admin-muted" style={{ margin: "0 0 0.5rem" }}>
                              {qd.acceptAnyAnswer
                                ? "Варианты (любой выбранный вариант верный)"
                                : qd.kind === "SINGLE"
                                  ? "Варианты (верный один)"
                                  : "Варианты (отметьте все верные)"}
                            </p>
                            {qd.options.map((opt, oi) => (
                              <div key={oi} className="admin-row" style={{ alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                                {qd.acceptAnyAnswer ? (
                                  <span style={{ width: "1.35rem", flexShrink: 0 }} aria-hidden />
                                ) : qd.kind === "SINGLE" ? (
                                  <input
                                    type="radio"
                                    name={`correct-${qd.key}`}
                                    checked={opt.correct}
                                    onChange={() =>
                                      setQuestionDrafts((list) =>
                                        list.map((x, i) =>
                                          i === qi
                                            ? {
                                                ...x,
                                                options: x.options.map((o, j) => ({
                                                  ...o,
                                                  correct: j === oi,
                                                })),
                                              }
                                            : x
                                        )
                                      )
                                    }
                                    aria-label="верный"
                                  />
                                ) : (
                                  <input
                                    type="checkbox"
                                    checked={opt.correct}
                                    onChange={(e) =>
                                      setQuestionDrafts((list) =>
                                        list.map((x, i) =>
                                          i === qi
                                            ? {
                                                ...x,
                                                options: x.options.map((o, j) =>
                                                  j === oi ? { ...o, correct: e.target.checked } : o
                                                ),
                                              }
                                            : x
                                        )
                                      )
                                    }
                                    aria-label="верный"
                                  />
                                )}
                                <input
                                  className="admin-input"
                                  style={{ flex: 1 }}
                                  value={opt.text}
                                  placeholder={`Вариант ${oi + 1}`}
                                  onChange={(e) =>
                                    setQuestionDrafts((list) =>
                                      list.map((x, i) =>
                                        i === qi
                                          ? {
                                              ...x,
                                              options: x.options.map((o, j) =>
                                                j === oi ? { ...o, text: e.target.value } : o
                                              ),
                                            }
                                          : x
                                      )
                                    )
                                  }
                                />
                                <button
                                  type="button"
                                  className="admin-btn admin-btn--ghost"
                                  disabled={qd.options.length <= 2}
                                  onClick={() =>
                                    setQuestionDrafts((list) =>
                                      list.map((x, i) =>
                                        i === qi
                                          ? { ...x, options: x.options.filter((_, j) => j !== oi) }
                                          : x
                                      )
                                    )
                                  }
                                >
                                  ✕
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="admin-btn admin-btn--ghost"
                              style={{ marginTop: "0.25rem" }}
                              onClick={() =>
                                setQuestionDrafts((list) =>
                                  list.map((x, i) =>
                                    i === qi
                                      ? {
                                          ...x,
                                          options: [...x.options, { text: "", correct: false }],
                                        }
                                      : x
                                  )
                                )
                              }
                            >
                              + вариант
                            </button>
                          </div>
                        ) : null}

                        {qd.kind === "TEXT" ? (
                          <label className="admin-label">
                            {qd.acceptAnyAnswer
                              ? "Опционально: примеры ответов для себя (не используются для проверки)"
                              : "Допустимые ответы (каждый с новой строки, без учёта регистра)"}
                            <textarea
                              className="admin-textarea"
                              rows={4}
                              value={qd.textAnswersLines}
                              onChange={(e) =>
                                setQuestionDrafts((list) =>
                                  list.map((x, i) => (i === qi ? { ...x, textAnswersLines: e.target.value } : x))
                                )
                              }
                              placeholder={qd.acceptAnyAnswer ? "Необязательно" : "Да\nОк\nСогласен"}
                            />
                          </label>
                        ) : null}

                        {qd.kind === "IMAGE" ? (
                          <p className="admin-muted" style={{ margin: "0.5rem 0 0" }}>
                            Участник загружает снимок в Mini App; верным считается любой загруженный файл.
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  className="admin-btn admin-btn--primary"
                  style={{ marginTop: "0.75rem" }}
                  disabled={savingQuestions}
                  onClick={() => void saveQuestions()}
                >
                  {savingQuestions ? "Сохранение вопросов…" : "Сохранить вопросы"}
                </button>
              </section>

              <section className="admin-section admin-upload">
                <h2>Материалы дня (файлы)</h2>
                <p className="admin-muted">
                  Можно загрузить несколько файлов подряд — на сайте они показываются каруселью (стрелки, точки внизу, свайп).
                  Порядок слайдов — как очередь загрузок. Для «фото с текстом» подпись обязательна; для остальных — по желанию.
                </p>
                <div className="admin-upload-controls">
                  <label className="admin-label">
                    Тип блока
                    <select
                      className="admin-input"
                      value={uploadKind}
                      onChange={(e) => setUploadKind(e.target.value as typeof uploadKind)}
                    >
                      <option value="IMAGE">Только фото</option>
                      <option value="IMAGE_TEXT">Фото с текстом</option>
                      <option value="VIDEO">Видео (файл)</option>
                    </select>
                  </label>
                  {(uploadKind === "IMAGE_TEXT" || uploadKind === "IMAGE" || uploadKind === "VIDEO") && (
                    <label className="admin-label">
                      {uploadKind === "VIDEO"
                        ? "Подпись под видео (необязательно)"
                        : `Подпись к фото ${uploadKind === "IMAGE_TEXT" ? "(обязательно)" : "(необязательно)"}`}
                      <input
                        className="admin-input"
                        value={uploadCaption}
                        onChange={(e) => setUploadCaption(e.target.value)}
                        placeholder={uploadKind === "VIDEO" ? "Текст под видео" : "Текст под изображением"}
                      />
                    </label>
                  )}
                  <label className="admin-label admin-file">
                    Файл
                    <input
                      type="file"
                      accept={uploadKind === "VIDEO" ? "video/*" : "image/*"}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        setPendingFile(f ?? null);
                      }}
                    />
                  </label>
                  {pendingFile ? (
                    <p className="admin-muted" style={{ margin: 0 }}>
                      Выбран файл: <span className="mono">{pendingFile.name}</span>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="admin-btn admin-btn--primary"
                    disabled={!pendingFile}
                    onClick={() => {
                      if (pendingFile) void uploadFile(pendingFile);
                    }}
                  >
                    Загрузить на сервер
                  </button>
                </div>
              </section>

              <section className="admin-section">
                <h2>Загруженные блоки</h2>
                {!(current?.media?.length) ? <p className="admin-muted">Пока нет файлов</p> : null}
                <ul className="admin-media-list">
                  {(current?.media ?? []).map((m) => (
                    <li key={m.id} className="admin-media-item">
                      <div className="admin-media-preview">
                        {m.kind === "VIDEO" ? (
                          <video controls className="admin-media-v" src={`/uploads/${m.filename}`} />
                        ) : (
                          <img className="admin-media-img" src={`/uploads/${m.filename}`} alt="" />
                        )}
                      </div>
                      <div className="admin-media-meta">
                        <span className="admin-badge">{m.kind}</span>
                        <label className="admin-label" style={{ marginBottom: 0 }}>
                          Подпись (как на сайте)
                          <input
                            className="admin-input"
                            value={
                              mediaCaptionDrafts[m.id] !== undefined ? mediaCaptionDrafts[m.id] : (m.caption ?? "")
                            }
                            onChange={(e) =>
                              setMediaCaptionDrafts((d) => ({
                                ...d,
                                [m.id]: e.target.value,
                              }))
                            }
                            placeholder={m.kind === "IMAGE_TEXT" ? "Обязательно для этого типа" : "Необязательно"}
                          />
                        </label>
                        <button
                          type="button"
                          className="admin-btn admin-btn--primary"
                          disabled={savingCaptionId === m.id}
                          onClick={() => void saveMediaCaption(m.id, m.kind)}
                        >
                          {savingCaptionId === m.id ? "Сохранение…" : "Сохранить подпись"}
                        </button>
                        <button type="button" className="admin-btn admin-btn--danger" onClick={() => deleteMedia(m.id)}>
                          Удалить файл
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
