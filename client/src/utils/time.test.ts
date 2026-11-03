import { describe, expect, it } from "vitest";
import { formatDuration, formatInterval, formatMs, formatRelative } from "./time";

const NOW = new Date("2026-11-03T10:00:00Z").getTime();
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("formatRelative", () => {
  it("handles never, now, minutes, hours and days", () => {
    expect(formatRelative(null, NOW)).toBe("Never");
    expect(formatRelative(ago(2_000), NOW)).toBe("just now");
    expect(formatRelative(ago(30_000), NOW)).toBe("30 s ago");
    expect(formatRelative(ago(3 * 60_000), NOW)).toBe("3 min ago");
    expect(formatRelative(ago(5 * 3_600_000), NOW)).toBe("5 h ago");
    expect(formatRelative(ago(2 * 86_400_000), NOW)).toBe("2 d ago");
  });
  it('says "in ..." for the future (next check)', () => {
    expect(formatRelative(new Date(NOW + 4 * 60_000).toISOString(), NOW)).toBe("in 4 min");
  });
});

describe("formatDuration", () => {
  it("formats the common ranges", () => {
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(7500)).toBe("2 h 5 min");
    expect(formatDuration(7200)).toBe("2 h");
    expect(formatDuration(90_000)).toBe("1 d 1 h");
    expect(formatDuration(-5)).toBe("0 s");
  });
});

describe("formatInterval and formatMs", () => {
  it("matches the server's wording", () => {
    expect([10, 60, 300, 3600, 86_400].map(formatInterval)).toEqual([
      "10 s",
      "1 min",
      "5 min",
      "1 h",
      "24 h",
    ]);
  });
  it("formats response times", () => {
    expect(formatMs(null)).toBe("—");
    expect(formatMs(142)).toBe("142 ms");
    expect(formatMs(2350)).toBe("2.35 s");
  });
});
