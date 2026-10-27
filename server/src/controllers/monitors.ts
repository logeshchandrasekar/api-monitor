import type { RequestHandler } from "express";
import type { ListMonitorsQuery } from "../schemas/monitor.js";
import {
  createMonitor,
  deleteMonitor,
  duplicateMonitor,
  getMonitor,
  listMonitors,
  pauseMonitor,
  resumeMonitor,
  updateMonitor,
} from "../services/monitors.js";
import { serializeMonitor } from "../utils/serializers.js";
import { validated } from "../utils/validated.js";

const idOf = (res: Parameters<RequestHandler>[1]) => validated<{ id: string }>(res, "params").id;

export const list: RequestHandler = async (req, res) => {
  const { items, nextCursor } = await listMonitors(
    req.user!.id,
    validated<ListMonitorsQuery>(res, "query"),
  );
  res.json({ items: items.map((m) => serializeMonitor(m, { detail: false })), nextCursor });
};

export const create: RequestHandler = async (req, res) => {
  const monitor = await createMonitor(req.user!, req.body);
  res.status(201).json({ monitor: serializeMonitor(monitor, { detail: true }) });
};

export const get: RequestHandler = async (req, res) => {
  const monitor = await getMonitor(req.user!.id, idOf(res));
  res.json({ monitor: serializeMonitor(monitor, { detail: true }) });
};

export const update: RequestHandler = async (req, res) => {
  const monitor = await updateMonitor(req.user!, idOf(res), req.body);
  res.json({ monitor: serializeMonitor(monitor, { detail: true }) });
};

export const remove: RequestHandler = async (req, res) => {
  await deleteMonitor(req.user!.id, idOf(res));
  res.status(204).end();
};

export const pause: RequestHandler = async (req, res) => {
  const monitor = await pauseMonitor(req.user!.id, idOf(res));
  res.json({ monitor: serializeMonitor(monitor, { detail: true }) });
};

export const resume: RequestHandler = async (req, res) => {
  const monitor = await resumeMonitor(req.user!.id, idOf(res));
  res.json({ monitor: serializeMonitor(monitor, { detail: true }) });
};

export const duplicate: RequestHandler = async (req, res) => {
  const monitor = await duplicateMonitor(req.user!, idOf(res));
  res.status(201).json({ monitor: serializeMonitor(monitor, { detail: true }) });
};
