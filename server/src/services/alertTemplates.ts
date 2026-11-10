// Pure functions: no database, no clock, no environment. Given the facts of one alert they return the subject,
// a plain-text body and an HTML body. They are the only place that decides what an alert email may contain.
//
// What an alert email never contains (8.2): request headers, request bodies, secrets, or the query string
// of the monitored URL (people put API keys there). Everything that comes from a person or a remote
// server is HTML-escaped; the subject cannot carry line breaks.

export type AlertKind = "DOWN" | "DEGRADED" | "RECOVERED" | "TEST";

export type AlertEmailData = {
  kind: AlertKind;
  monitorName: string;
  monitorUrl: string;
  /** Full link to the monitor page, e.g. http://localhost:5173/monitors/<id> */
  monitorLink: string;
  /** For RECOVERED: which kind of incident ended. Ignored otherwise. */
  incidentType?: "DOWN" | "DEGRADED";
  /** The incident's own sentence ("3 failed checks in a row. Last error: ..."). */
  reason?: string | null;
  startedAt?: Date | null;
  resolvedAt?: Date | null;
  durationSec?: number | null;
};

export type RenderedEmail = { subject: string; text: string; html: string };

/** 2026-11-07 14:03 UTC. The account has no time zone setting, so alerts use UTC and say so. */
export function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** 100 -> "1 min 40 s", 3900 -> "1 h 5 min", 45 -> "45 s". At most the two biggest non-zero units. */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const units: [string, number][] = [
    ["d", Math.floor(sec / 86_400)],
    ["h", Math.floor((sec % 86_400) / 3600)],
    ["min", Math.floor((sec % 3600) / 60)],
    ["s", sec % 60],
  ];
  const parts = units.filter(([, n]) => n > 0).slice(0, 2);
  return parts.length === 0 ? "0 s" : parts.map(([unit, n]) => `${n} ${unit}`).join(" ");
}

/** Origin and path only. A query string is replaced by "?…", and any user:password part is dropped. */
export function displayUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname === "/" && !u.search ? "" : u.pathname}${u.search ? "?…" : ""}`;
  } catch {
    return "(unreadable URL)";
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const oneLine = (value: string) => value.replace(/[\r\n\u2028\u2029]+/g, " ").trim();

const ACCENT: Record<AlertKind, string> = {
  DOWN: "#dc2626",
  DEGRADED: "#d97706",
  RECOVERED: "#16a34a",
  TEST: "#2563eb",
};

type Content = {
  subject: string;
  headline: string;
  lead: string;
  rows: [string, string][];
};

function contentFor(d: AlertEmailData): Content {
  const name = oneLine(d.monitorName);
  const url = displayUrl(d.monitorUrl);
  const base: [string, string][] = [
    ["Monitor", name],
    ["Endpoint", url],
  ];
  const started = d.startedAt ? formatUtc(d.startedAt) : null;

  switch (d.kind) {
    case "DOWN":
      return {
        subject: `[DOWN] ${name} is down`,
        headline: `${name} is down`,
        lead: "API Monitor stopped getting good answers from this endpoint.",
        rows: [
          ...base,
          ...(d.reason ? ([["What happened", d.reason]] as [string, string][]) : []),
          ...(started ? ([["Started", started]] as [string, string][]) : []),
        ],
      };
    case "DEGRADED":
      return {
        subject: `[DEGRADED] ${name} is slow`,
        headline: `${name} is slow`,
        lead: "The endpoint answers, but slower than the limit you set for it.",
        rows: [
          ...base,
          ...(d.reason ? ([["What happened", d.reason]] as [string, string][]) : []),
          ...(started ? ([["Started", started]] as [string, string][]) : []),
        ],
      };
    case "RECOVERED": {
      const duration = d.durationSec != null ? formatDuration(d.durationSec) : null;
      const wasSlow = d.incidentType === "DEGRADED";
      return {
        subject: `[RECOVERED] ${name} is back${duration ? ` after ${duration}` : ""}`,
        headline: `${name} is back`,
        lead: wasSlow
          ? "Response times are back under the limit."
          : "The endpoint is answering normally again.",
        rows: [
          ...base,
          ...(duration
            ? ([[wasSlow ? "Slow for" : "Down for", duration]] as [string, string][])
            : []),
          ...(started ? ([["Started", started]] as [string, string][]) : []),
          ...(d.resolvedAt ? ([["Recovered", formatUtc(d.resolvedAt)]] as [string, string][]) : []),
        ],
      };
    }
    case "TEST":
      return {
        subject: `[TEST] Alerts for ${name}`,
        headline: "This is a test email",
        lead: "If you can read this, alerts for this monitor can reach you. Nothing is wrong.",
        rows: base,
      };
  }
}

export function renderAlertEmail(d: AlertEmailData): RenderedEmail {
  const c = contentFor(d);
  const accent = ACCENT[d.kind];
  const subject = oneLine(c.subject);

  const text = [
    c.headline,
    "",
    c.lead,
    "",
    ...c.rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Open the monitor: ${d.monitorLink}`,
    "",
    "--",
    "You get this email because alerts are switched on for this monitor.",
    "You can change that on the monitor page, under Alerts. Times are in UTC.",
  ].join("\n");

  const rowsHtml = c.rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;color:#111827">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">` +
    `<div style="height:6px;background:${accent}"></div>` +
    `<div style="padding:24px">` +
    `<p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.06em;color:${accent}">${d.kind}</p>` +
    `<h1 style="margin:0 0 8px;font-size:20px;color:#111827">${escapeHtml(c.headline)}</h1>` +
    `<p style="margin:0 0 16px;color:#374151;font-size:14px">${escapeHtml(c.lead)}</p>` +
    `<table style="border-collapse:collapse;font-size:14px;width:100%">${rowsHtml}</table>` +
    `<p style="margin:24px 0 0"><a href="${escapeHtml(d.monitorLink)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Open the monitor</a></p>` +
    `</div>` +
    `<div style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px">` +
    `You get this email because alerts are switched on for this monitor. Change that on the monitor page, under Alerts. Times are in UTC.` +
    `</div></div></body></html>`;

  return { subject, text, html };
}