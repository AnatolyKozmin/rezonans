import { useCallback, useEffect, useState } from "react";
import { AdminNav } from "./AdminNav";
import { normalizeAdminKey, readStoredAdminKey } from "./keyStorage";

type BotAdmin = { id: string; telegramId: string; name: string; addedAt: string };
type Broadcast = { id: string; message: string; status: string; createdAt: string; sentAt: string | null; sentCount: number };
type Giveaway = {
  id: number;
  title: string;
  campaignWeek: number;
  winnersPicked: boolean;
  winnerTelegramId: string | null;
  winnerName: string | null;
  _count: { entries: number };
};
type Stats = {
  users: { total: number; withConsent: number };
  opens: { total: number; last24h: number; last7d: number; last30d: number };
  uniqueUsers7d: number;
  topPages: { page: string; count: number }[];
  opensByDay: { date: string; count: number }[];
  topUsers: { telegramId: string | null; opens: number }[];
};

type Tab = "admins" | "broadcast" | "giveaways" | "stats";

export function AdminBotPage() {
  const [savedKey, setSavedKey] = useState(readStoredAdminKey);
  const [keyInput, setKeyInput] = useState(readStoredAdminKey);
  const [tab, setTab] = useState<Tab>("admins");
  const [err, setErr] = useState<string | null>(null);

  // admins
  const [admins, setAdmins] = useState<BotAdmin[]>([]);
  const [newTid, setNewTid] = useState("");
  const [newName, setNewName] = useState("");

  // broadcasts
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);

  // giveaways
  const [giveaways, setGiveaways] = useState<Giveaway[]>([]);
  const [picking, setPicking] = useState<number | null>(null);

  // stats
  const [stats, setStats] = useState<Stats | null>(null);

  const h = useCallback(
    (): HeadersInit => ({ "content-type": "application/json", "x-admin-key": savedKey }),
    [savedKey]
  );

  const load = useCallback(async () => {
    if (!savedKey) return;
    setErr(null);
    const safeJson = async (r: Response) => {
      if (!r.ok) {
        const text = await r.text().catch(() => r.statusText);
        throw new Error(`HTTP ${r.status}: ${text.slice(0, 120)}`);
      }
      return r.json();
    };
    try {
      const [a, b, g, s] = await Promise.all([
        fetch("/api/admin/bot/admins", { headers: h() }).then(safeJson),
        fetch("/api/admin/bot/broadcasts", { headers: h() }).then(safeJson),
        fetch("/api/admin/bot/giveaways", { headers: h() }).then(safeJson),
        fetch("/api/admin/bot/stats", { headers: h() }).then(safeJson),
      ]);
      if (a.error) throw new Error(a.error);
      setAdmins(a);
      setBroadcasts(b);
      setGiveaways(g);
      setStats(s);
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

  // ─── Admins ───────────────────────────────────────────────────────────────
  async function addAdmin() {
    if (!newTid.trim()) return;
    await fetch("/api/admin/bot/admins", {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ telegramId: newTid.trim(), name: newName.trim() }),
    });
    setNewTid("");
    setNewName("");
    load();
  }

  async function removeAdmin(id: string) {
    if (!confirm("Удалить администратора?")) return;
    await fetch(`/api/admin/bot/admins/${id}`, { method: "DELETE", headers: h() });
    load();
  }

  // ─── Broadcasts ──────────────────────────────────────────────────────────
  async function sendBroadcast() {
    if (!msgText.trim()) return;
    setSending(true);
    await fetch("/api/admin/bot/broadcasts", {
      method: "POST",
      headers: h(),
      body: JSON.stringify({ message: msgText.trim() }),
    });
    setMsgText("");
    setSending(false);
    load();
  }

  async function cancelBroadcast(id: string) {
    await fetch(`/api/admin/bot/broadcasts/${id}`, { method: "DELETE", headers: h() });
    load();
  }

  // ─── Giveaways ───────────────────────────────────────────────────────────
  async function pickWinner(id: number) {
    if (!confirm("Провести розыгрыш и выбрать победителя?")) return;
    setPicking(id);
    const r = await fetch(`/api/admin/bot/giveaways/${id}/pick`, { method: "POST", headers: h() });
    const data = await r.json();
    setPicking(null);
    if (data.error) { alert("Ошибка: " + data.error); return; }
    alert(`🎉 Победитель: ${data.winnerName} (tg: ${data.winnerTelegramId})\nВсего участников: ${data.totalEntries}`);
    load();
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { PENDING: "⏳ Ожидает", SENT: "✅ Отправлена", CANCELLED: "❌ Отменена" };
    return map[s] ?? s;
  };

  return (
    <div className="admin-shell">
      <AdminNav active="bot" />

      {!savedKey && (
        <div className="admin-key-row">
          <input
            className="admin-input"
            placeholder="Admin API key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button className="btn btn-primary" onClick={saveKey}>Войти</button>
        </div>
      )}
      {err && <p className="admin-err">{err}</p>}

      <div className="admin-tabs">
        {(["admins", "broadcast", "giveaways", "stats"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`admin-tab-btn${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "admins" ? "👤 Администраторы" : t === "broadcast" ? "📢 Рассылка" : t === "giveaways" ? "🎁 Розыгрыши" : "📊 Статистика"}
          </button>
        ))}
      </div>

      {/* ── Admins ── */}
      {tab === "admins" && (
        <div className="admin-section">
          <h3 className="admin-section-title">Администраторы бота</h3>
          <p className="admin-hint">Добавь Telegram ID пользователя — он получит возможность делать рассылки через бота.</p>
          <div className="admin-row">
            <input
              className="admin-input"
              placeholder="Telegram ID (числовой)"
              value={newTid}
              onChange={(e) => setNewTid(e.target.value)}
            />
            <input
              className="admin-input"
              placeholder="Имя (необязательно)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn btn-primary" onClick={addAdmin}>Добавить</button>
          </div>
          <table className="admin-table">
            <thead><tr><th>Telegram ID</th><th>Имя</th><th>Добавлен</th><th></th></tr></thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td><code>{a.telegramId}</code></td>
                  <td>{a.name || "—"}</td>
                  <td>{new Date(a.addedAt).toLocaleDateString("ru-RU")}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => removeAdmin(a.id)}>Удалить</button></td>
                </tr>
              ))}
              {!admins.length && <tr><td colSpan={4} className="muted">Нет администраторов</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Broadcasts ── */}
      {tab === "broadcast" && (
        <div className="admin-section">
          <h3 className="admin-section-title">Рассылка всем пользователям</h3>
          <p className="admin-hint">Сообщение будет отправлено всем участникам бота при следующей проверке (каждые 2 минуты).</p>
          <textarea
            className="admin-textarea"
            rows={5}
            placeholder="Текст сообщения..."
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
          />
          <button
            className="btn btn-primary"
            onClick={sendBroadcast}
            disabled={sending || !msgText.trim()}
          >
            {sending ? "Отправка..." : "📢 Поставить в очередь"}
          </button>

          <h4 className="admin-section-subtitle">История рассылок</h4>
          <table className="admin-table">
            <thead><tr><th>Сообщение</th><th>Статус</th><th>Отправлено</th><th>Получателей</th><th></th></tr></thead>
            <tbody>
              {broadcasts.map((b) => (
                <tr key={b.id}>
                  <td className="broadcast-msg-cell">{b.message.slice(0, 80)}{b.message.length > 80 ? "…" : ""}</td>
                  <td>{statusBadge(b.status)}</td>
                  <td>{b.sentAt ? new Date(b.sentAt).toLocaleString("ru-RU") : "—"}</td>
                  <td>{b.sentCount || "—"}</td>
                  <td>
                    {b.status === "PENDING" && (
                      <button className="btn btn-sm btn-danger" onClick={() => cancelBroadcast(b.id)}>Отменить</button>
                    )}
                  </td>
                </tr>
              ))}
              {!broadcasts.length && <tr><td colSpan={5} className="muted">Рассылок нет</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Giveaways ── */}
      {tab === "giveaways" && (
        <div className="admin-section">
          <h3 className="admin-section-title">Розыгрыши</h3>
          <p className="admin-hint">Нажми «Провести розыгрыш» — система случайно выберет победителя среди вступивших участников.</p>
          <table className="admin-table">
            <thead><tr><th>Розыгрыш</th><th>Неделя</th><th>Участников</th><th>Победитель</th><th></th></tr></thead>
            <tbody>
              {giveaways.map((g) => (
                <tr key={g.id}>
                  <td>{g.title}</td>
                  <td>{g.campaignWeek}</td>
                  <td>{g._count.entries}</td>
                  <td>
                    {g.winnersPicked
                      ? <span className="winner-badge">🏆 {g.winnerName} <small>({g.winnerTelegramId})</small></span>
                      : <span className="muted">Не проводился</span>}
                  </td>
                  <td>
                    {!g.winnersPicked && (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => pickWinner(g.id)}
                        disabled={picking === g.id}
                      >
                        {picking === g.id ? "…" : "🎲 Провести"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!giveaways.length && <tr><td colSpan={5} className="muted">Розыгрышей нет</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Stats ── */}
      {tab === "stats" && (
        <div className="admin-section">
          <h3 className="admin-section-title">Статистика Mini App</h3>
          {!stats && <p className="muted">Загрузка…</p>}
          {stats && (
            <>
              <div className="stats-kpi-row">
                <div className="stats-kpi">
                  <span className="stats-kpi__val">{stats.users.total}</span>
                  <span className="stats-kpi__label">Пользователей</span>
                </div>
                <div className="stats-kpi">
                  <span className="stats-kpi__val">{stats.users.withConsent}</span>
                  <span className="stats-kpi__label">Дали согласие</span>
                </div>
                <div className="stats-kpi">
                  <span className="stats-kpi__val">{stats.opens.total}</span>
                  <span className="stats-kpi__label">Всего открытий</span>
                </div>
                <div className="stats-kpi">
                  <span className="stats-kpi__val">{stats.opens.last24h}</span>
                  <span className="stats-kpi__label">За 24 часа</span>
                </div>
                <div className="stats-kpi">
                  <span className="stats-kpi__val">{stats.opens.last7d}</span>
                  <span className="stats-kpi__label">За 7 дней</span>
                </div>
                <div className="stats-kpi">
                  <span className="stats-kpi__val">{stats.uniqueUsers7d}</span>
                  <span className="stats-kpi__label">Уник. за 7 дней</span>
                </div>
              </div>

              <h4 className="admin-section-subtitle">Открытия по дням (последние 30 дней)</h4>
              <div className="stats-bar-chart">
                {stats.opensByDay.length === 0 && <p className="muted">Нет данных</p>}
                {stats.opensByDay.map((d) => {
                  const max = Math.max(...stats.opensByDay.map((x) => x.count), 1);
                  return (
                    <div key={d.date} className="stats-bar-col" title={`${d.date}: ${d.count}`}>
                      <div className="stats-bar" style={{ height: `${Math.round((d.count / max) * 80)}px` }} />
                      <span className="stats-bar-label">{d.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="stats-two-cols">
                <div>
                  <h4 className="admin-section-subtitle">Топ страниц</h4>
                  <table className="admin-table">
                    <thead><tr><th>Страница</th><th>Открытий</th></tr></thead>
                    <tbody>
                      {stats.topPages.map((p) => (
                        <tr key={p.page}>
                          <td><code>{p.page}</code></td>
                          <td>{p.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4 className="admin-section-subtitle">Самые активные пользователи</h4>
                  <table className="admin-table">
                    <thead><tr><th>Telegram ID</th><th>Открытий</th></tr></thead>
                    <tbody>
                      {stats.topUsers.map((u, i) => (
                        <tr key={i}>
                          <td><code>{u.telegramId ?? "—"}</code></td>
                          <td>{u.opens}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
