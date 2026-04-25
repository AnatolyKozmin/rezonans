import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(root, "..");

describe("HTTP API", () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL must be set for integration tests");
    execSync("npx prisma db push", {
      cwd: apiRoot,
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: url },
    });
    app = createApp();
  });

  it("GET /health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("GET /api/advent — структура и unlocked при TESTING_UNLOCK_ALL_ADVENT", async () => {
    const res = await request(app).get("/api/advent");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("currentAdventDay");
    expect(res.body).toHaveProperty("days");
    expect(Array.isArray(res.body.days)).toBe(true);
    for (const d of res.body.days) {
      expect(d.unlocked).toBe(true);
    }
  });

  it("GET /api/site — объект", async () => {
    const res = await request(app).get("/api/site");
    expect(res.status).toBe(200);
    expect(res.body).toBeTypeOf("object");
  });

  it("GET /api/admin/advent/days без ключа — 401", async () => {
    const res = await request(app).get("/api/admin/advent/days");
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/advent/days с ключом — 200", async () => {
    const res = await request(app)
      .get("/api/admin/advent/days")
      .set("x-admin-key", process.env.ADMIN_API_KEY ?? "test-admin-key");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
