import { describe, expect, it } from "vitest";
import { TICK_COUNT, TICK_MS, buildTicks, classifyTick } from "../utils/ticks.js";

const NOW = Date.UTC(2026, 10, 10, 12, 30, 0); // 12:30 UTC, so the current hour started at 12:00
const hourStart = (hoursAgo: number) => Date.UTC(2026, 10, 10, 12, 0, 0) - hoursAgo * TICK_MS;

describe("classifyTick", () => {
  it("the worst outcome in the hour wins", () => {
    expect(classifyTick({ ok: 59, slow: 0, failed: 1 })).toBe("down");
    expect(classifyTick({ ok: 50, slow: 9, failed: 0 })).toBe("slow");
    expect(classifyTick({ ok: 60, slow: 0, failed: 0 })).toBe("up");
  });
  it("an hour without checks is none, not up", () => {
    expect(classifyTick({ ok: 0, slow: 0, failed: 0 })).toBe("none");
  });
});

describe("buildTicks", () => {
  it("always returns 24 ticks, oldest first, and the last one is the current hour", () => {
    const ticks = buildTicks([{ atMs: hourStart(0), ok: 3, slow: 0, failed: 0 }], NOW);
    expect(ticks).toHaveLength(TICK_COUNT);
    expect(ticks[23]).toBe("up");
    expect(ticks.slice(0, 23).every((t) => t === "none")).toBe(true);
  });
  it("places each bucket at its own hour", () => {
    const ticks = buildTicks(
      [
        { atMs: hourStart(1), ok: 1, slow: 0, failed: 2 },
        { atMs: hourStart(2), ok: 1, slow: 1, failed: 0 },
        { atMs: hourStart(23), ok: 5, slow: 0, failed: 0 }, // the oldest tick
      ],
      NOW,
    );
    expect(ticks[22]).toBe("down");
    expect(ticks[21]).toBe("slow");
    expect(ticks[0]).toBe("up");
    expect(ticks[23]).toBe("none");
  });
  it("ignores buckets older than 24 hours", () => {
    const ticks = buildTicks([{ atMs: hourStart(24), ok: 5, slow: 0, failed: 0 }], NOW);
    expect(ticks.every((t) => t === "none")).toBe(true);
  });
  it("no rows at all gives 24 none ticks", () => {
    expect(buildTicks([], NOW)).toEqual(Array(TICK_COUNT).fill("none"));
  });
});
