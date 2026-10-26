import type { RequestHandler } from "express";
import { AppError } from "../utils/errors.js";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

/** CSRF defence (SEC-3): a request that carries a body must be JSON. Body-less POSTs are fine. */
export const requireJson: RequestHandler = (req, _res, next) => {
  if (BODY_METHODS.has(req.method)) {
    const length = req.headers["content-length"];
    const hasBody = (length !== undefined && length !== "0") || req.headers["transfer-encoding"];
    if (hasBody && !req.is("json")) {
      return next(
        new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json."),
      );
    }
  }
  next();
};
