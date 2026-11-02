import { API_BASE } from "../config";
import type { ApiErrorBody } from "../types/api";

/** Every failed request becomes one of these: status 0 means the network call itself failed. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Query string values; undefined, null and "" are left out. */
  query?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  /** Skip the global "session expired" handler on a 401: used by login, register, logout and the first /auth/me. */
  skipUnauthorizedHandler?: boolean;
};

type MethodOptions = Omit<RequestOptions, "method" | "body">;

let unauthorizedHandler: (() => void) | null = null;

/** AuthProvider registers what should happen when a request comes back 401 mid-session. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

/** Add query parameters to a path, excluding undefined, null and empty values. */
export function withQuery(path: string, query?: RequestOptions["query"]): string {
  if (!query) return path;

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const qs = params.toString();
  if (!qs) return path;

  return `${path}${path.includes("?") ? "&" : "?"}${qs}`;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  return `${API_BASE}${withQuery(path, query)}`;
}

function fallbackMessage(status: number): string {
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status === 404) return "Not found.";
  if (status >= 500) return "The server had a problem. Please try again in a moment.";
  return "The request could not be completed.";
}

async function request<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, skipUnauthorizedHandler = false } = options;

  let response: Response;

  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: "include",
      signal,
      // JSON content type on every write, even without a body.
      headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
    );
  }

  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    const serverError = (data as Partial<ApiErrorBody> | null)?.error;

    const error = new ApiError(
      response.status,
      serverError?.code ?? "HTTP_ERROR",
      serverError?.message ?? fallbackMessage(response.status),
      serverError?.details,
    );

    if (response.status === 401 && !skipUnauthorizedHandler) {
      unauthorizedHandler?.();
    }

    throw error;
  }

  return data as T;
}

/** HTTP methods used by the frontend. */

/** HTTP methods used by the frontend. Supports both api() and api.get(). */
export const api = Object.assign(request, {
  request,

  get<T = void>(path: string, options: MethodOptions = {}): Promise<T> {
    return request<T>(path, { ...options, method: "GET" });
  },

  post<T = void>(path: string, body?: unknown, options: MethodOptions = {}): Promise<T> {
    return request<T>(path, { ...options, method: "POST", body });
  },

  patch<T = void>(path: string, body?: unknown, options: MethodOptions = {}): Promise<T> {
    return request<T>(path, { ...options, method: "PATCH", body });
  },

  put<T = void>(path: string, body?: unknown, options: MethodOptions = {}): Promise<T> {
    return request<T>(path, { ...options, method: "PUT", body });
  },

  delete<T = void>(path: string, options: MethodOptions = {}): Promise<T> {
    return request<T>(path, { ...options, method: "DELETE" });
  },
});
