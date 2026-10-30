// Pure function: no database, no clock, no logging. Every row of the ENG-3 table lives here.
// The types are plain string unions on purpose: they match Prisma's generated enums, but this file
// imports nothing, so it can be tested without a database.

export const MONITOR_STATUSES = ["PENDING", "HEALTHY", "DEGRADED", "DOWN"] as const;
export const CHECK_OUTCOMES = ["SUCCESS", "SLOW", "FAILURE"] as const;
export const INCIDENT_TYPES = ["DOWN", "DEGRADED"] as const;

export type MonitorStatus = (typeof MONITOR_STATUSES)[number];
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];
export type IncidentType = (typeof INCIDENT_TYPES)[number];

/** The slice of a monitor the state machine needs. A Prisma Monitor row fits this shape. */
export type MonitorState = {
  status: MonitorStatus;
  failStreak: number;
  slowStreak: number;
  okStreak: number;
  failureThreshold: number;
  slowThreshold: number;
};

/** Instructions for the caller. The state machine never touches the database itself. */
export type StateEvent =
  | { kind: "OPEN"; type: IncidentType } // open an incident of this type
  | { kind: "CLOSE"; type: IncidentType; escalated: boolean } // close it; escalated = replaced by a worse one (DEGRADED -> DOWN)
  | { kind: "COUNT"; type: IncidentType }; // one more bad check inside the incident that stays open

export type Evaluation = { next: MonitorState; events: StateEvent[] };

/** Makes a missing `case` a compile error: add a status or outcome and TypeScript points here. */
export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

const OPEN = (type: IncidentType): StateEvent => ({ kind: "OPEN", type });
const CLOSE = (type: IncidentType, escalated = false): StateEvent => ({
  kind: "CLOSE",
  type,
  escalated,
});
const COUNT = (type: IncidentType): StateEvent => ({ kind: "COUNT", type });

type Counters = Pick<MonitorState, "failStreak" | "slowStreak" | "okStreak">;

function build(
  state: MonitorState,
  status: MonitorStatus,
  counters: Counters,
  events: StateEvent[],
): Evaluation {
  return {
    next: {
      status,
      failureThreshold: state.failureThreshold,
      slowThreshold: state.slowThreshold,
      ...counters,
    },
    events,
  };
}

function onFailure(state: MonitorState): Evaluation {
  // A failure bumps failStreak and resets the other two streaks
  const counters: Counters = { failStreak: state.failStreak + 1, slowStreak: 0, okStreak: 0 };
  switch (state.status) {
    case "DOWN":
      // already DOWN: stays DOWN, the open incident counts one more failed check
      return build(state, "DOWN", counters, [COUNT("DOWN")]);
    case "PENDING":
    case "HEALTHY":
    case "DEGRADED": {
      if (counters.failStreak < state.failureThreshold) {
        return build(state, state.status, counters, []); // one failure is not an outage (but the UI shows it)
      }
      // DEGRADED -> DOWN: the DEGRADED incident is replaced by the worse one
      const events: StateEvent[] = [];
      if (state.status === "DEGRADED") events.push(CLOSE("DEGRADED", true));
      events.push(OPEN("DOWN"));
      return build(state, "DOWN", counters, events);
    }
    default:
      return assertNever(state.status);
  }
}

function onSlow(state: MonitorState): Evaluation {
  const counters: Counters = { failStreak: 0, slowStreak: state.slowStreak + 1, okStreak: 0 };
  switch (state.status) {
    case "PENDING":
    case "HEALTHY":
      if (counters.slowStreak >= state.slowThreshold)
        return build(state, "DEGRADED", counters, [OPEN("DEGRADED")]);
      return build(state, state.status, counters, []);
    case "DEGRADED":
      return build(state, "DEGRADED", counters, [COUNT("DEGRADED")]);
    case "DOWN":
      // the service answers again, but slowly: DOWN is over, DEGRADED starts right away
      return build(state, "DEGRADED", counters, [CLOSE("DOWN"), OPEN("DEGRADED")]);
    default:
      return assertNever(state.status);
  }
}

function onSuccess(state: MonitorState): Evaluation {
  const counters: Counters = { failStreak: 0, slowStreak: 0, okStreak: state.okStreak + 1 };
  switch (state.status) {
    case "PENDING":
      return build(state, "HEALTHY", counters, []); // first good check ever
    case "HEALTHY":
      return build(state, "HEALTHY", counters, []);
    case "DEGRADED":
      // recovery from slow needs a run of good checks, so one lucky fast response does not close it
      if (counters.okStreak >= state.slowThreshold)
        return build(state, "HEALTHY", counters, [CLOSE("DEGRADED")]);
      return build(state, "DEGRADED", counters, []);
    case "DOWN":
      return build(state, "HEALTHY", counters, [CLOSE("DOWN")]); // one good check ends an outage
    default:
      return assertNever(state.status);
  }
}

export function evaluate(state: MonitorState, result: { outcome: CheckOutcome }): Evaluation {
  switch (result.outcome) {
    case "FAILURE":
      return onFailure(state);
    case "SLOW":
      return onSlow(state);
    case "SUCCESS":
      return onSuccess(state);
    default:
      return assertNever(result.outcome);
  }
}
