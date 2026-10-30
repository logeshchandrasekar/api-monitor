import type { RequestHandler } from "express";
import { getDashboardSummary } from "../services/dashboard.js";
import { serializeIncident } from "../utils/incidentSerializer.js";

export const summary: RequestHandler = async (req, res) => {
  const s = await getDashboardSummary(req.user!.id);
  const now = new Date();
  res.json({ ...s, activeIncidents: s.activeIncidents.map((i) => serializeIncident(i, now)) });
};
