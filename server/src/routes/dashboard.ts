import { Router } from "express";
import * as dashboard from "../controllers/dashboard.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);
dashboardRouter.get("/summary", dashboard.summary);
