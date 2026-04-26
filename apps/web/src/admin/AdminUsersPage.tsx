import { useCallback, useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";
import { normalizeAdminKey, readStoredAdminKey } from "./keyStorage";

type UserRow = {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  age: number | null;
  university: string | null;
  pdConsentAt: string | null;
  createdAt: string;
  lastActivityAt: string;
  completedDays: number;
};

type QuestionAnswer = { id: string; prompt: string; kind: string; answer: string | null };
type DayResult = {
  day: number;
  title: string;
  completedAt: string;
  questions: QuestionAnswer[];
  uploadedImages: string[];
};
type UserDetails = {
  user: UserRow;
  results: DayResult[];
};

function UserOpens({ telegramId, adminKey }: { telegramId: string; adminKey: string }) {
  const [data, setData] = useState<{ total: number; opens: { page: string; openedAt: string }[] } | null>(null);
  useEffect(() => {
    fetch(`/api/admin/bot/users/${telegramId}/opens`, {
      headers: { "x-admin-key": adminKey },
    }).then((r) => r.json()).then(setData).catch(() => {});
  }, [telegramId, adminKey]);
  if (!data) return null;
  return (
    <div className="user-opens">
      <div className="user-opens__title">📱 Открытий Mini App: <b>{data.total}</b></div>
      {data.opens.length > 0 && (
        <div className="user-opens__list">
          {data.opens.slice(0, 10).map((o, i) => (
            <span key={i} className="user-opens__item">
              <code>{o.page}</code> {new Date(o.openedAt).toLocaleString("ru-RU")}
            </span>
          ))}
          {data.total > 10 && <span className="muted">…ещё {data.total - 10}</span>}
        </div>
      )}
    </div>
  );
}

function displayName(u: UserRow) {
  return u.fullName ?? ([u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.telegramId);
}

export function AdminUsersPage() {
  const [savedKey, setSavedKey] = useState(readStoredAdminKey);
  const [keyInput, setKeyInput] = useState(readStoredAdminKey);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, UserDetails>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const h = useCallback(
    (): HeadersInit => ({ "content-type": "application/json", "x-admin-key": savedKey }),
    [savedKey]
  );

  const load = useCallback(async () => {
    if (!savedKey) return;
    setErr(null);
    try {
      const r = await fetch("/api/admin/bot/users", { headers: h() });
      const data = await r.json();
      if (data.error) throw new Error(data.error);
      setUsers(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка загрузки");
    }
  }, [savedKey, h]);

  useEffect(() => { load(); }, [load]);

  function saveKey() {
    const k = normalizeAdminKey(keyInput);
    setSavedKey(k);
    localStorage.setItem("admin_api_key", k);
  }

  async function toggleUser(telegramId: string) {
    if (expanded === telegramId) { setExpanded(null); return; }
    setExpanded(telegramId);
    if (details[telegramId]) return;
    setLoadingDetail(telegramId);
    try {
      const r = await fetch(`/api/admin/bot/users/${telegramId}/results`, { headers: h() });
      const data: UserDetails = await r.json();
      setDetails((prev) => ({ ...prev, [telegramId]: data }));
    } catch { /* ignore */ }
    setLoadingDetail(null);
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      displayName(u).toLowerCase().includes(q) ||
      u.telegramId.includes(q) ||
      (u.university ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="admin-shell">
      <AdminNav active="users" />

      {!savedKey && (
        <div className="admin-key-row">
          <input className="admin-input" placeholder="Admin API key" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} />
          <button className="btn btn-primary" onClick={saveKey}>Войти</button>
        </div>
      )}
      {err && <p className="admin-err">{err}</p>}

      <div className="admin-users-header">
        <h2 className="admin-section-title">Участники <span className="admin-count-badge">{users.length}</span></h2>
        <input
          className="admin-input admin-search"
          placeholder="Поиск по имени, ВУЗу, Telegram ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="admin-users-list">
        {filtered.map((u) => (
          <div key={u.telegramId} className={`admin-user-card ${expanded === u.telegramId ? "admin-user-card--open" : ""}`}>
            <button className="admin-user-card__header" onClick={() => toggleUser(u.telegramId)}>
              <div className="admin-user-card__info">
                <span className="admin-user-card__name">{displayName(u)}</span>
                {u.pdConsentAt
                  ? <span className="admin-badge admin-badge--green">✓ Согласие</span>
                  : <span className="admin-badge admin-badge--gray">Без согласия</span>}
                <span className="admin-badge admin-badge--blue">{u.completedDays} дней</span>
              </div>
              <div className="admin-user-card__meta">
                {u.age && <span>{u.age} лет</span>}
                {u.university && <span>{u.university}</span>}
                <span className="admin-user-card__tid">@{u.username ?? u.telegramId}</span>
              </div>
              <span className="admin-user-card__chevron">{expanded === u.telegramId ? "▲" : "▼"}</span>
            </button>

            {expanded === u.telegramId && (
              <div className="admin-user-card__body">
                {loadingDetail === u.telegramId && <p className="muted">Загрузка…</p>}
                {details[u.telegramId] && (
                  <>
                    <div className="admin-user-profile">
                      <div><b>ФИО:</b> {u.fullName ?? "—"}</div>
                      <div><b>Возраст:</b> {u.age ?? "—"}</div>
                      <div><b>ВУЗ:</b> {u.university ?? "—"}</div>
                      <div><b>Telegram ID:</b> <code>{u.telegramId}</code></div>
                      <div><b>Регистрация:</b> {new Date(u.createdAt).toLocaleString("ru-RU")}</div>
                    </div>

                    <UserOpens telegramId={u.telegramId} adminKey={savedKey} />

                    {details[u.telegramId].results.length === 0 && (
                      <p className="muted">Тесты ещё не пройдены.</p>
                    )}

                    {details[u.telegramId].results.map((r) => (
                      <div key={r.day} className="admin-day-result">
                        <h4 className="admin-day-result__title">
                          День {r.day}: {r.title}
                          <span className="admin-day-result__date">
                            {new Date(r.completedAt).toLocaleString("ru-RU")}
                          </span>
                        </h4>

                        {r.questions.length > 0 && (
                          <table className="admin-table admin-table--compact">
                            <thead>
                              <tr><th>Вопрос</th><th>Тип</th><th>Ответ</th></tr>
                            </thead>
                            <tbody>
                              {r.questions.map((q) => (
                                <tr key={q.id}>
                                  <td>{q.prompt}</td>
                                  <td><span className="admin-kind-badge">{q.kind}</span></td>
                                  <td>{q.answer ?? <span className="muted">—</span>}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {r.uploadedImages.length > 0 && (
                          <div className="admin-uploaded-imgs">
                            {r.uploadedImages.map((src) => (
                              <a key={src} href={src} target="_blank" rel="noreferrer">
                                <img src={src} alt="Загруженное фото" className="admin-uploaded-img" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {!filtered.length && <p className="muted" style={{ textAlign: "center", padding: "2rem" }}>Участников нет</p>}
      </div>
    </div>
  );
}
