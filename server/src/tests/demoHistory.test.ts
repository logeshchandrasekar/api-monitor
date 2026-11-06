import { describe, expect, it } from "vitest";
import {
  DEMO_PROFILES,
  generateHistory,
  mulberry32,
  type DemoProfile,
} from "../seed/demoHistory.js";

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const DAY = 86_400_000;
const profile = (name: string): DemoProfile => DEMO_PROFILES.find((p) => p.name === name)!;

describe("mulberry32", () => {
  it("same seed, same numbers; different seed, different numbers", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(seqA[0]);
  });
});

describe("generateHistory", () => {
  const payments = generateHistory(profile("Payments API"), NOW);

  it("is deterministic", () => {
    expect(generateHistory(profile("Payments API"), NOW)).toEqual(payments);
  });

  it("makes one check per interval over 30 days, oldest first, inside the window", () => {
    expect(payments.checks).toHaveLength(43_200); // 30 days of 60 s
    const times = payments.checks.map((c) => c.checkedAt.getTime());
    expect(times.every((t, i) => i === 0 || t > times[i - 1]!)).toBe(true);
    expect(times[0]!).toBeGreaterThanOrEqual(NOW - 30 * DAY);
    expect(times.at(-1)!).toBeLessThanOrEqual(NOW);
    expect(generateHistory(profile("Search API"), NOW).checks).toHaveLength(8_640); // 300 s
    expect(generateHistory(profile("Reports Export"), NOW).checks).toHaveLength(2_880); // 900 s
  });

  it("every check obeys the outcome rules", () => {
    for (const p of DEMO_PROFILES) {
      for (const c of generateHistory(p, NOW).checks) {
        if (c.outcome === "FAILURE") {
          expect(c.failureType).not.toBeNull();
          expect(c.errorMessage).not.toBeNull();
          if (c.failureType !== "UNEXPECTED_STATUS") {
            expect(c.responseTimeMs).toBeNull(); // a timeout or a refusal has no response time
            expect(c.statusCode).toBeNull();
          }
        } else {
          expect(c.failureType).toBeNull();
          expect(c.statusCode).toBe(200);
          expect(c.responseTimeMs).not.toBeNull();
          if (c.outcome === "SLOW")
            expect(c.responseTimeMs!).toBeGreaterThan(p.responseThresholdMs);
          else expect(c.responseTimeMs!).toBeLessThanOrEqual(p.responseThresholdMs);
        }
      }
    }
  });

  it("Payments API has exactly its two outages, with hand-computed durations", () => {
    const down = payments.incidents.filter((i) => i.type === "DOWN");
    expect(down).toHaveLength(2);
    // Outage 1: 42 min of 503s. The incident opens at the 3rd failed check (2 min in) and closes at the
    // first good check after the outage: 42 min - 2 min = 40 min = 2400 s, plus up to one interval.
    expect(down[0]!.failureType).toBe("UNEXPECTED_STATUS");
    expect(down[0]!.durationSec!).toBeGreaterThanOrEqual(2400);
    expect(down[0]!.durationSec!).toBeLessThanOrEqual(2400 + 60 + 4);
    // Outage 2: 11 min of timeouts: 11 min - 2 min = 540 s, plus up to one interval
    expect(down[1]!.failureType).toBe("TIMEOUT");
    expect(down[1]!.durationSec!).toBeGreaterThanOrEqual(540);
    expect(down[1]!.durationSec!).toBeLessThanOrEqual(540 + 60 + 4);
    // Where they sit in time
    expect(NOW - down[0]!.startedAt.getTime()).toBeGreaterThan(19.2 * DAY);
    expect(NOW - down[0]!.startedAt.getTime()).toBeLessThan(19.3 * DAY);
  });

  it("slow spells open DEGRADED incidents; every incident is closed and the monitor ends healthy", () => {
    const degraded = payments.incidents.filter((i) => i.type === "DEGRADED");
    expect(degraded.length).toBeGreaterThanOrEqual(2);
    for (const p of DEMO_PROFILES) {
      const h = generateHistory(p, NOW);
      expect(h.incidents.every((i) => i.resolvedAt !== null && i.durationSec !== null)).toBe(true);
      expect(h.incidents.every((i) => i.failedChecks >= 3)).toBe(true);
      expect(h.final.status).toBe("HEALTHY");
    }
  });

  it("opens exactly as many DOWN incidents as there are runs of 3 failures (independent count)", () => {
    for (const p of DEMO_PROFILES) {
      const h = generateHistory(p, NOW);
      let run = 0;
      let runsOfThree = 0;
      for (const c of h.checks) {
        run = c.outcome === "FAILURE" ? run + 1 : 0;
        if (run === 3) runsOfThree++;
      }
      expect(h.incidents.filter((i) => i.type === "DOWN")).toHaveLength(runsOfThree);
    }
  });

  it("has a daily rhythm: afternoons (14:00 UTC) are slower than nights (02:00 UTC)", () => {
    const h = generateHistory(profile("Auth Service"), NOW);
    const mean = (hour: number) => {
      const xs = h.checks
        .filter((c) => c.outcome === "SUCCESS" && c.checkedAt.getUTCHours() === hour)
        .map((c) => c.responseTimeMs!);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(mean(14) / mean(2)).toBeGreaterThan(1.25);
  });

  it("the last seeded check is about one interval before now, so the live scheduler continues smoothly", () => {
    const last = payments.final.lastCheckedAt.getTime();
    expect(NOW - last).toBeGreaterThanOrEqual(0);
    expect(NOW - last).toBeLessThanOrEqual(60_000 + 2_000);
  });

  it("a shorter history keeps only the events that fall inside it", () => {
    const short = generateHistory(profile("Payments API"), NOW, 5);
    expect(short.checks).toHaveLength(5 * 1440);
    expect(short.incidents.filter((i) => i.type === "DOWN")).toHaveLength(0); // both outages are older than 5 days... except 6.1 d
    expect(short.incidents.filter((i) => i.type === "DEGRADED")).toHaveLength(1); // only the 3.4 d spell
  });
});
