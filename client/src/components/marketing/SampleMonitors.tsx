import { useNow } from "../../hooks/useNow";
import type { Tick } from "../../types/api";
import { cn } from "../../utils/cn";
import type { DisplayStatus } from "../../utils/status";
import { StatusBadge } from "../StatusBadge";
import { StatusBanner } from "../StatusBanner";
import { TickStrip } from "../TickStrip";

/** u = up, s = slow, d = down, n = no data: 24 characters, oldest first. */
const strip = (s: string): Tick[] =>
  [...s].map((c) => ({ u: "up", s: "slow", d: "down", n: "none" })[c] as Tick);

type Sample = {
  name: string;
  url: string;
  status: DisplayStatus;
  ms: string;
  ticks: Tick[];
};

// Made-up data for the landing and sign-in pages. Nothing here comes from the API.
const SAMPLES: Sample[] = [
  {
    name: "Payments API",
    url: "GET api.acme.dev/v1/payments",
    status: "healthy",
    ms: "122 ms",
    ticks: strip("uuuuuuuuuuuuuuuuuuuuuuuu"),
  },
  {
    name: "Search API",
    url: "GET api.acme.dev/v1/search",
    status: "degraded",
    ms: "1.24 s",
    ticks: strip("uuuuuuuuuuuuuuuuuuuuussss"),
  },
  {
    name: "Auth Service",
    url: "POST api.acme.dev/v1/token",
    status: "healthy",
    ms: "76 ms",
    ticks: strip("uuuuuuuuuuudduuuuuuuuuuu"),
  },
];

/**
 * A miniature dashboard built from the real components, so the marketing pages show what the product looks
 * like without needing an account. Decorative: hidden from screen readers, and labelled as sample data.
 */
export function SampleMonitorCard({ className }: { className?: string }) {
  const now = useNow(60_000);
  return (
    <div
      aria-hidden="true"
      className={cn("space-y-3 rounded-2xl border border-line bg-surface p-3 sm:p-4", className)}
    >
      <StatusBanner
        monitors={{ total: 3, healthy: 2, degraded: 1, down: 0, pending: 0, paused: 0 }}
      />
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {SAMPLES.map((s) => (
          <li
            key={s.name}
            className="grid items-center gap-x-5 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{s.name}</p>
              <p className="data truncate text-xs text-fg-muted">{s.url}</p>
            </div>
            <TickStrip ticks={s.ticks} now={now} className="h-5" />
            <div className="flex items-center gap-3 sm:justify-end">
              <StatusBadge status={s.status} size="sm" />
              <span className="data w-16 text-right text-xs">{s.ms}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="px-1 text-right text-[11px] text-fg-muted">Sample data</p>
    </div>
  );
}
