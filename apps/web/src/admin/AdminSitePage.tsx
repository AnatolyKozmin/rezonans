import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminNav } from "./AdminNav";
import { ADMIN_KEY_STORAGE, normalizeAdminKey, readStoredAdminKey } from "./keyStorage";

type FaqRow = { q: string; a: string };

export function AdminSitePage() {
  const [key, setKey] = useState(readStoredAdminKey);
  const [savedKey, setSavedKey] = useState(readStoredAdminKey);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [faq, setFaq] = useState<FaqRow[]>([{ q: "", a: "" }]);
  const [routeMd, setRouteMd] = useState("");

  const authHeaders = useCallback(
    (): HeadersInit => ({
      "content-type": "application/json",
      "x-admin-key": savedKey,
    }),
    [savedKey]
  );

  const load = useCallback(async () => {
    if (!savedKey) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/site", { headers: { "x-admin-key": savedKey } });
      if (r.status === 401) {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setSavedKey("");
        setKey("");
        setErr(
          "Ключ не подошёл. Для Docker с compose без своего ADMIN_API_KEY в корневом .env введите: dev-admin-key (без кавычек). Иначе — то же значение, что в ADMIN_API_KEY на сервере."
        );
        return;
      }
      if (!r.ok) throw new Error(await r.text());
      const data: { faq: FaqRow[]; route_md: string } = await r.json();
      setFaq(data.faq.length ? data.faq : [{ q: "", a: "" }]);
      setRouteMd(data.route_md ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [savedKey]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setKey("");
  };

  const save = async () => {
    if (!savedKey) return;
    setSaving(true);
    setErr(null);
    const cleaned = faq.filter((row) => row.q.trim() || row.a.trim());
    try {
      const r = await fetch("/api/admin/site", {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ faq: cleaned, route_md: routeMd }),
      });
      if (!r.ok) throw new Error(await r.text());
      const data: { faq: FaqRow[]; route_md: string } = await r.json();
      setFaq(data.faq.length ? data.faq : [{ q: "", a: "" }]);
      setRouteMd(data.route_md ?? "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const addFaq = () => setFaq((rows) => [...rows, { q: "", a: "" }]);
  const removeFaq = (i: number) =>
    setFaq((rows) => {
      const next = rows.filter((_, j) => j !== i);
      return next.length ? next : [{ q: "", a: "" }];
    });

  if (!savedKey) {
    return (
      <div className="admin-shell">
        <div className="admin-card">
          <h1 className="admin-title">Админка · сайт</h1>
          <p className="admin-muted">
            Тот же ключ, что и для <span className="mono">ADMIN_API_KEY</span> на API.
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
            <Link to="/admin">Адвент</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell admin-shell--wide">
      <header className="admin-top">
        <div>
          <h1 className="admin-title">FAQ и маршрут</h1>
          <p className="admin-muted">
            Блок «Вопросы и ответы» и «Как добраться» на главной. Текст маршрута — обычный текст или лёгкая разметка (
            <span className="mono">##</span>, списки); на сайте показывается в{" "}
            <span className="mono">pre</span> как сейчас.
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

      <AdminNav active="site" />

      {err ? <div className="admin-alert">{err}</div> : null}

      {loading ? (
        <p className="admin-muted">Загрузка…</p>
      ) : (
        <>
          <section className="admin-section">
            <h2>Вопросы и ответы</h2>
            <p className="admin-muted">Пустые строки при сохранении отбрасываются.</p>
            <div className="admin-faq-list">
              {faq.map((row, i) => (
                <div key={i} className="admin-faq-row">
                  <label className="admin-label">
                    Вопрос
                    <input
                      className="admin-input"
                      value={row.q}
                      onChange={(e) =>
                        setFaq((rows) => rows.map((r, j) => (j === i ? { ...r, q: e.target.value } : r)))
                      }
                    />
                  </label>
                  <label className="admin-label">
                    Ответ
                    <textarea
                      className="admin-textarea"
                      rows={3}
                      value={row.a}
                      onChange={(e) =>
                        setFaq((rows) => rows.map((r, j) => (j === i ? { ...r, a: e.target.value } : r)))
                      }
                    />
                  </label>
                  <button type="button" className="admin-btn admin-btn--ghost" onClick={() => removeFaq(i)}>
                    Удалить пару
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={addFaq}>
              + Вопрос
            </button>
          </section>

          <section className="admin-section">
            <h2>Маршрут (как добраться)</h2>
            <label className="admin-label">
              Текст
              <textarea
                className="admin-textarea admin-textarea--mono"
                rows={14}
                value={routeMd}
                onChange={(e) => setRouteMd(e.target.value)}
                placeholder="## От метро&#10;..."
              />
            </label>
          </section>

          <button type="button" className="admin-btn admin-btn--primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Сохранение…" : "Сохранить на сайт"}
          </button>
        </>
      )}
    </div>
  );
}
