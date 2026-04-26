import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { adminAuth } from "../middleware.js";

export const adminBotRouter = Router();
adminBotRouter.use(adminAuth);

// ─── Bot Admins ──────────────────────────────────────────────────────────────

adminBotRouter.get("/admins", async (_req, res) => {
  const admins = await prisma.botAdmin.findMany({ orderBy: { addedAt: "asc" } });
  res.json(admins);
});

adminBotRouter.post("/admins", async (req, res) => {
  const body = z.object({
    telegramId: z.string().min(1),
    name: z.string().optional(),
  }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const admin = await prisma.botAdmin.upsert({
    where: { telegramId: body.data.telegramId },
    create: { telegramId: body.data.telegramId, name: body.data.name ?? "" },
    update: { name: body.data.name ?? "" },
  });
  res.json(admin);
});

adminBotRouter.delete("/admins/:id", async (req, res) => {
  await prisma.botAdmin.deleteMany({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ─── Broadcasts ──────────────────────────────────────────────────────────────

adminBotRouter.get("/broadcasts", async (_req, res) => {
  const broadcasts = await prisma.broadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json(broadcasts);
});

adminBotRouter.post("/broadcasts", async (req, res) => {
  const body = z.object({ message: z.string().min(1).max(4096) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.flatten() }); return; }
  const broadcast = await prisma.broadcast.create({
    data: { message: body.data.message, status: "PENDING" },
  });
  res.json(broadcast);
});

adminBotRouter.delete("/broadcasts/:id", async (req, res) => {
  await prisma.broadcast.updateMany({
    where: { id: req.params.id, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  res.json({ ok: true });
});

// ─── Giveaways ───────────────────────────────────────────────────────────────

adminBotRouter.get("/giveaways", async (_req, res) => {
  const giveaways = await prisma.giveaway.findMany({
    orderBy: { id: "asc" },
    include: { _count: { select: { entries: true } } },
  });
  res.json(giveaways);
});

adminBotRouter.post("/giveaways/:id/pick", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "bad id" }); return; }

  const giveaway = await prisma.giveaway.findUnique({ where: { id } });
  if (!giveaway) { res.status(404).json({ error: "not found" }); return; }
  if (giveaway.winnersPicked) {
    res.json({ alreadyPicked: true, winnerTelegramId: giveaway.winnerTelegramId, winnerName: giveaway.winnerName });
    return;
  }

  const entries = await prisma.giveawayEntry.findMany({
    where: { giveawayId: id },
    include: { user: { select: { telegramId: true, firstName: true, lastName: true, fullName: true, username: true } } },
  });
  if (!entries.length) { res.status(400).json({ error: "no_entries" }); return; }

  const winner = entries[Math.floor(Math.random() * entries.length)];
  const u = winner.user;
  const winnerName =
    u.fullName ??
    ([u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || u.telegramId);

  await prisma.giveaway.update({
    where: { id },
    data: { winnersPicked: true, winnerTelegramId: u.telegramId, winnerName },
  });

  res.json({ ok: true, winnerTelegramId: u.telegramId, winnerName, totalEntries: entries.length });
});
