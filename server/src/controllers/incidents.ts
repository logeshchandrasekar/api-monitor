import type { RequestHandler } from "express";
import type { ListIncidentsQuery, ListMonitorIncidentsQuery } from "../schemas/incident.js";
import { getIncident, listIncidents, listMonitorIncidents } from "../services/incidents.js";
import { serializeIncident } from "../utils/incidentSerializer.js";
import { validated } from "../utils/validated.js";

const idOf = (res: Parameters<RequestHandler>[1]) => validated<{ id: string }>(res, "params").id;

export const listAll: RequestHandler = async (req, res) => {
  const { items, nextCursor } = await listIncidents(
    req.user!.id,
    validated<ListIncidentsQuery>(res, "query"),
  );
  const now = new Date();
  res.json({ items: items.map((i) => serializeIncident(i, now)), nextCursor });
};

export const listForMonitor: RequestHandler = async (req, res) => {
  const { items, nextCursor } = await listMonitorIncidents(
    req.user!.id,
    idOf(res),
    validated<ListMonitorIncidentsQuery>(res, "query"),
  );
  const now = new Date();
  res.json({ items: items.map((i) => serializeIncident(i, now)), nextCursor });
};

export const getOne: RequestHandler = async (req, res) => {
  res.json({ incident: serializeIncident(await getIncident(req.user!.id, idOf(res))) });
};
