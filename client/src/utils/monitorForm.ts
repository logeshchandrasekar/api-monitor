import type { MonitorDetail, MonitorInput } from "../types/api";
import type { FieldErrors } from "./errors";

export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

/** Methods that may carry a body in the form. The server also refuses a body on GET and HEAD. */
export const METHODS_WITH_BODY: readonly HttpMethod[] = ["POST", "PUT", "PATCH", "DELETE"];
export const methodHasBody = (method: HttpMethod) => METHODS_WITH_BODY.includes(method);

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_HEADERS = 20;

/** Keep in sync with server/src/utils/headers.ts: values of these headers are masked by the API and shown as password fields here. */
const SENSITIVE_HEADER_RE =
  /(authorization|cookie|token|secret|key|password|passwd|credential|auth)/i;
export const isSensitiveHeader = (name: string) => SENSITIVE_HEADER_RE.test(name);

const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export type HeaderRow = {
  /** Stable React key: rows can be added, removed and renamed. */
  key: string;
  name: string;
  value: string;
  /** A saved sensitive value (the server never sends it back). Shown as a mask; saved as { keepExisting: true }. */
  kept: boolean;
  /** True when this row started as a saved sensitive value, so "Keep saved value" can undo a "Replace". */
  saved: boolean;
};

export type MonitorFormValues = {
  name: string;
  url: string;
  method: HttpMethod;
  intervalSec: number;
  /** Number inputs are kept as text so a half-typed value is not rewritten under the cursor. */
  expectedStatus: string;
  timeoutSec: string;
  responseThresholdMs: string;
  followRedirects: boolean;
  headers: HeaderRow[];
  body: string;
  /** Until the person edits the timeout it follows the interval, like the server's own default. */
  timeoutTouched: boolean;
};

/** Field name -> message. Keys: name, url, intervalSec, expectedStatus, timeoutSec, responseThresholdMs, body, headers.N.name, headers.N.value. */
export type FormErrors = Record<string, string>;

let rowCounter = 0;
export const newHeaderRow = (partial: Partial<HeaderRow> = {}): HeaderRow => ({
  key: `row-${++rowCounter}`,
  name: "",
  value: "",
  kept: false,
  saved: false,
  ...partial,
});

/** The server's default: 80 % of the interval, at most 10 s. */
export function defaultTimeoutSec(intervalSec: number): number {
  return Math.max(1, Math.min(10, Math.floor(intervalSec * 0.8)));
}

export function newFormValues(allowedIntervalsSec: number[]): MonitorFormValues {
  const intervalSec = allowedIntervalsSec.includes(300) ? 300 : (allowedIntervalsSec[0] ?? 300);
  return {
    name: "",
    url: "https://",
    method: "GET",
    intervalSec,
    expectedStatus: "200",
    timeoutSec: String(defaultTimeoutSec(intervalSec)),
    responseThresholdMs: "1000",
    followRedirects: true,
    headers: [],
    body: "",
    timeoutTouched: false,
  };
}

export function formFromMonitor(m: MonitorDetail): MonitorFormValues {
  return {
    name: m.name,
    url: m.url,
    method: (HTTP_METHODS as readonly string[]).includes(m.method)
      ? (m.method as HttpMethod)
      : "GET",
    intervalSec: m.intervalSec,
    expectedStatus: String(m.expectedStatus),
    timeoutSec: String(m.timeoutMs / 1000),
    responseThresholdMs: String(m.responseThresholdMs),
    followRedirects: m.followRedirects,
    headers: m.headers.map((h) => {
      const savedSecret = h.sensitive && h.value === null; // the API never returns these values
      return newHeaderRow({
        name: h.name,
        value: h.value ?? "",
        kept: savedSecret,
        saved: savedSecret,
      });
    }),
    body: m.body ?? "",
    timeoutTouched: true, // an existing monitor's timeout is a decision, not a default
  };
}

export const isBlankRow = (row: HeaderRow) => !row.kept && !row.name.trim() && !row.value;

/** Drops rows the person added but never filled in, so header numbers in server errors match rows on screen. */
export function pruneBlankRows(values: MonitorFormValues): MonitorFormValues {
  return { ...values, headers: values.headers.filter((row) => !isBlankRow(row)) };
}

/** Checks the form the way the server will (instant feedback; the server stays the authority). Run pruneBlankRows first. */
export function validateForm(values: MonitorFormValues): FormErrors {
  const errors: FormErrors = {};

  const name = values.name.trim();
  if (!name) errors.name = "Enter a name.";
  else if (name.length > 100) errors.name = "Name is too long (100 characters at most).";

  const url = values.url.trim();
  if (!url) {
    errors.url = "Enter the URL to monitor.";
  } else {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        errors.url = "The URL must start with http:// or https://.";
      }
    } catch {
      errors.url = "Enter a full URL, for example https://api.example.com/health.";
    }
  }

  const status = Number(values.expectedStatus);
  if (!values.expectedStatus.trim() || !Number.isInteger(status) || status < 100 || status > 599) {
    errors.expectedStatus = "Enter a status code between 100 and 599.";
  }

  const timeout = Number(values.timeoutSec);
  if (!values.timeoutSec.trim() || !Number.isFinite(timeout) || timeout < 1 || timeout > 30) {
    errors.timeoutSec = "Enter a timeout between 1 and 30 seconds.";
  } else if (timeout * 1000 >= values.intervalSec * 1000) {
    errors.timeoutSec = "The timeout must be shorter than the check interval.";
  }

  const threshold = Number(values.responseThresholdMs);
  if (
    !values.responseThresholdMs.trim() ||
    !Number.isInteger(threshold) ||
    threshold < 50 ||
    threshold > 60_000
  ) {
    errors.responseThresholdMs = "Enter a whole number of milliseconds between 50 and 60000.";
  }

  if (values.headers.length > MAX_HEADERS) errors.headers = `At most ${MAX_HEADERS} headers.`;
  const seen = new Set<string>();
  values.headers.forEach((row, i) => {
    const headerName = row.name.trim();
    if (!headerName) errors[`headers.${i}.name`] = "Enter a header name.";
    else if (!HEADER_NAME_RE.test(headerName))
      errors[`headers.${i}.name`] = "Header names cannot contain spaces or special characters.";
    else if (seen.has(headerName.toLowerCase()))
      errors[`headers.${i}.name`] = "This header is already in the list.";
    seen.add(headerName.toLowerCase());

    if (!row.kept && !row.value) errors[`headers.${i}.value`] = "Enter a value.";
    else if (/[\r\n\0]/.test(row.value))
      errors[`headers.${i}.value`] = "A header value cannot contain line breaks.";
  });

  if (methodHasBody(values.method) && values.body.trim()) {
    if (new TextEncoder().encode(values.body).length > MAX_BODY_BYTES) {
      errors.body = "The body is too large (64 KB at most).";
    } else {
      try {
        JSON.parse(values.body);
      } catch {
        errors.body = "The body must be valid JSON.";
      }
    }
  }

  return errors;
}

/** The request body for POST /monitors and PATCH /monitors/:id. Call after validateForm found nothing. */
export function toPayload(values: MonitorFormValues): MonitorInput {
  return {
    name: values.name.trim(),
    url: values.url.trim(),
    method: values.method,
    intervalSec: values.intervalSec,
    expectedStatus: Number(values.expectedStatus),
    timeoutMs: Math.round(Number(values.timeoutSec) * 1000),
    responseThresholdMs: Number(values.responseThresholdMs),
    followRedirects: values.followRedirects,
    // A kept row carries NO value: the stored secret never passes through the browser (SEC-2)
    headers: values.headers.map((row) =>
      row.kept
        ? { name: row.name.trim(), keepExisting: true }
        : { name: row.name.trim(), value: row.value },
    ),
    body: methodHasBody(values.method) && values.body.trim() ? values.body : null,
  };
}

/** Server field paths -> form keys: timeoutMs is "timeoutSec" in the form, and "headers.2" means that row's value. */
export function mapServerFieldErrors(fields: FieldErrors): FormErrors {
  const out: FormErrors = {};
  for (const [path, message] of Object.entries(fields)) {
    if (path === "timeoutMs") out.timeoutSec = message;
    else if (/^headers\.\d+$/.test(path)) out[`${path}.value`] = message;
    else out[path] = message;
  }
  return out;
}

/** Pretty-prints JSON for the "Format JSON" button; null when the text is not valid JSON. */
export function formatJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}
