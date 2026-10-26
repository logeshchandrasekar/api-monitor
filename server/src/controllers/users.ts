import type { RequestHandler } from "express";
import { changePassword, updateName } from "../services/users.js";

export const updateMe: RequestHandler = async (req, res) => {
  const user = await updateName(req.user!.id, req.body.name);
  res.json({ user });
};

export const changeMyPassword: RequestHandler = async (req, res) => {
  await changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
  res.status(204).end();
};
