import type { ApiErrorBody } from "../types/api";

// Same-origin: the Vite dev server proxies /api to the Express server, and in production
// Vercel rewrites /api to the backend (Phase 10). That keeps the session cookie first-party.
const BASE_URL = "/api";

export class ApiError extends Error {
  status: number; // 0 means "no HTTP response at all" (network down, CORS, DNS)
  code: string;
  details: unknown;
  requestId: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RequestOptions {
  signal?: AbortSignal;
  /**
   * Set for calls where a 401 is an expected answer: login, register, /auth/me, logout.
   * Everywhere else a 401 means "your session is gone" and triggers the global handler.
   */
  skipUnauthorizedHandler?: boolean;
}

let unauthorizedHandler: (() => void) | null = null;

/** The auth layer registers what should happen on a 401 (clear the cached user). Pass null to remove it. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object" || !("error" in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    !!error &&
    typeof error === "object" &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

/** "/monitors" + { limit: 20, status: undefined } -> "/monitors?limit=20" (skips undefined, null and "") */
export function withQuery(
  path: string,
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

async function request<T>(
  method: Method,
  path: string,
  body: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = { method, credentials: "include", headers, signal: options.signal };

  if (method === "POST" || method === "PUT" || method === "PATCH") {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body ?? {}); // always JSON, never an empty body (see 415 above)
  }

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err; // a cancelled request is not an error to show
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
    );
  }

  const requestId = response.headers.get("x-request-id");
  const text = await response.text();
  let data: unknown;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined; // not JSON (for example an HTML error page from a proxy)
    }
  }

  if (response.ok) return data as T; // 204 or an empty body gives undefined

  if (response.status === 401 && !options.skipUnauthorizedHandler) unauthorizedHandler?.();

  if (isApiErrorBody(data)) {
    throw new ApiError(
      response.status,
      data.error.code,
      data.error.message,
      data.error.details,
      requestId,
    );
  }
  throw new ApiError(
    response.status,
    "BAD_RESPONSE",
    response.status >= 500
      ? "The server had a problem. Please try again in a moment."
      : `Unexpected response from the server (${response.status}).`,
    undefined,
    requestId,
  );
}

export const api = {
  get: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>("GET", path, undefined, options),
  post: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("POST", path, body, options),
  put: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PUT", path, body, options),
  patch: <T = unknown>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>("PATCH", path, body, options),
  delete: <T = unknown>(path: string, options?: RequestOptions) =>
    request<T>("DELETE", path, undefined, options),
};
