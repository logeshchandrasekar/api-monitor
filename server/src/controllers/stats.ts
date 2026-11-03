import type { RequestHandler } from "express";
import type { StatsQuery } from "../schemas/check.js";
import { getMonitorStats } from "../services/stats.js";
import { validated } from "../utils/validated.js";

export const get: RequestHandler = async (req, res) => {
  const stats = await getMonitorStats(
    req.user!,
    validated<{ id: string }>(res, "params").id,
    validated<StatsQuery>(res, "query"),
  );
  res.json({ stats });
};
