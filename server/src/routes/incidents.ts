import { Router } from "express";
import * as incidents from "../controllers/incidents.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { listIncidentsQuerySchema } from "../schemas/incident.js";
import { idParamsSchema } from "../schemas/monitor.js";

export const incidentsRouter = Router();

incidentsRouter.use(requireAuth);
incidentsRouter.get("/", validate({ query: listIncidentsQuerySchema }), incidents.listAll);
incidentsRouter.get("/:id", validate({ params: idParamsSchema }), incidents.getOne);
