import type { RequestHandler } from "express";
import type { AnalyticsQuery } from "../schemas/check.js";
import { getMonitorAnalytics } from "../services/analytics.js";
import { validated } from "../utils/validated.js";

export const get: RequestHandler = async (req, res) => {
  const analytics = await getMonitorAnalytics(
    req.user!,
    validated<{ id: string }>(res, "params").id,
    validated<AnalyticsQuery>(res, "query"),
  );
  res.json({ analytics });
};
