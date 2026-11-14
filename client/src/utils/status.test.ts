import { describe, expect, it } from "vitest";
import { STATUS_META, getDisplayStatus, getOverallStatus } from "./status";

describe("getDisplayStatus", () => {
  it("maps every stored status", () => {
    expect(getDisplayStatus({ status: "HEALTHY", isPaused: false })).toBe("healthy");
    expect(getDisplayStatus({ status: "DEGRADED", isPaused: false })).toBe("degraded");
    expect(getDisplayStatus({ status: "DOWN", isPaused: false })).toBe("down");
    expect(getDisplayStatus({ status: "PENDING", isPaused: false })).toBe("pending");
  });
  it("paused wins over whatever the stored status was", () => {
    expect(getDisplayStatus({ status: "DOWN", isPaused: true })).toBe("paused");
    expect(getDisplayStatus({ status: "HEALTHY", isPaused: true })).toBe("paused");
  });
  it("every display status has a label and a description", () => {
    for (const meta of Object.values(STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
    }
    expect(STATUS_META.pending.description).toBe("Waiting for first check"); // UX-1
  });
});

const counts = (
  c: Partial<Record<"healthy" | "degraded" | "down" | "pending" | "paused", number>>,
) => {
  const base = { healthy: 0, degraded: 0, down: 0, pending: 0, paused: 0, ...c };
  return { ...base, total: base.healthy + base.degraded + base.down + base.pending + base.paused };
};

describe("getOverallStatus", () => {
  it("everything healthy is operational", () => {
    expect(getOverallStatus(counts({ healthy: 4 }))).toMatchObject({
      tone: "healthy",
      title: "All systems operational",
      detail: "4 of 4 monitors healthy.",
    });
  });
  it("paused and pending monitors do not hide the good news but are mentioned", () => {
    expect(getOverallStatus(counts({ healthy: 3, paused: 1, pending: 1 })).detail).toBe(
      "3 of 5 monitors healthy, 1 paused, 1 waiting for a first check.",
    );
  });
  it("down beats degraded, and says how many", () => {
    expect(getOverallStatus(counts({ healthy: 2, degraded: 1, down: 1 }))).toMatchObject({
      tone: "down",
      title: "1 monitor is down",
      detail: "1 more is degraded.",
    });
    expect(getOverallStatus(counts({ down: 2 })).title).toBe("2 monitors are down");
  });
  it("degraded without any down", () => {
    expect(getOverallStatus(counts({ healthy: 2, degraded: 2 }))).toMatchObject({
      tone: "degraded",
      title: "2 monitors are degraded",
    });
  });
  it("all paused is not 'operational'", () => {
    expect(getOverallStatus(counts({ paused: 2 })).tone).toBe("paused");
  });
  it("only pending monitors: waiting, not operational", () => {
    expect(getOverallStatus(counts({ pending: 1 })).tone).toBe("pending");
  });
});
