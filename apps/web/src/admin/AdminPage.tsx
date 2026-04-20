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
  media: MediaRow[];
};

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
  const [mediaCaptionDrafts, setMediaCaptionDrafts] = useState<Record<string, string>>({});
  const [savingCaptionId, setSavingCaptionId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    shortSummary: "",
    materialType: "ARTICLE",
    extraText: "",
    articleUrl: "",
    videoUrl: "",
  });

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
      });
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
    });
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
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
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
            {Array.from({ length: 21 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={selected === d}
                className={`admin-day-btn ${selected === d ? "is-active" : ""}`}
                onClick={() => setSelected(d)}
              >
                {d}
              </button>
            ))}
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
                  Тип дня влияет на подписи в карточке адвента на сайте. Квиз и сценарии бота здесь не настраиваются.
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

              <section className="admin-section admin-upload">
                <h2>Материалы дня (файлы)</h2>
                <p className="admin-muted">
                  Выберите тип, при необходимости введите подпись, выберите файл и нажмите «Загрузить на сервер». Порядок на
                  сайте — по очереди загрузок. Для «фото с текстом» подпись обязательна; для остальных — по желанию.
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
