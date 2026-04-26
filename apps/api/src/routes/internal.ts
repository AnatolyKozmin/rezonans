import { Router, type Request, type Response, type NextFunction } from "express";
import { prisma } from "../db.js";
import { currentAdventDayNumber } from "../campaign.js";
import { config } from "../config.js";
export const internalRouter = Router();

function internalGate(req: Request, res: Response, next: NextFunction) {
  const need = process.env.INTERNAL_API_KEY;
  if (need && req.header("x-internal-key") !== need) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

internalRouter.use(internalGate);

/** Бот периодически запрашивает список пользователей для напоминания */
internalRouter.get("/reminder-batch", async (_req, res) => {
  const current = currentAdventDayNumber();
  if (current === null) {
    res.json({ telegramIds: [] });
    return;
  }
  const users = await prisma.user.findMany({
    where: { reminderMuted: false },
  });
  const threshold = Date.now() - config.adventReminderHours * 3600000;
  const telegramIds: string[] = [];
  for (const u of users) {
    const prog = await prisma.adventProgress.findUnique({
      where: { userId_day: { userId: u.id, day: current } },
    });
    if (prog?.taskCompletedAt) continue;
    const last = prog?.viewedAt ?? u.lastActivityAt;
    if (last.getTime() < threshold) telegramIds.push(u.telegramId);
  }
  res.json({ day: current, telegramIds });
});
