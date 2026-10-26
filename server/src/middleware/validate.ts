import type { RequestHandler } from "express";
import type { ZodType } from "zod";
import { AppError } from "../utils/errors.js";

type Schemas = { body?: ZodType; params?: ZodType; query?: ZodType };

/**
 * Validates body/params/query. The parsed body replaces req.body;
 * parsed params and query are available at res.locals.validated.params / .query
 * (Express 5 makes req.query read-only).
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const issues: { location: string; path: string; message: string }[] = [];
    const parsed: { body?: unknown; params?: unknown; query?: unknown } = {};

    for (const key of ["body", "params", "query"] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (result.success) {
        parsed[key] = result.data;
      } else {
        for (const issue of result.error.issues) {
          issues.push({ location: key, path: issue.path.join("."), message: issue.message });
        }
      }
    }

    if (issues.length > 0) {
      return next(new AppError(400, "VALIDATION_ERROR", "Some fields are invalid.", issues));
    }
    if (parsed.body !== undefined) req.body = parsed.body;
    res.locals.validated = parsed;
    next();
  };
}
