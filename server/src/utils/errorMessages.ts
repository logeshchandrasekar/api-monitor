export type FailureType =
  | "TIMEOUT"
  | "DNS"
  | "CONNECTION"
  | "TLS"
  | "UNEXPECTED_STATUS"
  | "BLOCKED_TARGET"
  | "OTHER";

/** Thrown by the runner for failures where we already know the type and the user-facing text. */
export class CheckFailure extends Error {
  constructor(
    readonly type: FailureType,
    message: string,
  ) {
    super(message);
  }
}

const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_NODATA", "EAI_NONAME", "EAI_FAIL"]);
const TIMEOUT_CODES = new Set([
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);
const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EADDRNOTAVAIL",
  "EPIPE",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
]);
// EPROTO is what OpenSSL reports when the other side does not speak TLS (e.g. https:// to a plain-HTTP port)
const TLS_CODE_RE = /^(CERT_|ERR_TLS|ERR_SSL|SELF_SIGNED|DEPTH_ZERO|UNABLE_TO_(VERIFY|GET)|HOSTNAME_MISMATCH|EPROTO)/;

/** Walks err, err.cause and AggregateError.errors, collecting every `code` it finds. */
function collectCodes(err: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 5 || typeof err !== "object" || err === null) return out;
  const e = err as { code?: unknown; cause?: unknown; errors?: unknown };
  if (typeof e.code === "string") out.push(e.code);
  if (e.cause) collectCodes(e.cause, depth + 1, out);
  if (Array.isArray(e.errors)) for (const inner of e.errors) collectCodes(inner, depth + 1, out);
  return out;
}

/** Maps a low-level network error to our FailureType. Raw codes never leave this function. */
export function classifyError(err: unknown): FailureType {
  if (err instanceof CheckFailure) return err.type;
  const codes = collectCodes(err);
  if (codes.includes("BLOCKED_TARGET")) return "BLOCKED_TARGET";
  if (codes.some((c) => DNS_CODES.has(c))) return "DNS";
  if (codes.some((c) => TLS_CODE_RE.test(c))) return "TLS";
  if (codes.some((c) => TIMEOUT_CODES.has(c))) return "TIMEOUT";
  if (codes.some((c) => CONNECTION_CODES.has(c))) return "CONNECTION";
  return "OTHER";
}

export type MessageContext = { timeoutMs?: number; expectedStatus?: number; actualStatus?: number };

/** The ONLY place user-facing failure text is written (ENG-6). Never include raw error text, headers or bodies. */
export function failureMessage(type: FailureType, ctx: MessageContext = {}): string {
  switch (type) {
    case "TIMEOUT":
      return ctx.timeoutMs
        ? `No response within ${ctx.timeoutMs / 1000} seconds.`
        : "The server did not respond in time.";
    case "DNS":
      return "The domain name could not be found. Check the spelling of the URL.";
    case "CONNECTION":
      return "Could not connect to the server. It may be down or refusing connections.";
    case "TLS":
      return "The secure (HTTPS) connection failed. The certificate may be invalid, expired or misconfigured.";
    case "UNEXPECTED_STATUS":
      return `Expected status ${ctx.expectedStatus} but received ${ctx.actualStatus}.`;
    case "BLOCKED_TARGET":
      return "This address is not allowed.";
    case "OTHER":
      return "The check failed for an unexpected reason.";
  }
}