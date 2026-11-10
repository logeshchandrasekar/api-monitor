import type { RequestHandler } from "express";
import type { ListNotificationsQuery, UpdateAlertRuleInput } from "../schemas/alerts.js";
import { getAlertSettings, updateAlertSettings } from "../services/alertRules.js";
import { listNotifications, sendTestEmail } from "../services/notifications.js";
import { validated } from "../utils/validated.js";

const idOf = (res: Parameters<RequestHandler>[1]) => validated<{ id: string }>(res, "params").id;

export const get: RequestHandler = async (req, res) => {
  res.json({ alerts: await getAlertSettings(req.user!, idOf(res)) });
};

export const update: RequestHandler = async (req, res) => {
  const input = req.body as UpdateAlertRuleInput;
  res.json({ alerts: await updateAlertSettings(req.user!, idOf(res), input) });
};

export const test: RequestHandler = async (req, res) => {
  res.json({ notification: await sendTestEmail(req.user!, idOf(res)) });
};

export const history: RequestHandler = async (req, res) => {
  const { items, nextCursor } = await listNotifications(
    req.user!.id,
    idOf(res),
    validated<ListNotificationsQuery>(res, "query"),
  );
  res.json({ items, nextCursor });
};