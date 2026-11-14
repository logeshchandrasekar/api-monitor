/** One cell of the 24-hour strip on a monitor row. */
export type Tick = "up" | "slow" | "down" | "none";

/** One tick per hour, oldest first; the last tick is the hour that is still in progress. */
export const TICK_COUNT = 24;
export const TICK_MS = 3_600_000;

/** Checks of one monitor inside one hour bucket, grouped by outcome. `atMs` is the bucket start (epoch ms, UTC). */
export type TickRow = { atMs: number; ok: number; slow: number; failed: number };

/**
 * The worst thing that happened in the hour wins: any failed check makes the tick "down", otherwise any slow
 * check makes it "slow", otherwise it is "up". A single failure is shown even though the monitor is not DOWN
 * yet (3 in a row are needed), the same "nothing is hidden" rule as the "1 failed check" note (ENG-3).
 */
export function classifyTick(counts: { ok: number; slow: number; failed: number }): Tick {
  if (counts.failed > 0) return "down";
  if (counts.slow > 0) return "slow";
  if (counts.ok > 0) return "up";
  return "none";
}

/** Always exactly TICK_COUNT ticks; hours without scheduled checks (new, paused or offline) are "none". */
export function buildTicks(rows: TickRow[], nowMs: number): Tick[] {
  const currentHourStart = Math.floor(nowMs / TICK_MS) * TICK_MS;
  const byStart = new Map(rows.map((row) => [row.atMs, row]));
  return Array.from({ length: TICK_COUNT }, (_, i) => {
    const start = currentHourStart - (TICK_COUNT - 1 - i) * TICK_MS;
    const row = byStart.get(start);
    return row ? classifyTick(row) : "none";
  });
}
