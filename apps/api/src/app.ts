import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { uploadsRoot } from "./paths.js";
import { publicRouter } from "./routes/public.js";
import { usersRouter } from "./routes/users.js";
import { adminRouter } from "./routes/admin.js";
import { adminAdventRouter } from "./routes/adminAdvent.js";
import { adminSiteRouter } from "./routes/adminSite.js";
import { internalRouter } from "./routes/internal.js";

export function createApp() {
  const app = express();
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json());

  app.use("/uploads", express.static(uploadsRoot));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api", publicRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/admin/advent", adminAdventRouter);
  app.use("/api/admin/site", adminSiteRouter);
  app.use("/api/internal", internalRouter);

  return app;
}
