import { ApiError } from "../services/api";

/** A readable message for any thrown value. Safe to show in a toast or an alert. */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return err.message; // network error: api.ts already wrote a friendly sentence
    if (err.status === 429) return "Too many attempts. Please wait a few minutes and try again.";
    if (err.status >= 500) return "Something went wrong on our side. Please try again in a moment.";
    return err.message; // our own 4xx messages are written for people
  }
  return "Something went wrong. Please try again.";
}

export type FieldErrors = Record<string, string>;

/**
 * Pulls per-field messages out of a 400 validation error, whatever shape `details` has:
 *   [{ path: ["email"], message: "..." }]        (list of issues)
 *   { fieldErrors: { email: ["..."] } }           (flattened)
 *   { email: "..." } or { email: ["..."] }        (plain map)
 * Returns {} for anything else, so the caller falls back to a form-level message.
 */
export function fieldErrorsFrom(err: unknown): FieldErrors {
  if (!(err instanceof ApiError) || err.status !== 400) return {};
  const out: FieldErrors = {};
  const add = (field: string, message: unknown) => {
    if (field && typeof message === "string" && !(field in out)) out[field] = message;
  };

  const details = err.details;
  if (Array.isArray(details)) {
    for (const issue of details) {
      if (!issue || typeof issue !== "object") continue;
      const { path, message } = issue as { path?: unknown; message?: unknown };
      const field = Array.isArray(path)
        ? String(path[0] ?? "")
        : typeof path === "string"
          ? path
          : "";
      add(field, message);
    }
  } else if (details && typeof details === "object") {
    const source =
      "fieldErrors" in details && details.fieldErrors && typeof details.fieldErrors === "object"
        ? details.fieldErrors
        : details;
    for (const [field, value] of Object.entries(source as Record<string, unknown>)) {
      add(field, Array.isArray(value) ? value[0] : value);
    }
  }
  return out;
}
