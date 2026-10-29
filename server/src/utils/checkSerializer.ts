import type { CheckRow } from "../services/checks.js";

/** Public shape of a check. BigInt ids become strings: JSON.stringify cannot handle BigInt. */
export function serializeCheck(c: CheckRow) {
  return {
    id: c.id.toString(),
    trigger: c.trigger,
    outcome: c.outcome,
    failureType: c.failureType,
    statusCode: c.statusCode,
    responseTimeMs: c.responseTimeMs,
    errorMessage: c.errorMessage,
    checkedAt: c.checkedAt,
  };
}