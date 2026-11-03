/** Relative and absolute time, durations and response times. Pure functions: they take `now` so tests (and a ticking hook) control it. */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "3 min ago", "in 2 h". null (never happened) is "Never". */
export function formatRelative(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "Never";
  const diff = now - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;

  let text: string;
  if (abs < 5 * SECOND) return "just now";
  else if (abs < MINUTE) text = `${Math.round(abs / SECOND)} s`;
  else if (abs < HOUR) text = `${Math.round(abs / MINUTE)} min`;
  else if (abs < DAY) text = `${Math.round(abs / HOUR)} h`;
  else text = `${Math.round(abs / DAY)} d`;

  return future ? `in ${text}` : `${text} ago`;
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

/** The exact time, for tooltips and tables: "3 Nov 2026, 10:15:42". */
export function formatDateTime(iso: string | null): string {
  return iso ? dateTime.format(new Date(iso)) : "—";
}

/** 45 -> "45 s", 300 -> "5 min", 7500 -> "2 h 5 min", 90000 -> "1 d 1 h". */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return min % 60 === 0 ? `${hours} h` : `${hours} h ${min % 60} min`;
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days} d` : `${days} d ${hours % 24} h`;
}

/** The check interval as people say it. Same rules as formatInterval() in server/src/config/plans.ts. */
export function formatInterval(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${sec / 60} min`;
  return `${sec / 3600} h`;
}

/** 142 -> "142 ms", 2350 -> "2.35 s", null -> "—". */
export function formatMs(ms: number | null): string {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}
