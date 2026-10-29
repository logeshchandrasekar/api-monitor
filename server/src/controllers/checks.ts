import type { RequestHandler } from "express";
import type { ListChecksQuery } from "../schemas/check.js";
import { listChecks, runManualCheck } from "../services/checks.js";
import { serializeCheck } from "../utils/checkSerializer.js";
import { validated } from "../utils/validated.js";

const idOf = (res: Parameters<RequestHandler>[1]) => validated<{ id: string }>(res, "params").id;

export const runNow: RequestHandler = async (req, res) => {
  const check = await runManualCheck(req.user!.id, idOf(res));
  res.status(201).json({ check: serializeCheck(check) });
};

export const list: RequestHandler = async (req, res) => {
  const { items, nextCursor } = await listChecks(req.user!, idOf(res), validated<ListChecksQuery>(res, "query"));
  res.json({ items: items.map(serializeCheck), nextCursor });
};