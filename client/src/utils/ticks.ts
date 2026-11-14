import type { Tick } from "../types/api";

export const TICK_MS = 3_600_000;

/** Hover text for one tick. */
export const TICK_LABEL: Record<Tick, string> = {
  up: "Operational",
  slow: "Slow responses",
  down: "Failed checks",
  none: "No data",
};

/** Start of the hour a tick covers. The last tick (index count - 1) is the hour that contains `nowMs`. */
export function tickStartMs(index: number, count: number, nowMs: number): number {
  return Math.floor(nowMs / TICK_MS) * TICK_MS - (count - 1 - index) * TICK_MS;
}

/** The strip as one sentence for screen readers (colour is never the only signal). */
export function summarizeTicks(ticks: Tick[]): string {
  const count = (kind: Tick) => ticks.filter((t) => t === kind).length;
  const parts = [
    `${count("up")} operational`,
    count("slow") > 0 ? `${count("slow")} slow` : "",
    count("down") > 0 ? `${count("down")} with failed checks` : "",
    count("none") > 0 ? `${count("none")} without data` : "",
  ].filter(Boolean);
  return `Last ${ticks.length} hours: ${parts.join(", ")}.`;
}
