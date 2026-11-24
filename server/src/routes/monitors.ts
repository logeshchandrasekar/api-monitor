import { Router } from "express";
import * as alerts from "../controllers/alerts.js";
import * as analytics from "../controllers/analytics.js";
import * as checks from "../controllers/checks.js";
import * as incidents from "../controllers/incidents.js";
import * as monitors from "../controllers/monitors.js";
import * as stats from "../controllers/stats.js";
import { manualCheckLimiter } from "../middleware/manualCheckLimiter.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { testEmailLimiter } from "../middleware/testEmailLimiter.js";
import { validate } from "../middleware/validate.js";
import { listNotificationsQuerySchema, updateAlertRuleSchema } from "../schemas/alerts.js";
import { analyticsQuerySchema, listChecksQuerySchema, statsQuerySchema } from "../schemas/check.js";
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
// Before the /:id routes, or "tags" would be read as an id
monitorsRouter.get("/tags", monitors.tags);
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
  "/:id/stats",
  validate({ params: idParamsSchema, query: statsQuerySchema }),
  stats.get,
);
monitorsRouter.get(
  "/:id/analytics",
  validate({ params: idParamsSchema, query: analyticsQuerySchema }),
  analytics.get,
);
monitorsRouter.get(
  "/:id/incidents",
  validate({ params: idParamsSchema, query: listMonitorIncidentsQuerySchema }),
  incidents.listForMonitor,
);
monitorsRouter.get("/:id/alerts", withId, alerts.get);
monitorsRouter.put(
  "/:id/alerts",
  validate({ params: idParamsSchema, body: updateAlertRuleSchema }),
  alerts.update,
);
monitorsRouter.post("/:id/alerts/test", withId, testEmailLimiter, alerts.test);
monitorsRouter.get(
  "/:id/notifications",
  validate({ params: idParamsSchema, query: listNotificationsQuerySchema }),
  alerts.history,
);
