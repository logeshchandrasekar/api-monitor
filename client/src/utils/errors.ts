import { ApiError } from "../services/api";

/** Field-level validation errors used by forms. */
export type FieldErrors = Record<string, string>;

/** A message that is always safe to show a person. */
export function getErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * Pulls per-field messages out of an API error's details, so a form can put them under the right input.
 * Understands: [{ path, message }], { field: "msg" | ["msg"] } and { fieldErrors: { ... } }.
 * Anything else returns {} and the form falls back to showing the general message in a banner.
 * (Run the invalid-register curl in 5.3 to see which shape your server sends.)
 */
export function fieldErrorsFrom(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || !error.details || typeof error.details !== "object") {
    return {};
  }

  const out: FieldErrors = {};
  const details = error.details;

  if (Array.isArray(details)) {
    for (const item of details) {
      if (!item || typeof item !== "object") continue;

      const { path, message } = item as {
        path?: unknown;
        message?: unknown;
      };

      const field = Array.isArray(path)
        ? String(path[0] ?? "")
        : typeof path === "string"
          ? path
          : "";

      if (field && typeof message === "string" && !(field in out)) {
        out[field] = message;
      }
    }

    return out;
  }

  const source = (details as { fieldErrors?: unknown }).fieldErrors ?? details;

  if (source && typeof source === "object") {
    for (const [field, value] of Object.entries(source as Record<string, unknown>)) {
      const message = Array.isArray(value) ? value[0] : value;

      if (typeof message === "string" && !(field in out)) {
        out[field] = message;
      }
    }
  }

  return out;
}
