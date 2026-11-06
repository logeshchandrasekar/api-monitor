/** Rounds to 2 decimals: 99.123 -> 99.12. */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The one uptime definition (DAT-3): (SUCCESS + SLOW) / (SUCCESS + SLOW + FAILURE) over SCHEDULED checks.
 * `up` is the count of SUCCESS + SLOW (slow is "up but degraded"), `total` adds the failures.
 * null means "no checks": there is nothing to divide, and 0 % would claim an outage that never happened.
 */
export function uptimeOf(up: number, total: number): number | null {
  return total === 0 ? null : round2((up / total) * 100);
}
