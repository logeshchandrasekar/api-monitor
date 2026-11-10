import { describe, expect, it } from "vitest";
import {
  displayUrl,
  escapeHtml,
  formatDuration,
  formatUtc,
  renderAlertEmail,
  type AlertEmailData,
} from "../services/alertTemplates.js";

const base: AlertEmailData = {
  kind: "DOWN",
  monitorName: "Payments API",
  monitorUrl: "https://api.example.com/health",
  monitorLink: "http://localhost:5173/monitors/abc",
  reason: "3 failed checks in a row. Last error: Could not connect to the server.",
  startedAt: new Date("2026-11-07T14:03:09.000Z"),
};

describe("subjects", () => {
  it("each kind has its own tag and wording", () => {
    expect(renderAlertEmail(base).subject).toBe("[DOWN] Payments API is down");
    expect(renderAlertEmail({ ...base, kind: "DEGRADED" }).subject).toBe(
      "[DEGRADED] Payments API is slow",
    );
    expect(renderAlertEmail({ ...base, kind: "TEST" }).subject).toBe(
      "[TEST] Alerts for Payments API",
    );
    expect(
      renderAlertEmail({ ...base, kind: "RECOVERED", incidentType: "DOWN", durationSec: 100 })
        .subject,
    ).toBe("[RECOVERED] Payments API is back after 1 min 40 s");
  });

  it("a recovery without a known duration still has a sensible subject", () => {
    expect(renderAlertEmail({ ...base, kind: "RECOVERED" }).subject).toBe(
      "[RECOVERED] Payments API is back",
    );
  });

  it("a monitor name cannot inject header lines", () => {
    const { subject } = renderAlertEmail({
      ...base,
      monitorName: "Evil\r\nBcc: victim@example.com",
    });
    expect(subject).not.toMatch(/[\r\n]/);
  });
});

describe("what is in the body", () => {
  it("the down email has the monitor, the endpoint, the reason, the start time and the link, in both formats", () => {
    const { text, html } = renderAlertEmail(base);
    for (const body of [text, html]) {
      expect(body).toContain("Payments API");
      expect(body).toContain("https://api.example.com/health");
      expect(body).toContain("3 failed checks in a row");
      expect(body).toContain("2026-11-07 14:03 UTC");
      expect(body).toContain("http://localhost:5173/monitors/abc");
    }
  });

  it("the recovery email says how long it lasted and when it ended", () => {
    const { text } = renderAlertEmail({
      ...base,
      kind: "RECOVERED",
      incidentType: "DOWN",
      durationSec: 3900,
      resolvedAt: new Date("2026-11-07T15:08:09.000Z"),
    });
    expect(text).toContain("Down for: 1 h 5 min");
    expect(text).toContain("Recovered: 2026-11-07 15:08 UTC");
  });

  it("a recovery from a slow spell says slow, not down", () => {
    const { text, subject } = renderAlertEmail({
      ...base,
      kind: "RECOVERED",
      incidentType: "DEGRADED",
      durationSec: 600,
    });
    expect(text).toContain("Slow for: 10 min");
    expect(text).toContain("Response times are back under the limit.");
    expect(subject).toContain("after 10 min");
  });

  it("the test email says nothing is wrong", () => {
    const { text } = renderAlertEmail({ ...base, kind: "TEST" });
    expect(text).toContain("Nothing is wrong.");
    expect(text).not.toContain("What happened");
  });
});

describe("what an alert never contains (8.2)", () => {
  it("hides the query string and any user:password of the monitored URL", () => {
    const monitorUrl = "https://user:hunter2@api.example.com/v1/items?api_key=SECRET123&x=1#frag";
    const out = renderAlertEmail({ ...base, monitorUrl });
    for (const part of [out.subject, out.text, out.html]) {
      expect(part).not.toContain("SECRET123");
      expect(part).not.toContain("hunter2");
      expect(part).not.toContain("user:");
    }
    expect(out.text).toContain("https://api.example.com/v1/items?…");
  });

  it("has no way to carry headers or bodies, even if a caller passes them", () => {
    const sneaky = {
      ...base,
      headers: { Authorization: "Bearer SECRET-TOKEN" },
      body: "SECRET-BODY",
    } as unknown as AlertEmailData;
    const out = renderAlertEmail(sneaky);
    for (const part of [out.subject, out.text, out.html]) {
      expect(part).not.toContain("SECRET-TOKEN");
      expect(part).not.toContain("SECRET-BODY");
    }
  });

  it("escapes everything that came from a person or a remote server", () => {
    const { html } = renderAlertEmail({
      ...base,
      monitorName: `<script>alert("x")</script>`,
      reason: `Last error: <img src=x onerror=alert(1)> & "more"`,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp; &quot;more&quot;");
  });
});

describe("helpers", () => {
  it("formatDuration keeps the two biggest units", () => {
    expect(formatDuration(0)).toBe("0 s");
    expect(formatDuration(45)).toBe("45 s");
    expect(formatDuration(100)).toBe("1 min 40 s");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(3900)).toBe("1 h 5 min");
    expect(formatDuration(90_000)).toBe("1 d 1 h");
    expect(formatDuration(-5)).toBe("0 s");
  });

  it("formatUtc is minute precision with the zone spelled out", () => {
    expect(formatUtc(new Date("2026-01-02T03:04:59.999Z"))).toBe("2026-01-02 03:04 UTC");
  });

  it("displayUrl handles a bare host, a path, and rubbish", () => {
    expect(displayUrl("https://example.com")).toBe("https://example.com");
    expect(displayUrl("https://example.com/")).toBe("https://example.com");
    expect(displayUrl("http://localhost:4100/ok")).toBe("http://localhost:4100/ok");
    expect(displayUrl("not a url")).toBe("(unreadable URL)");
  });

  it("escapeHtml covers the five characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });
});
