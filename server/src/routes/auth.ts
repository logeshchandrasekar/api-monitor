import { Router } from "express";
import { login, logout, me, register } from "../controllers/auth.js";
import { authLimiter, registerLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../schemas/auth.js";

export const authRouter = Router();

authRouter.post(
  "/register",
  registerLimiter,
  authLimiter,
  validate({ body: registerSchema }),
  register,
);
authRouter.post("/login", authLimiter, validate({ body: loginSchema }), login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
