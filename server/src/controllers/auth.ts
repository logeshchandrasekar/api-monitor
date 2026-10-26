import type { RequestHandler } from "express";
import { loginUser, registerUser } from "../services/auth.js";
import { clearAuthCookie, setAuthCookie } from "../utils/cookies.js";
import { signToken } from "../utils/jwt.js";

export const register: RequestHandler = async (req, res) => {
  const user = await registerUser(req.body);
  setAuthCookie(res, await signToken(user.id));
  res.status(201).json({ user });
};

export const login: RequestHandler = async (req, res) => {
  const user = await loginUser(req.body.email, req.body.password);
  setAuthCookie(res, await signToken(user.id));
  res.json({ user });
};

export const logout: RequestHandler = (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
};

export const me: RequestHandler = (req, res) => {
  res.json({ user: req.user });
};
