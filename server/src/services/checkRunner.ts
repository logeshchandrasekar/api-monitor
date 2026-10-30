import { Agent, request } from "undici";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import {
  CheckFailure,
  classifyError,
  failureMessage,
  type FailureType,
} from "../utils/errorMessages.js";
import { isSensitiveHeader, type StoredHeader } from "../utils/headers.js";
import { createSafeLookup, type Resolve } from "../utils/safeLookup.js";
import { parseTargetUrl } from "../utils/url-guard.js";

export const USER_AGENT = "APIMonitor/1.0";
export const MAX_REDIRECTS = 5;
export const MAX_BODY_BYTES = 1_048_576; // 1 MB: read this much, then discard the rest (SEC-1)

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export type CheckInput = {
  url: string;
  method: HttpMethod;
  headers: StoredHeader[];
  body: string | null;
  expectedStatus: number;
  followRedirects: boolean;
  timeoutMs: number;
  responseThresholdMs: number;
};

export type CheckResult = {
  outcome: "SUCCESS" | "SLOW" | "FAILURE";
  failureType: FailureType | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
  checkedAt: Date;
};

export type CheckRunner = (input: CheckInput) => Promise<CheckResult>;

export type RunnerDeps = {
  /** Defaults to env.ALLOW_PRIVATE_TARGETS. Tests pass it explicitly. */
  allowPrivate?: boolean;
  /** Replaces real DNS (tests only). */
  resolve?: Resolve;
  /** Replaces the per-hop URL check (tests only). Must throw to block a hop. */
  hopCheck?: (url: URL) => void;
};

type ResponseBody = Awaited<ReturnType<typeof request>>["body"];

/** Reads and throws away up to `cap` bytes, then aborts the transfer. Never keeps the data. */
async function drain(body: ResponseBody, cap: number): Promise<void> {
  let total = 0;
  for await (const chunk of body) {
    total += (chunk as Uint8Array).byteLength;
    if (total > cap) {
      body.destroy();
      return;
    }
  }
}

const firstHeader = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function createCheckRunner(deps: RunnerDeps = {}): CheckRunner {
  const allowPrivate = deps.allowPrivate ?? env.ALLOW_PRIVATE_TARGETS;

  const hopCheck =
    deps.hopCheck ??
    ((url: URL) => {
      parseTargetUrl(url.href, { allowPrivate });
    });

  // Every hop goes through the same two layers:
  //  1. hopCheck: scheme, credentials, literal IPs, obvious internal names (sync)
  //  2. the Agent's lookup: the real DNS answer, checked at connection time
  const checkHop = (url: URL, isRedirect: boolean) => {
    try {
      hopCheck(url);
    } catch (err) {
      if (err instanceof AppError && err.code === "INVALID_URL") {
        throw new CheckFailure(
          "OTHER",
          isRedirect
            ? "The server redirected to an address that is not supported."
            : "The monitor's URL is not supported.",
        );
      }
      throw err;
    }
  };

  const agent = new Agent({
    pipelining: 0, // no keep-alive: every check opens a fresh connection, so DNS and TLS are measured honestly
    // undici's own connect timeout defaults to 10 s. Raise it to the 30 s maximum so the per-check
    // AbortSignal (timeoutMs) is the only thing that decides when a check times out.
    connect: {
      timeout: 30_000,
      lookup: createSafeLookup({
        allowPrivate,
        ...(deps.resolve ? { resolve: deps.resolve } : {}),
      }),
    },
  });

  /** Performs the request (following redirects by hand) and returns the final status code. */
  async function perform(input: CheckInput, signal: AbortSignal): Promise<number> {
    let url = new URL(input.url);
    checkHop(url, false);

    let method = input.method;
    let body = input.body;
    let headers = [...input.headers];

    for (let hop = 0; ; hop++) {
      const outgoing: Record<string, string> = { accept: "*/*" };
      for (const h of headers) outgoing[h.name.toLowerCase()] = h.value;
      outgoing["user-agent"] = USER_AGENT; // fixed, and users cannot override it (see FORBIDDEN_HEADERS)
      if (body && !outgoing["content-type"]) outgoing["content-type"] = "application/json";

      const res = await request(url, {
        method,
        headers: outgoing,
        ...(body ? { body } : {}),
        signal,
        dispatcher: agent,
      });
      await drain(res.body, MAX_BODY_BYTES);

      const status = res.statusCode;
      const location = firstHeader(res.headers.location);
      if (!input.followRedirects || !REDIRECT_STATUSES.has(status) || !location) return status;

      if (hop >= MAX_REDIRECTS) {
        throw new CheckFailure("OTHER", `Too many redirects (more than ${MAX_REDIRECTS}).`);
      }

      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new CheckFailure("OTHER", "The server redirected to an address that is not valid.");
      }
      checkHop(next, true); // every hop is re-validated (SEC-1)

      // Like browsers: never carry credentials to a different origin
      if (next.origin !== url.origin) headers = headers.filter((h) => !isSensitiveHeader(h.name));

      // 303 (and 301/302 after a non-GET) turn into a body-less GET; 307/308 keep method and body
      if (
        status === 303 ||
        ((status === 301 || status === 302) && method !== "GET" && method !== "HEAD")
      ) {
        if (method !== "HEAD") method = "GET";
        body = null;
        headers = headers.filter((h) => !/^content-(type|length)$/i.test(h.name));
      }
      url = next;
    }
  }

  return async function runCheck(input: CheckInput): Promise<CheckResult> {
    const checkedAt = new Date();
    const started = performance.now(); // monotonic clock: immune to system clock changes (ENG-2)
    const signal = AbortSignal.timeout(input.timeoutMs); // covers the whole check, redirects included

    const failure = (type: FailureType, message?: string): CheckResult => ({
      outcome: "FAILURE",
      failureType: type,
      statusCode: null,
      responseTimeMs: null,
      errorMessage: message ?? failureMessage(type, { timeoutMs: input.timeoutMs }),
      checkedAt,
    });

    try {
      const statusCode = await perform(input, signal);
      const responseTimeMs = Math.round(performance.now() - started);

      if (statusCode !== input.expectedStatus) {
        return {
          outcome: "FAILURE",
          failureType: "UNEXPECTED_STATUS",
          statusCode,
          responseTimeMs,
          errorMessage: failureMessage("UNEXPECTED_STATUS", {
            expectedStatus: input.expectedStatus,
            actualStatus: statusCode,
          }),
          checkedAt,
        };
      }
      return {
        outcome: responseTimeMs > input.responseThresholdMs ? "SLOW" : "SUCCESS",
        failureType: null,
        statusCode,
        responseTimeMs,
        errorMessage: null,
        checkedAt,
      };
    } catch (err) {
      if (signal.aborted) return failure("TIMEOUT");
      if (err instanceof CheckFailure) return failure(err.type, err.message);
      // Only our own mapped text is stored. err.message is never used: it can contain URLs or hostnames.
      return failure(classifyError(err));
    }
  };
}

/** The runner the app uses. Tests build their own with createCheckRunner(). */
export const defaultRunner: CheckRunner = createCheckRunner();
