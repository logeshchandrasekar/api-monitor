import { describe, expect, it } from "vitest";
import {
  CHECK_OUTCOMES,
  MONITOR_STATUSES,
  evaluate,
  type CheckOutcome,
  type IncidentType,
  type MonitorState,
  type MonitorStatus,
  type StateEvent,
} from "../services/stateMachine.js";

/** State with the default thresholds (3 and 3): S("HEALTHY", 2) means HEALTHY with failStreak 2. */
const S = (status: MonitorStatus, fail = 0, slow = 0, ok = 0): MonitorState => ({
  status,
  failStreak: fail,
  slowStreak: slow,
  okStreak: ok,
  failureThreshold: 3,
  slowThreshold: 3,
});

const OPEN = (type: IncidentType): StateEvent => ({ kind: "OPEN", type });
const CLOSE = (type: IncidentType, escalated = false): StateEvent => ({
  kind: "CLOSE",
  type,
  escalated,
});
const COUNT = (type: IncidentType): StateEvent => ({ kind: "COUNT", type });

type Row = [
  label: string,
  from: MonitorState,
  outcome: CheckOutcome,
  status: MonitorStatus,
  streaks: [number, number, number],
  events: StateEvent[],
];

// streaks = [failStreak, slowStreak, okStreak] AFTER the check
const rows: Row[] = [
  // ---- FAILURE ----
  [
    "PENDING + failure (below threshold) stays PENDING",
    S("PENDING"),
    "FAILURE",
    "PENDING",
    [1, 0, 0],
    [],
  ],
  [
    "PENDING + 3rd failure goes straight to DOWN",
    S("PENDING", 2),
    "FAILURE",
    "DOWN",
    [3, 0, 0],
    [OPEN("DOWN")],
  ],
  ["HEALTHY + 1st failure stays HEALTHY", S("HEALTHY"), "FAILURE", "HEALTHY", [1, 0, 0], []],
  ["HEALTHY + 2nd failure stays HEALTHY", S("HEALTHY", 1), "FAILURE", "HEALTHY", [2, 0, 0], []],
  [
    "HEALTHY + 3rd failure -> DOWN, opens DOWN",
    S("HEALTHY", 2),
    "FAILURE",
    "DOWN",
    [3, 0, 0],
    [OPEN("DOWN")],
  ],
  [
    "HEALTHY + failure resets a slow streak",
    S("HEALTHY", 0, 2),
    "FAILURE",
    "HEALTHY",
    [1, 0, 0],
    [],
  ],
  [
    "DEGRADED + failure (below threshold) stays DEGRADED",
    S("DEGRADED", 1),
    "FAILURE",
    "DEGRADED",
    [2, 0, 0],
    [],
  ],
  [
    "DEGRADED + 3rd failure -> DOWN, closes DEGRADED (escalated) and opens DOWN",
    S("DEGRADED", 2),
    "FAILURE",
    "DOWN",
    [3, 0, 0],
    [CLOSE("DEGRADED", true), OPEN("DOWN")],
  ],
  [
    "DOWN + failure stays DOWN and counts it",
    S("DOWN", 3),
    "FAILURE",
    "DOWN",
    [4, 0, 0],
    [COUNT("DOWN")],
  ],

  // ---- SLOW ----
  [
    "PENDING + slow (below threshold) stays PENDING",
    S("PENDING"),
    "SLOW",
    "PENDING",
    [0, 1, 0],
    [],
  ],
  [
    "PENDING + 3rd slow -> DEGRADED",
    S("PENDING", 0, 2),
    "SLOW",
    "DEGRADED",
    [0, 3, 0],
    [OPEN("DEGRADED")],
  ],
  ["HEALTHY + 2nd slow stays HEALTHY", S("HEALTHY", 0, 1), "SLOW", "HEALTHY", [0, 2, 0], []],
  [
    "HEALTHY + 3rd slow -> DEGRADED, opens DEGRADED",
    S("HEALTHY", 0, 2),
    "SLOW",
    "DEGRADED",
    [0, 3, 0],
    [OPEN("DEGRADED")],
  ],
  ["HEALTHY + slow resets a failure streak", S("HEALTHY", 2), "SLOW", "HEALTHY", [0, 1, 0], []],
  [
    "DEGRADED + slow stays DEGRADED and counts it",
    S("DEGRADED", 0, 3),
    "SLOW",
    "DEGRADED",
    [0, 4, 0],
    [COUNT("DEGRADED")],
  ],
  [
    "DOWN + slow -> DEGRADED (closes DOWN, opens DEGRADED)",
    S("DOWN", 5),
    "SLOW",
    "DEGRADED",
    [0, 1, 0],
    [CLOSE("DOWN"), OPEN("DEGRADED")],
  ],

  // ---- SUCCESS ----
  ["PENDING + success -> HEALTHY", S("PENDING"), "SUCCESS", "HEALTHY", [0, 0, 1], []],
  [
    "HEALTHY + success resets every bad streak",
    S("HEALTHY", 2),
    "SUCCESS",
    "HEALTHY",
    [0, 0, 1],
    [],
  ],
  [
    "DEGRADED + success (below threshold) stays DEGRADED",
    S("DEGRADED", 0, 0, 1),
    "SUCCESS",
    "DEGRADED",
    [0, 0, 2],
    [],
  ],
  [
    "DEGRADED + 3rd success -> HEALTHY, closes DEGRADED",
    S("DEGRADED", 0, 0, 2),
    "SUCCESS",
    "HEALTHY",
    [0, 0, 3],
    [CLOSE("DEGRADED")],
  ],
  [
    "DEGRADED + success after slow checks restarts the ok streak",
    S("DEGRADED", 0, 2),
    "SUCCESS",
    "DEGRADED",
    [0, 0, 1],
    [],
  ],
  [
    "DOWN + success -> HEALTHY, closes DOWN",
    S("DOWN", 4),
    "SUCCESS",
    "HEALTHY",
    [0, 0, 1],
    [CLOSE("DOWN")],
  ],
];

describe("evaluate: every ENG-3 row", () => {
  it.each(rows)("%s", (_label, from, outcome, status, [fail, slow, ok], events) => {
    const result = evaluate(from, { outcome });
    expect(result.next).toEqual({
      status,
      failStreak: fail,
      slowStreak: slow,
      okStreak: ok,
      failureThreshold: 3,
      slowThreshold: 3,
    });
    expect(result.events).toEqual(events);
  });

  it("the table covers every status x outcome combination", () => {
    const seen = new Set(rows.map((r) => `${r[1].status}/${r[2]}`));
    for (const status of MONITOR_STATUSES) {
      for (const outcome of CHECK_OUTCOMES)
        expect(seen.has(`${status}/${outcome}`), `${status}/${outcome}`).toBe(true);
    }
  });
});

describe("evaluate: thresholds come from the state", () => {
  it("failureThreshold 1 means the first failure is DOWN", () => {
    const r = evaluate({ ...S("HEALTHY"), failureThreshold: 1 }, { outcome: "FAILURE" });
    expect(r.next.status).toBe("DOWN");
    expect(r.events).toEqual([OPEN("DOWN")]);
  });
  it("slowThreshold 2 degrades after two slow checks and recovers after two fast ones", () => {
    const base = { ...S("HEALTHY"), slowThreshold: 2 };
    const one = evaluate(base, { outcome: "SLOW" });
    const two = evaluate(one.next, { outcome: "SLOW" });
    expect(two.next.status).toBe("DEGRADED");
    const fast1 = evaluate(two.next, { outcome: "SUCCESS" });
    const fast2 = evaluate(fast1.next, { outcome: "SUCCESS" });
    expect([fast1.next.status, fast2.next.status]).toEqual(["DEGRADED", "HEALTHY"]);
  });
});

/** Plays a string of outcomes: F = failure, L = slow ("late"), S = success. */
function play(initial: MonitorState, sequence: string) {
  const map: Record<string, CheckOutcome> = { F: "FAILURE", L: "SLOW", S: "SUCCESS" };
  let state = initial;
  const events: StateEvent[] = [];
  const statuses: MonitorStatus[] = [];
  for (const letter of sequence) {
    const outcome = map[letter];
    if (!outcome) throw new Error(`bad letter ${letter}`);
    const r = evaluate(state, { outcome });
    state = r.next;
    events.push(...r.events);
    statuses.push(state.status);
  }
  return { state, events, statuses };
}

describe("evaluate: sequences", () => {
  it("3 failures then a success: DOWN on the third, HEALTHY again on the next", () => {
    const r = play(S("HEALTHY"), "FFFS");
    expect(r.statuses).toEqual(["HEALTHY", "HEALTHY", "DOWN", "HEALTHY"]);
    expect(r.events).toEqual([OPEN("DOWN"), CLOSE("DOWN")]);
  });

  it("slow, slow, slow then 3 fast: DEGRADED on the third slow, HEALTHY on the third fast", () => {
    const r = play(S("HEALTHY"), "LLLSSS");
    expect(r.statuses).toEqual([
      "HEALTHY",
      "HEALTHY",
      "DEGRADED",
      "DEGRADED",
      "DEGRADED",
      "HEALTHY",
    ]);
    expect(r.events).toEqual([OPEN("DEGRADED"), CLOSE("DEGRADED")]);
  });

  it("a fast check in the middle resets the slow streak: never degraded", () => {
    const r = play(S("HEALTHY"), "LLSLL");
    expect(new Set(r.statuses)).toEqual(new Set(["HEALTHY"]));
    expect(r.events).toEqual([]);
  });

  it("a slow check in the middle resets the failure streak: never down", () => {
    const r = play(S("HEALTHY"), "FFLFF");
    expect(new Set(r.statuses)).toEqual(new Set(["HEALTHY"]));
    expect(r.events).toEqual([]);
  });

  it("failure while DEGRADED: three failures replace the DEGRADED incident with a DOWN one", () => {
    const r = play(S("DEGRADED"), "FFF");
    expect(r.statuses).toEqual(["DEGRADED", "DEGRADED", "DOWN"]);
    expect(r.events).toEqual([CLOSE("DEGRADED", true), OPEN("DOWN")]);
  });

  it("DOWN then a slow success: DEGRADED, and later HEALTHY after 3 fast checks", () => {
    const r = play(S("DOWN", 3), "LSSS");
    expect(r.statuses).toEqual(["DEGRADED", "DEGRADED", "DEGRADED", "HEALTHY"]);
    expect(r.events).toEqual([CLOSE("DOWN"), OPEN("DEGRADED"), CLOSE("DEGRADED")]);
  });

  it("a brand new monitor that never answers goes PENDING -> DOWN without ever being HEALTHY", () => {
    const r = play(S("PENDING"), "FFF");
    expect(r.statuses).toEqual(["PENDING", "PENDING", "DOWN"]);
  });

  it("flapping opens and closes separate incidents, one at a time", () => {
    const r = play(S("HEALTHY"), "FFFSFFFS");
    expect(r.events).toEqual([OPEN("DOWN"), CLOSE("DOWN"), OPEN("DOWN"), CLOSE("DOWN")]);
  });

  it("a long outage keeps counting failed checks in the same incident", () => {
    const r = play(S("HEALTHY"), "FFFFFF");
    expect(r.events).toEqual([OPEN("DOWN"), COUNT("DOWN"), COUNT("DOWN"), COUNT("DOWN")]);
    expect(r.state.failStreak).toBe(6);
  });

  it("FFFLSSS: down, then recovering through a slow check, then three fast ones", () => {
    const r = play(S("HEALTHY"), "FFFLSSS");
    // FFF -> DOWN (open DOWN); L -> DEGRADED (close DOWN, open DEGRADED); SSS -> HEALTHY (close DEGRADED)
    expect(r.statuses).toEqual([
      "HEALTHY",
      "HEALTHY",
      "DOWN",
      "DEGRADED",
      "DEGRADED",
      "DEGRADED",
      "HEALTHY",
    ]);
    expect(r.events).toEqual([OPEN("DOWN"), CLOSE("DOWN"), OPEN("DEGRADED"), CLOSE("DEGRADED")]);
  });

  it("LLLFFF: degraded, then down (the DEGRADED incident is closed as escalated)", () => {
    const r = play(S("HEALTHY"), "LLLFFF");
    // LLL -> DEGRADED (open DEGRADED); FFF -> DOWN (close DEGRADED escalated, open DOWN)
    expect(r.statuses).toEqual(["HEALTHY", "HEALTHY", "DEGRADED", "DEGRADED", "DEGRADED", "DOWN"]);
    expect(r.events).toEqual([OPEN("DEGRADED"), CLOSE("DEGRADED", true), OPEN("DOWN")]);
  });

  it("a custom failureThreshold of 2 opens the incident on the second failure", () => {
    const r = play({ ...S("HEALTHY"), failureThreshold: 2 }, "FF");
    expect(r.statuses).toEqual(["HEALTHY", "DOWN"]);
    expect(r.events).toEqual([OPEN("DOWN")]);
  });
});

describe("evaluate: invariants", () => {
  it("is pure: does not modify its input and gives the same answer twice", () => {
    const input = Object.freeze(S("HEALTHY", 2));
    const a = evaluate(input, { outcome: "FAILURE" });
    const b = evaluate(input, { outcome: "FAILURE" });
    expect(a).toEqual(b);
    expect(input.failStreak).toBe(2);
  });

  it("over 5,000 random checks from every starting state: never two open incidents of a type, never a close without an open, status always matches the open incident", () => {
    let seed = 42;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const pick = (): CheckOutcome => {
      const r = rand();
      return r < 0.4 ? "SUCCESS" : r < 0.7 ? "SLOW" : "FAILURE";
    };

    for (const start of MONITOR_STATUSES) {
      let state = S(start);
      const open: Record<IncidentType, boolean> = {
        DOWN: start === "DOWN",
        DEGRADED: start === "DEGRADED",
      };
      for (let i = 0; i < 5000; i++) {
        const { next, events } = evaluate(state, { outcome: pick() });
        for (const e of events) {
          if (e.kind === "OPEN") {
            expect(open[e.type]).toBe(false);
            open[e.type] = true;
          } else if (e.kind === "CLOSE") {
            expect(open[e.type]).toBe(true);
            open[e.type] = false;
          } else {
            expect(open[e.type]).toBe(true); // COUNT only ever targets an open incident
          }
        }
        expect(open.DOWN).toBe(next.status === "DOWN");
        expect(open.DEGRADED).toBe(next.status === "DEGRADED");
        state = next;
      }
    }
  });
});
