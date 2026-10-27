import dns from "node:dns/promises";
import { isIP } from "node:net";
import ipaddr from "ipaddr.js";
import { env } from "../config/env.js";
import { AppError } from "./errors.js";

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata", "metadata.google.internal"]);
const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
  ".lan",
  ".intranet",
  ".corp",
];

export type TargetOptions = { allowPrivate?: boolean };
export type LookupFn = (hostname: string) => Promise<{ address: string }[]>;

const urlError = (code: string, message: string) =>
  new AppError(400, code, message, [{ location: "body", path: "url", message }]);

const invalid = (message: string) => urlError("INVALID_URL", message);
const blocked = () =>
  urlError(
    "BLOCKED_TARGET",
    "This address is not allowed. API Monitor can only check public internet addresses.",
  );

function normalizeHost(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

/** True for anything that is not a normal public unicast address.
 * Unparseable input is blocked.
 */
export function isBlockedIp(ip: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;

  try {
    addr = ipaddr.parse(ip);
  } catch {
    return true;
  }

  if (addr.kind() === "ipv6") {
    const v6 = addr as ipaddr.IPv6;

    // Inspect the embedded IPv4 address in IPv4-mapped IPv6 addresses.
    if (v6.isIPv4MappedAddress()) {
      return isBlockedIp(v6.toIPv4Address().toString());
    }

    // Reject IPv6 6to4 addresses. They can encode an IPv4 destination.
    if (v6.match(ipaddr.IPv6.parse("2002::"), 16)) {
      return true;
    }

    // Reject the IPv6 documentation prefix explicitly.
    if (v6.match(ipaddr.IPv6.parse("2001:db8::"), 32)) {
      return true;
    }
  }

  if (addr.kind() === "ipv4") {
    const v4 = addr as ipaddr.IPv4;

    // Documentation ranges.
    const documentationRanges = [
      ["192.0.2.0", 24],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
    ] as const;

    for (const [network, prefix] of documentationRanges) {
      if (v4.match(ipaddr.IPv4.parse(network), prefix)) {
        return true;
      }
    }

    // Benchmarking range: 198.18.0.0/15.
    if (v4.match(ipaddr.IPv4.parse("198.18.0.0"), 15)) {
      return true;
    }
  }

  // Block private, loopback, link-local, multicast, reserved,
  // and all other addresses not classified as ordinary unicast.
  return addr.range() !== "unicast";
}

/**
 * Synchronous checks: syntax, scheme, credentials, and literal/obvious-internal hosts.
 * The WHATWG URL parser already canonicalises numeric tricks, so
 * http://2130706433, http://0x7f.1 and http://017700000001 all arrive here as 127.0.0.1.
 */
export function parseTargetUrl(raw: string, opts: TargetOptions = {}): URL {
  const allowPrivate = opts.allowPrivate ?? env.ALLOW_PRIVATE_TARGETS;

  if (raw.length > 2048) throw invalid("The URL is too long.");

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw invalid("Enter a valid URL, including http:// or https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw invalid("Only http:// and https:// URLs are supported.");
  }
  if (url.username || url.password) {
    throw invalid(
      "Remove the username and password from the URL and send credentials in a header.",
    );
  }

  const host = normalizeHost(url.hostname);
  if (!host) throw invalid("The URL has no host name.");

  if (!allowPrivate) {
    if (isIP(host)) {
      if (isBlockedIp(host)) throw blocked();
    } else if (
      BLOCKED_HOSTNAMES.has(host) ||
      BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix)) ||
      !host.includes(".") // single-label names (redis, db, ...) are internal service names
    ) {
      throw blocked();
    }
  }
  return url;
}

const defaultLookup: LookupFn = (hostname) => dns.lookup(hostname, { all: true, verbatim: true });

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Early, friendly rejection when a name resolves to an internal address.
 * If the name does not resolve (yet) we allow it: monitoring an API that is not live is
 * the whole point. The real enforcement happens at connection time (Phase 3).
 */
export async function assertResolvesPublic(
  hostname: string,
  opts: TargetOptions & { lookup?: LookupFn; dnsTimeoutMs?: number } = {},
): Promise<void> {
  const allowPrivate = opts.allowPrivate ?? env.ALLOW_PRIVATE_TARGETS;
  if (allowPrivate) return;

  const host = normalizeHost(hostname);
  if (isIP(host)) return; // literals were already checked by parseTargetUrl

  let addresses: { address: string }[];
  try {
    addresses = await withTimeout((opts.lookup ?? defaultLookup)(host), opts.dnsTimeoutMs ?? 3000);
  } catch {
    return;
  }
  if (addresses.some((a) => isBlockedIp(a.address))) throw blocked();
}

export async function validateTargetUrl(
  raw: string,
  opts: TargetOptions & { lookup?: LookupFn; dnsTimeoutMs?: number } = {},
): Promise<URL> {
  const url = parseTargetUrl(raw, opts);
  await assertResolvesPublic(url.hostname, opts);
  return url;
}
