import { describe, expect, it } from "vitest";
import { STATUS_META, getDisplayStatus } from "./status";

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
