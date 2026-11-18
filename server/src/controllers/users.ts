import type { RequestHandler } from "express";
import { clearAuthCookie } from "../utils/cookies.js";
import { changePassword, deleteAccount, getLimits, updateName } from "../services/users.js";

export const updateMe: RequestHandler = async (req, res) => {
  const user = await updateName(req.user!.id, req.body.name);
  res.json({ user });
};

export const changeMyPassword: RequestHandler = async (req, res) => {
  await changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
  res.status(204).end();
};

export const deleteMe: RequestHandler = async (req, res) => {
  await deleteAccount(req.user!.id, req.body.password);
  clearAuthCookie(res); // the session is gone with the account
  res.status(204).end();
};

export const myLimits: RequestHandler = async (req, res) => {
  res.json({ limits: await getLimits(req.user!) });
};
