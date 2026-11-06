import { describe, expect, it } from "vitest";
import type { AnalyticsIncident, AnalyticsPoint } from "../types/api";
import {
  describeBucket,
  hasEnoughData,
  incidentShades,
  isRangeLocked,
  niceCeil,
  planNotice,
  timeTicks,
  toChartPoints,
  uptimeDomain,
  uptimeTicks,
} from "./analytics";

const point = (over: Partial<AnalyticsPoint> = {}): AnalyticsPoint => ({
  at: "2026-11-04T12:00:00.000Z",
  total: 4,
  successful: 4,
  slow: 0,
  failed: 0,
  uptimePct: 100,
  avgMs: 120,
  p95Ms: 180,
  maxMs: 200,
  ...over,
});
const gap = (): AnalyticsPoint =>
  point({ total: 0, successful: 0, uptimePct: null, avgMs: null, p95Ms: null, maxMs: null });

describe("isRangeLocked and planNotice", () => {
  it("FREE keeps 7 days: 24h and 7d are open, 30d is locked", () => {
    expect(isRangeLocked("24h", 7)).toBe(false);
    expect(isRangeLocked("7d", 7)).toBe(false);
    expect(isRangeLocked("30d", 7)).toBe(true);
  });
  it("PRO keeps 30 days: nothing is locked", () => {
    expect(isRangeLocked("30d", 30)).toBe(false);
  });
  it("locks nothing until the limits have loaded", () => {
    expect(isRangeLocked("30d", undefined)).toBe(false);
  });
  it("the notice names the plan and its history", () => {
    expect(planNotice("FREE", 7)).toBe(
      "Your FREE plan keeps 7 days of history, so this range is not available. Upgrade to PRO to see the last 30 days.",
    );
    expect(planNotice("FREE", 1)).toContain("1 day of history");
  });
});

describe("toChartPoints", () => {
  it("adds the time as a number and keeps everything else", () => {
    const [p] = toChartPoints([point()]);
    expect(p!.t).toBe(Date.UTC(2026, 10, 4, 12, 0, 0));
    expect(p!.p95Ms).toBe(180);
  });
});

describe("hasEnoughData", () => {
  it("needs at least two buckets that have checks", () => {
    expect(hasEnoughData([gap(), gap()])).toBe(false);
    expect(hasEnoughData([gap(), point(), gap()])).toBe(false);
    expect(hasEnoughData([gap(), point(), point()])).toBe(true);
  });
});

describe("uptimeDomain", () => {
  it("zooms to 95-100 when nothing ever failed", () => {
    expect(uptimeDomain([point(), point()])).toEqual([95, 100]);
  });
  it("goes down to the nearest 5 below the lowest bucket", () => {
    expect(uptimeDomain([point(), point({ uptimePct: 87.5 })])).toEqual([85, 100]);
    expect(uptimeDomain([point({ uptimePct: 96.4 })])).toEqual([90, 100]);
  });
  it("shows the whole scale when something really broke", () => {
    expect(uptimeDomain([point({ uptimePct: 0 })])).toEqual([0, 100]);
    expect(uptimeDomain([point({ uptimePct: 49.9 })])).toEqual([0, 100]);
  });
  it("ignores gaps, and defaults to 0-100 with no data at all", () => {
    expect(uptimeDomain([gap(), point()])).toEqual([95, 100]);
    expect(uptimeDomain([gap()])).toEqual([0, 100]);
  });
});

describe("incidentShades", () => {
  const FROM = Date.UTC(2026, 10, 1);
  const TO = Date.UTC(2026, 10, 8); // 7 days
  const inc = (over: Partial<AnalyticsIncident>): AnalyticsIncident => ({
    id: "i1",
    type: "DOWN",
    status: "RESOLVED",
    startedAt: "2026-11-03T10:00:00.000Z",
    resolvedAt: "2026-11-03T14:00:00.000Z",
    ...over,
  });

  it("maps an incident inside the window to its own span", () => {
    const [s] = incidentShades([inc({})], FROM, TO);
    expect(s).toMatchObject({
      type: "DOWN",
      x1: Date.UTC(2026, 10, 3, 10),
      x2: Date.UTC(2026, 10, 3, 14),
      open: false,
    });
  });
  it("clamps an incident that started before the window", () => {
    const [s] = incidentShades([inc({ startedAt: "2026-10-20T00:00:00.000Z" })], FROM, TO);
    expect(s!.x1).toBe(FROM);
  });
  it("runs an open incident to the right edge", () => {
    const [s] = incidentShades([inc({ status: "OPEN", resolvedAt: null })], FROM, TO);
    expect(s).toMatchObject({ x2: TO, open: true });
  });
  it("widens a span too narrow to see, without leaving the window", () => {
    const [s] = incidentShades(
      [inc({ startedAt: "2026-11-03T10:00:00.000Z", resolvedAt: "2026-11-03T10:11:00.000Z" })],
      FROM,
      TO,
    );
    expect(s!.x2 - s!.x1).toBeGreaterThanOrEqual((TO - FROM) * 0.006 - 1);
    const [edge] = incidentShades(
      [inc({ startedAt: "2026-11-07T23:59:00.000Z", resolvedAt: "2026-11-07T23:59:30.000Z" })],
      FROM,
      TO,
    );
    expect(edge!.x2).toBeLessThanOrEqual(TO);
    expect(edge!.x1).toBeGreaterThanOrEqual(FROM);
  });
  it("drops incidents outside the window and sorts the rest", () => {
    const shades = incidentShades(
      [
        inc({
          id: "late",
          startedAt: "2026-11-06T00:00:00.000Z",
          resolvedAt: "2026-11-06T02:00:00.000Z",
        }),
        inc({
          id: "old",
          startedAt: "2026-10-01T00:00:00.000Z",
          resolvedAt: "2026-10-02T00:00:00.000Z",
        }),
        inc({
          id: "early",
          startedAt: "2026-11-02T00:00:00.000Z",
          resolvedAt: "2026-11-02T02:00:00.000Z",
        }),
      ],
      FROM,
      TO,
    );
    expect(shades.map((s) => s.id)).toEqual(["early", "late"]);
  });
});

describe("describeBucket", () => {
  it("uses singular and plural and lists slow and failed counts", () => {
    expect(describeBucket(point({ total: 1, successful: 1 }))).toBe("1 of 1 check succeeded");
    expect(describeBucket(point({ successful: 3, slow: 1, failed: 1 }))).toBe(
      "3 of 4 checks succeeded (1 slow, 1 failed)",
    );
    expect(describeBucket(gap())).toBe("No checks ran");
  });
});

describe("uptimeTicks", () => {
  it("uses round steps for the zoomed ranges", () => {
    expect(uptimeTicks([95, 100])).toEqual([95, 96, 97, 98, 99, 100]);
    expect(uptimeTicks([90, 100])).toEqual([90, 92, 94, 96, 98, 100]);
    expect(uptimeTicks([85, 100])).toEqual([85, 90, 95, 100]);
    expect(uptimeTicks([75, 100])).toEqual([80, 90, 100]);
    expect(uptimeTicks([0, 100])).toEqual([0, 25, 50, 75, 100]);
  });
});

describe("timeTicks (local clock)", () => {
  const end = new Date(2026, 10, 4, 12, 7, 30).getTime(); // local time, so the test works in any time zone
  const DAY = 86_400_000;

  it("24h: every 4 hours on the hour", () => {
    const ticks = timeTicks(end - DAY, end, "24h");
    expect(ticks.length).toBeGreaterThanOrEqual(6);
    expect(ticks.length).toBeLessThanOrEqual(7);
    for (const t of ticks) {
      const d = new Date(t);
      expect([d.getMinutes(), d.getSeconds(), d.getHours() % 4]).toEqual([0, 0, 0]);
      expect(t).toBeGreaterThanOrEqual(end - DAY);
      expect(t).toBeLessThanOrEqual(end);
    }
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
  });

  it("7d: one tick per local midnight, so no date repeats", () => {
    const ticks = timeTicks(end - 7 * DAY, end, "7d");
    expect(ticks.length).toBeGreaterThanOrEqual(7);
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks.every((t) => new Date(t).getHours() === 0)).toBe(true);
    const days = ticks.map((t) => new Date(t).toDateString());
    expect(new Set(days).size).toBe(days.length);
  });

  it("30d: every 5th local midnight", () => {
    const ticks = timeTicks(end - 30 * DAY, end, "30d");
    expect(ticks.length).toBeGreaterThanOrEqual(6);
    expect(ticks.length).toBeLessThanOrEqual(7);
    expect(ticks.every((t) => new Date(t).getHours() === 0)).toBe(true);
  });
});

describe("niceCeil", () => {
  it("rounds up to a round axis maximum", () => {
    expect(niceCeil(880)).toBe(1000);
    expect(niceCeil(924)).toBe(1000);
    expect(niceCeil(1575)).toBe(2000);
    expect(niceCeil(2100)).toBe(2500);
    expect(niceCeil(420)).toBe(500);
    expect(niceCeil(100)).toBe(100);
    expect(niceCeil(0.7)).toBe(0.8);
  });
  it("never returns less than the value", () => {
    for (const v of [1, 7, 99, 101, 333, 999, 1001, 56_789])
      expect(niceCeil(v)).toBeGreaterThanOrEqual(v);
  });
  it("copes with zero", () => {
    expect(niceCeil(0)).toBe(1);
  });
});
