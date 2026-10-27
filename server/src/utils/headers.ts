import { decrypt, encrypt } from "./crypto.js";
import { AppError } from "./errors.js";

export type StoredHeader = { name: string; value: string };
export type HeaderInput = {
  name: string;
  value?: string | undefined;
  keepExisting?: boolean | undefined;
};

export const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

// Set by API Monitor itself, or dangerous to override (request smuggling, identity)
export const FORBIDDEN_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "user-agent",
  "proxy-authorization",
  "proxy-connection",
]);

const SENSITIVE_RE = /(authorization|cookie|token|secret|key|password|passwd|credential|auth)/i;
export const isSensitiveHeader = (name: string) => SENSITIVE_RE.test(name);

const headerError = (index: number, message: string) =>
  new AppError(400, "VALIDATION_ERROR", message, [
    { location: "body", path: `headers.${index}`, message },
  ]);

/** Turns request headers into the list to store, resolving `keepExisting` against saved values. */
export function resolveHeaders(inputs: HeaderInput[], existing: StoredHeader[]): StoredHeader[] {
  const saved = new Map(existing.map((h) => [h.name.toLowerCase(), h]));
  return inputs.map((input, index) => {
    if (input.keepExisting) {
      const kept = saved.get(input.name.toLowerCase());
      if (!kept) throw headerError(index, `Header "${input.name}" has no saved value to keep.`);
      return { name: input.name, value: kept.value };
    }
    if (input.value === undefined)
      throw headerError(index, `Header "${input.name}" needs a value.`);
    return { name: input.name, value: input.value };
  });
}

export const encryptHeaders = (headers: StoredHeader[]): string | null =>
  headers.length > 0 ? encrypt(JSON.stringify(headers)) : null;

export function decryptHeaders(enc: string | null): StoredHeader[] {
  if (!enc) return [];
  return JSON.parse(decrypt(enc)) as StoredHeader[];
}

/** What the API returns: sensitive values are never sent back to the browser. */
export const maskHeaders = (headers: StoredHeader[]) =>
  headers.map((h) => {
    const sensitive = isSensitiveHeader(h.name);
    return { name: h.name, value: sensitive ? null : h.value, sensitive };
  });

/** Order-independent fingerprint, used to detect "did the headers really change?" */
export const headersKey = (headers: StoredHeader[]): string =>
  JSON.stringify(headers.map((h) => [h.name.toLowerCase(), h.value]).sort());
