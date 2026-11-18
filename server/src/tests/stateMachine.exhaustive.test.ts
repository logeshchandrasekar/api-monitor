import { describe, expect, it } from "vitest";
import { assertNever, evaluate, type MonitorState } from "../services/stateMachine.js";

// The compiler already refuses a missing case. These tests prove the run-time guard behind it: a value that
// should be impossible (a bad row, a future enum value that was not handled) fails loudly instead of being ignored.

const state = (status: string): MonitorState =>
  ({
    status,
    failStreak: 0,
    slowStreak: 0,
    okStreak: 0,
    failureThreshold: 3,
    slowThreshold: 3,
  }) as MonitorState;

describe("state machine: impossible values", () => {
  it.each(["FAILURE", "SLOW", "SUCCESS"] as const)(
    "a %s check on a monitor with an unknown status throws",
    (outcome) => {
      expect(() => evaluate(state("MELTING"), { outcome })).toThrow(/Unhandled value: MELTING/);
    },
  );

  it("a check with an unknown outcome throws", () => {
    expect(() => evaluate(state("HEALTHY"), { outcome: "MAYBE" as never })).toThrow(
      /Unhandled value: MAYBE/,
    );
  });

  it("assertNever names the value it was given", () => {
    expect(() => assertNever("surprise" as never)).toThrow("Unhandled value: surprise");
  });
});
