import { Router } from "express";
import { changeMyPassword, deleteMe, myLimits, updateMe } from "../controllers/users.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { changePasswordSchema, deleteAccountSchema, updateMeSchema } from "../schemas/auth.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.patch("/me", validate({ body: updateMeSchema }), updateMe);
usersRouter.get("/me/limits", myLimits);
usersRouter.post("/me/password", validate({ body: changePasswordSchema }), changeMyPassword);
// Wrong passwords count against the same limit as login (10 failures per 15 minutes per IP)
usersRouter.delete("/me", authLimiter, validate({ body: deleteAccountSchema }), deleteMe);
