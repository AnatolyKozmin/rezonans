import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

const KEY_STORAGE = "rezonans-admin-key";

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
  const [key, setKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) ?? "");
  const [savedKey, setSavedKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) ?? "");
  const [days, setDays] = useState<DayRow[] | null>(null);
  const [selected, setSelected] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadKind, setUploadKind] = useState<"IMAGE" | "IMAGE_TEXT" | "VIDEO">("IMAGE");
  const [uploadCaption, setUploadCaption] = useState("");
  const [form, setForm] = useState({
    title: "",
    shortSummary: "",
    materialType: "ARTICLE",
    extraText: "",
    articleUrl: "",
    videoUrl: "",
    taskPrompt: "",
    taskKind: "QUIZ",
    quizOptionsJson: "[]",
    correctIndex: "0",
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
        setErr("Неверный ключ");
        setDays(null);
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

  const current = days?.find((d) => d.day === selected);

  useEffect(() => {
    if (!current) return;
    let quizJson = "[]";
    if (current.quizOptions) {
      try {
        quizJson = JSON.stringify(JSON.parse(current.quizOptions), null, 2);
      } catch {
        quizJson = current.quizOptions;
      }
    }
    setForm({
      title: current.title,
      shortSummary: current.shortSummary,
      materialType: current.materialType,
      extraText: current.extraText ?? "",
      articleUrl: current.articleUrl ?? "",
      videoUrl: current.videoUrl ?? "",
      taskPrompt: current.taskPrompt,
      taskKind: current.taskKind,
      quizOptionsJson: quizJson,
      correctIndex: String(current.correctIndex ?? 0),
    });
  }, [current]);

  const saveDay = async () => {
    if (!savedKey || !current) return;
    setErr(null);
    let quizOptions: string[] | null = null;
    if (form.taskKind === "QUIZ") {
      try {
        const parsed = JSON.parse(form.quizOptionsJson);
        if (Array.isArray(parsed)) quizOptions = parsed.map(String);
      } catch {
        setErr("Некорректный JSON в вариантах квиза");
        return;
      }
    }
    try {
      const r = await fetch(`/api/admin/advent/days/${selected}`, {
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
          taskKind: form.taskKind,
          quizOptions: form.taskKind === "QUIZ" ? quizOptions : null,
          correctIndex: form.taskKind === "QUIZ" ? Number(form.correctIndex) : null,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  };

  const login = () => {
    sessionStorage.setItem(KEY_STORAGE, key.trim());
    setSavedKey(key.trim());
    setErr(null);
  };

  const logout = () => {
    sessionStorage.removeItem(KEY_STORAGE);
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
      const r = await fetch(`/api/admin/advent/days/${selected}/media`, {
        method: "POST",
        headers: { "x-admin-key": savedKey },
        body: fd,
      });
      if (!r.ok) throw new Error(await r.text());
      setUploadCaption("");
      await loadDays();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
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
          <p className="admin-muted">Введите ключ из переменной ADMIN_API_KEY на сервере API.</p>
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
          <p className="admin-muted">День {selected} из 21 · материалы сохраняются на сервере в папку uploads</p>
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

      {err ? <div className="admin-alert">{err}</div> : null}

      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="admin-day-grid">
            {Array.from({ length: 21 }, (_, i) => i + 1).map((d) => (
              <button
                key={d}
                type="button"
                className={`admin-day-btn ${selected === d ? "is-active" : ""}`}
                onClick={() => setSelected(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </aside>

        <main className="admin-main">
          {loading || !days ? (
            <p className="admin-muted">Загрузка…</p>
          ) : current ? (
            <>
              <section className="admin-section">
                <h2>Тексты и задание</h2>
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
                  Тип дня (для бота)
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
                <label className="admin-label">
                  Текст задания
                  <textarea
                    className="admin-textarea"
                    rows={2}
                    value={form.taskPrompt}
                    onChange={(e) => setForm((f) => ({ ...f, taskPrompt: e.target.value }))}
                  />
                </label>
                <label className="admin-label">
                  Тип задания
                  <select
                    className="admin-input"
                    value={form.taskKind}
                    onChange={(e) => setForm((f) => ({ ...f, taskKind: e.target.value }))}
                  >
                    <option value="QUIZ">QUIZ</option>
                    <option value="CONFIRM">CONFIRM</option>
                  </select>
                </label>
                {form.taskKind === "QUIZ" ? (
                  <>
                    <label className="admin-label">
                      Варианты (JSON-массив строк)
                      <textarea
                        className="admin-textarea admin-textarea--mono"
                        rows={4}
                        value={form.quizOptionsJson}
                        onChange={(e) => setForm((f) => ({ ...f, quizOptionsJson: e.target.value }))}
                      />
                    </label>
                    <label className="admin-label">
                      Индекс верного ответа (0…)
                      <input
                        className="admin-input"
                        value={form.correctIndex}
                        onChange={(e) => setForm((f) => ({ ...f, correctIndex: e.target.value }))}
                      />
                    </label>
                  </>
                ) : null}
                <button type="button" className="admin-btn admin-btn--primary" onClick={saveDay}>
                  Сохранить текст и задание
                </button>
              </section>

              <section className="admin-section admin-upload">
                <h2>Материалы дня (файлы)</h2>
                <p className="admin-muted">
                  Загружайте фото, фото с подписью или видеофайл. Порядок на сайте — по очереди загрузки. Для «фото с текстом»
                  обязательна подпись.
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
                  {(uploadKind === "IMAGE_TEXT" || uploadKind === "IMAGE") && (
                    <label className="admin-label">
                      Подпись к фото {uploadKind === "IMAGE_TEXT" ? "(обязательно)" : "(необязательно)"}
                      <input
                        className="admin-input"
                        value={uploadCaption}
                        onChange={(e) => setUploadCaption(e.target.value)}
                        placeholder="Текст под изображением"
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
                        if (f) void uploadFile(f);
                      }}
                    />
                  </label>
                </div>
              </section>

              <section className="admin-section">
                <h2>Загруженные блоки</h2>
                {!current.media?.length ? <p className="admin-muted">Пока нет файлов</p> : null}
                <ul className="admin-media-list">
                  {current.media.map((m) => (
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
                        {m.caption ? <p className="admin-caption">{m.caption}</p> : null}
                        <button type="button" className="admin-btn admin-btn--danger" onClick={() => deleteMedia(m.id)}>
                          Удалить
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
