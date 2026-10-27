import type { Response } from "express";

/** Reads what the validate() middleware parsed (typed by the caller). */
export function validated<T>(res: Response, key: "body" | "params" | "query"): T {
  return res.locals.validated?.[key] as T;
}
