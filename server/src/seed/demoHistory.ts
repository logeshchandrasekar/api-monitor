// Pure and deterministic: no database, no clock, no randomness except a seeded generator.
// It invents 30 days of believable check history for one monitor, then replays that history through the
// REAL state machine (services/stateMachine.ts), so the incidents it returns are exactly the ones the live
// engine would have opened and closed for those checks, with the same wording (reasonFor).

import { reasonFor, secondsBetween } from "../services/incidentLifecycle.js";
import {
  evaluate,
  type CheckOutcome,
  type IncidentType,
  type MonitorState,
  type MonitorStatus,
} from "../services/stateMachine.js";
import { failureMessage } from "../utils/errorMessages.js";

export type FailureKind = "UNEXPECTED_STATUS" | "TIMEOUT" | "CONNECTION";

export type DemoProfile = {
  name: string;
  url: string;
  intervalSec: number;
  /** The monitor's "slow" threshold: a check above it is SLOW. */
  responseThresholdMs: number;
  timeoutMs: number;
  /** Typical response time in the quiet part of the day. */
  baseMs: number;
  /** A stretch of unusually slow answers, `daysAgo` days before "now", lasting `minutes`. */
  slowSpells: { daysAgo: number; minutes: number }[];
  /** A stretch where every check fails with the given failure. */
  outages: { daysAgo: number; minutes: number; kind: FailureKind }[];
  /** Chance that a single check fails by itself (never enough to open an incident). */
  randomFailureRate: number;
};

// example.com on purpose: it is a real, harmless address, so "Check now" works on a demo monitor (a manual
// check never counts anywhere). The scheduler never runs these monitors (seedDemo freezes their nextCheckAt),
// so no real check ever mixes into the synthetic history.
export const DEMO_PROFILES: DemoProfile[] = [
  {
    name: "Payments API",
    url: "https://example.com/?demo=payments",
    intervalSec: 60,
    responseThresholdMs: 800,
    timeoutMs: 10_000,
    baseMs: 180,
    slowSpells: [
      { daysAgo: 12.2, minutes: 65 },
      { daysAgo: 3.4, minutes: 40 },
    ],
    outages: [
      { daysAgo: 19.3, minutes: 42, kind: "UNEXPECTED_STATUS" },
      { daysAgo: 6.1, minutes: 11, kind: "TIMEOUT" },
    ],
    randomFailureRate: 0.0003,
  },
  {
    name: "Auth Service",
    url: "https://example.com/?demo=auth",
    intervalSec: 60,
    responseThresholdMs: 500,
    timeoutMs: 10_000,
    baseMs: 90,
    slowSpells: [
      { daysAgo: 22, minutes: 90 },
      { daysAgo: 1.5, minutes: 30 },
    ],
    outages: [{ daysAgo: 9.7, minutes: 25, kind: "CONNECTION" }],
    randomFailureRate: 0.0002,
  },
  {
    name: "Search API",
    url: "https://example.com/?demo=search",
    intervalSec: 300,
    responseThresholdMs: 1000,
    timeoutMs: 10_000,
    baseMs: 320,
    slowSpells: [{ daysAgo: 15, minutes: 240 }],
    outages: [{ daysAgo: 26, minutes: 30, kind: "UNEXPECTED_STATUS" }],
    randomFailureRate: 0.001,
  },
  {
    name: "Reports Export",
    url: "https://example.com/?demo=reports",
    intervalSec: 900,
    responseThresholdMs: 1500,
    timeoutMs: 10_000,
    baseMs: 650,
    slowSpells: [
      { daysAgo: 8, minutes: 360 },
      { daysAgo: 2.8, minutes: 120 },
    ],
    outages: [],
    randomFailureRate: 0,
  },
];

export type DemoCheck = {
  checkedAt: Date;
  outcome: CheckOutcome;
  failureType: FailureKind | null;
  statusCode: number | null;
  responseTimeMs: number | null;
  errorMessage: string | null;
};

export type DemoIncident = {
  type: IncidentType;
  reason: string;
  failureType: FailureKind | null;
  failedChecks: number;
  startedAt: Date;
  /** null = still open */
  resolvedAt: Date | null;
  durationSec: number | null;
};

export type DemoFinalState = {
  status: MonitorStatus;
  failStreak: number;
  slowStreak: number;
  okStreak: number;
  lastCheckedAt: Date;
  lastStatusCode: number | null;
  lastResponseTimeMs: number | null;
  lastStatusChangeAt: Date | null;
};

export type DemoHistory = {
  checks: DemoCheck[];
  incidents: DemoIncident[];
  final: DemoFinalState;
};

/** A small, fast, seedable random generator (mulberry32). The same seed always gives the same numbers. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const hashString = (s: string): number => {
  let h = 2_166_136_261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16_777_619);
  return h >>> 0;
};

/** Standard normal number from two uniform ones (Box-Muller). */
const gaussian = (rand: () => number): number =>
  Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

/** Busy hours are slower: 0 at 02:00 UTC, 1 at 14:00 UTC. */
const loadAt = (ms: number): number => {
  const d = new Date(ms);
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  return 0.5 + 0.5 * Math.sin((2 * Math.PI * (hour - 8)) / 24);
};

type Window = { from: number; to: number };
const windowOf = (nowMs: number, daysAgo: number, minutes: number): Window => {
  const from = nowMs - daysAgo * 86_400_000;
  return { from, to: from + minutes * 60_000 };
};
const inside = (ms: number, w: Window) => ms >= w.from && ms < w.to;

export function generateHistory(profile: DemoProfile, nowMs: number, days = 30): DemoHistory {
  const rand = mulberry32(hashString(profile.name));
  const n = Math.floor((days * 86_400) / profile.intervalSec);
  const spells = profile.slowSpells
    .map((s) => windowOf(nowMs, s.daysAgo, s.minutes))
    .filter((w) => w.to > nowMs - days * 86_400_000);
  const outages = profile.outages
    .map((o) => ({ ...windowOf(nowMs, o.daysAgo, o.minutes), kind: o.kind }))
    .filter((o) => o.to > nowMs - days * 86_400_000);

  const checks: DemoCheck[] = [];
  const incidents: DemoIncident[] = [];
  const open = new Map<IncidentType, DemoIncident>();

  let state: MonitorState = {
    status: "PENDING",
    failStreak: 0,
    slowStreak: 0,
    okStreak: 0,
    failureThreshold: 3,
    slowThreshold: 3,
  };
  let lastStatusChangeAt: Date | null = null;

  for (let i = 0; i < n; i++) {
    // Checks are `intervalSec` apart, the last one about one interval before "now", with up to 2 s of jitter
    const t = nowMs - (n - i) * profile.intervalSec * 1000 + Math.floor(rand() * 2000);
    const checkedAt = new Date(t);

    const outage = outages.find((o) => inside(t, o));
    const randomFailure = rand() < profile.randomFailureRate;
    let check: DemoCheck;

    if (outage || randomFailure) {
      const kind: FailureKind = outage ? outage.kind : "UNEXPECTED_STATUS";
      const answered = kind === "UNEXPECTED_STATUS"; // a 503 still answers, a timeout or a refusal does not
      check = {
        checkedAt,
        outcome: "FAILURE",
        failureType: kind,
        statusCode: answered ? 503 : null,
        responseTimeMs: answered
          ? Math.max(5, Math.round(profile.baseMs * (0.4 + rand() * 0.4)))
          : null,
        errorMessage: failureMessage(kind, {
          timeoutMs: profile.timeoutMs,
          expectedStatus: 200,
          actualStatus: 503,
        }),
      };
    } else {
      // Daily rhythm x noise, with an occasional long tail; inside a slow spell, above the threshold
      let ms = profile.baseMs * (0.8 + 0.4 * loadAt(t)) * Math.exp(gaussian(rand) * 0.18);
      if (rand() < 0.01) ms *= 2 + rand() * 1.5;
      if (spells.some((w) => inside(t, w))) {
        ms = Math.max(ms, profile.responseThresholdMs * (1.1 + rand() * 0.9));
      }
      const responseTimeMs = Math.max(5, Math.round(ms));
      check = {
        checkedAt,
        outcome: responseTimeMs > profile.responseThresholdMs ? "SLOW" : "SUCCESS",
        failureType: null,
        statusCode: 200,
        responseTimeMs,
        errorMessage: null,
      };
    }
    checks.push(check);

    // The same call the live engine makes (services/applyCheckResult.ts)
    const { next, events } = evaluate(state, check);
    for (const event of events) {
      if (event.kind === "OPEN") {
        const incident: DemoIncident = {
          type: event.type,
          reason: reasonFor(event.type, {
            failStreak: next.failStreak,
            slowStreak: next.slowStreak,
            responseThresholdMs: profile.responseThresholdMs,
            errorMessage: check.errorMessage,
          }),
          failureType: event.type === "DOWN" ? check.failureType : null,
          failedChecks: event.type === "DOWN" ? next.failStreak : next.slowStreak,
          startedAt: checkedAt,
          resolvedAt: null,
          durationSec: null,
        };
        open.set(event.type, incident);
        incidents.push(incident);
      } else if (event.kind === "COUNT") {
        const incident = open.get(event.type);
        if (incident) incident.failedChecks += 1;
      } else {
        const incident = open.get(event.type);
        if (incident) {
          incident.resolvedAt = checkedAt;
          incident.durationSec = secondsBetween(incident.startedAt, checkedAt);
          open.delete(event.type);
        }
      }
    }
    if (next.status !== state.status) lastStatusChangeAt = checkedAt;
    state = next;
  }

  const last = checks[checks.length - 1]!;
  return {
    checks,
    incidents,
    final: {
      status: state.status,
      failStreak: state.failStreak,
      slowStreak: state.slowStreak,
      okStreak: state.okStreak,
      lastCheckedAt: last.checkedAt,
      lastStatusCode: last.statusCode,
      lastResponseTimeMs: last.responseTimeMs,
      lastStatusChangeAt,
    },
  };
}
