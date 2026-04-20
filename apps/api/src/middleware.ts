import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const key = (req.header("x-admin-key") ?? "").trim();
  if (key !== config.adminApiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
