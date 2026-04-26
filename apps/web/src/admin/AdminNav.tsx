import { Link } from "react-router-dom";

export function AdminNav({ active }: { active: "advent" | "site" | "bot" | "users" }) {
  return (
    <nav className="admin-subnav" aria-label="Разделы админки">
      <Link className={active === "advent" ? "is-active" : undefined} to="/admin">
        Адвент
      </Link>
      <Link className={active === "site" ? "is-active" : undefined} to="/admin/site">
        FAQ и маршрут
      </Link>
      <Link className={active === "bot" ? "is-active" : undefined} to="/admin/bot">
        🤖 Бот
      </Link>
      <Link className={active === "users" ? "is-active" : undefined} to="/admin/users">
        👥 Участники
      </Link>
    </nav>
  );
}
