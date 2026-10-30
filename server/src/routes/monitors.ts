import { Router } from "express";
import * as checks from "../controllers/checks.js";
import * as incidents from "../controllers/incidents.js";
import * as monitors from "../controllers/monitors.js";
import { manualCheckLimiter } from "../middleware/manualCheckLimiter.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { listChecksQuerySchema } from "../schemas/check.js";
import { listMonitorIncidentsQuerySchema } from "../schemas/incident.js";
import {
  createMonitorSchema,
  idParamsSchema,
  listMonitorsQuerySchema,
  updateMonitorSchema,
} from "../schemas/monitor.js";

export const monitorsRouter = Router();

const withId = validate({ params: idParamsSchema });

monitorsRouter.use(requireAuth);

monitorsRouter.get("/", validate({ query: listMonitorsQuerySchema }), monitors.list);
monitorsRouter.post("/", validate({ body: createMonitorSchema }), monitors.create);
monitorsRouter.get("/:id", withId, monitors.get);
monitorsRouter.patch(
  "/:id",
  validate({ params: idParamsSchema, body: updateMonitorSchema }),
  monitors.update,
);
monitorsRouter.delete("/:id", withId, monitors.remove);
monitorsRouter.post("/:id/pause", withId, monitors.pause);
monitorsRouter.post("/:id/resume", withId, monitors.resume);
monitorsRouter.post("/:id/duplicate", withId, monitors.duplicate);
monitorsRouter.post("/:id/check", withId, manualCheckLimiter, checks.runNow);
monitorsRouter.get(
  "/:id/checks",
  validate({ params: idParamsSchema, query: listChecksQuerySchema }),
  checks.list,
);
monitorsRouter.get(
  "/:id/incidents",
  validate({ params: idParamsSchema, query: listMonitorIncidentsQuerySchema }),
  incidents.listForMonitor,
);
