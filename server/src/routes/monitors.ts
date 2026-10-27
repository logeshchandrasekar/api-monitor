import { Router } from "express";
import * as monitors from "../controllers/monitors.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
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
