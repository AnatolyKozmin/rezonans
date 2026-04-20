import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { adminAuth } from "../middleware.js";

export const adminSiteRouter = Router();
adminSiteRouter.use(adminAuth);

const FaqPair = z.object({ q: z.string(), a: z.string() });

adminSiteRouter.get("/", async (_req, res) => {
  const rows = await prisma.siteContent.findMany({
    where: { key: { in: ["faq_json", "route_md"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  let faq: { q: string; a: string }[] = [];
  if (map.faq_json) {
    try {
      const parsed = JSON.parse(map.faq_json) as unknown;
      const parsedArr = z.array(FaqPair).safeParse(parsed);
      if (parsedArr.success) faq = parsedArr.data;
    } catch {
      /* ignore invalid */
    }
  }
  res.json({
    faq,
    route_md: map.route_md ?? "",
  });
});

const PutSite = z.object({
  faq: z.array(FaqPair).optional(),
  route_md: z.string().optional(),
});

adminSiteRouter.put("/", async (req, res) => {
  const body = PutSite.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }
  const d = body.data;
  if (d.faq !== undefined) {
    await prisma.siteContent.upsert({
      where: { key: "faq_json" },
      create: { key: "faq_json", value: JSON.stringify(d.faq) },
      update: { value: JSON.stringify(d.faq) },
    });
  }
  if (d.route_md !== undefined) {
    await prisma.siteContent.upsert({
      where: { key: "route_md" },
      create: { key: "route_md", value: d.route_md },
      update: { value: d.route_md },
    });
  }

  const rows = await prisma.siteContent.findMany({
    where: { key: { in: ["faq_json", "route_md"] } },
  });
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  let faq: { q: string; a: string }[] = [];
  if (map.faq_json) {
    try {
      const parsed = JSON.parse(map.faq_json) as unknown;
      const parsedArr = z.array(FaqPair).safeParse(parsed);
      if (parsedArr.success) faq = parsedArr.data;
    } catch {
      /* ignore */
    }
  }
  res.json({ faq, route_md: map.route_md ?? "" });
});
