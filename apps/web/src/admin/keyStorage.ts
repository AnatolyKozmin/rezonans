export const ADMIN_KEY_STORAGE = "rezonans-admin-key";

export function normalizeAdminKey(raw: string): string {
  let v = raw.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

export function readStoredAdminKey(): string {
  const raw = sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? "";
  const n = normalizeAdminKey(raw);
  if (raw !== n) {
    if (n) sessionStorage.setItem(ADMIN_KEY_STORAGE, n);
    else sessionStorage.removeItem(ADMIN_KEY_STORAGE);
  }
  return n;
}
