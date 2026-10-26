import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../utils/errors.js";

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, "NOT_FOUND", "Route not found."));
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  // Errors raised by the JSON body parser
  const parserError = err as { type?: string };
  if (parserError?.type === "entity.parse.failed") {
    res
      .status(400)
      .json({ error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } });
    return;
  }
  if (parserError?.type === "entity.too.large") {
    res
      .status(413)
      .json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large." } });
    return;
  }

  req.log.error({ err }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
};
