import dns from "node:dns";
import type { LookupFunction } from "node:net";
import { isBlockedIp } from "./url-guard.js";

export type ResolvedAddress = { address: string; family: number };
export type Resolve = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolve: Resolve = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

/** Carries `code = "BLOCKED_TARGET"` so classifyError() recognises it anywhere in an error chain. */
export class BlockedTargetError extends Error {
  readonly code = "BLOCKED_TARGET";
  constructor() {
    super("Target address is not allowed");
  }
}

const notFound = () => Object.assign(new Error("No addresses found"), { code: "ENOTFOUND" });

/**
 * A `lookup` function for net.connect() / undici. DNS is resolved HERE, at connection time, and the
 * connection only proceeds to an address that passed the check. Because the address we validate is the
 * address we connect to, DNS rebinding cannot swap in a private IP after validation (SEC-1).
 */
export function createSafeLookup(opts: { allowPrivate: boolean; resolve?: Resolve }): LookupFunction {
  const resolve = opts.resolve ?? systemResolve;
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        // ANY non-public address in the answer rejects the whole name, not just the first one
        if (!opts.allowPrivate && addresses.some((a) => isBlockedIp(a.address))) {
          callback(new BlockedTargetError(), "", 0);
          return;
        }
        const wanted = options.family === 4 || options.family === 6 ? options.family : null;
        const usable = wanted ? addresses.filter((a) => a.family === wanted) : addresses;
        const first = usable[0];
        if (!first) {
          callback(notFound(), "", 0);
          return;
        }
        if (options.all) callback(null, usable);
        else callback(null, first.address, first.family);
      },
      (err: unknown) => callback(err as NodeJS.ErrnoException, "", 0),
    );
  };
}