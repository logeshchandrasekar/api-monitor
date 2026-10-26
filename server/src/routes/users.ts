import { Router } from "express";
import { changeMyPassword, updateMe } from "../controllers/users.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { changePasswordSchema, updateMeSchema } from "../schemas/auth.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.patch("/me", validate({ body: updateMeSchema }), updateMe);
usersRouter.post("/me/password", validate({ body: changePasswordSchema }), changeMyPassword);
