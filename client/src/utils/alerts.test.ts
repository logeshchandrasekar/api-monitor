import { describe, expect, it } from "vitest";
import type { AlertSettings, NotificationItem } from "../types/api";
import {
  COOLDOWN_PRESETS,
  cooldownOptions,
  describeNotification,
  formatCooldown,
  formFromSettings,
  isDirty,
  toInput,
  validateRecipient,
} from "./alerts";

const saved: AlertSettings = {
  notifyOnDown: true,
  notifyOnRecovery: true,
  notifyOnSlow: false,
  cooldownMinutes: 30,
  recipientEmail: null,
  effectiveRecipient: "me@example.com",
};

const row = (over: Partial<NotificationItem>): NotificationItem => ({
  id: "1",
  incidentId: "i",
  type: "DOWN",
  status: "SENT",
  recipient: "me@example.com",
  attempts: 1,
  error: null,
  note: null,
  eventAt: "2026-11-07T10:00:00.000Z",
  sentAt: "2026-11-07T10:00:02.000Z",
  createdAt: "2026-11-07T10:00:00.000Z",
  ...over,
});

describe("form <-> settings", () => {
  it("a saved rule round-trips: no recipient is an empty box and goes back as null", () => {
    const form = formFromSettings(saved);
    expect(form.recipient).toBe("");
    expect(toInput(form)).toEqual({
      notifyOnDown: true,
      notifyOnRecovery: true,
      notifyOnSlow: false,
      cooldownMinutes: 30,
      recipientEmail: null,
    });
  });

  it("the recipient is trimmed and lower-cased before it is sent", () => {
    const form = { ...formFromSettings(saved), recipient: "  OnCall@Example.COM " };
    expect(toInput(form).recipientEmail).toBe("oncall@example.com");
  });

  it("whitespace only counts as no recipient", () => {
    expect(toInput({ ...formFromSettings(saved), recipient: "   " }).recipientEmail).toBeNull();
  });
});

describe("isDirty", () => {
  it("is false for an untouched form", () => {
    expect(isDirty(formFromSettings(saved), saved)).toBe(false);
  });

  it.each([
    ["a checkbox", { notifyOnDown: false }],
    ["the cooldown", { cooldownMinutes: 60 }],
    ["the recipient", { recipient: "other@example.com" }],
  ])("is true after changing %s", (_n, patch) => {
    expect(isDirty({ ...formFromSettings(saved), ...patch }, saved)).toBe(true);
  });

  it("typing the saved address with different case or spaces is not a change", () => {
    const withRecipient = { ...saved, recipientEmail: "oncall@example.com" };
    const form = { ...formFromSettings(withRecipient), recipient: " ONCALL@example.com " };
    expect(isDirty(form, withRecipient)).toBe(false);
  });

  it("clearing a saved recipient is a change", () => {
    const withRecipient = { ...saved, recipientEmail: "oncall@example.com" };
    expect(isDirty({ ...formFromSettings(withRecipient), recipient: "" }, withRecipient)).toBe(
      true,
    );
  });
});

describe("validateRecipient", () => {
  it("blank is allowed", () => {
    expect(validateRecipient("")).toBeNull();
    expect(validateRecipient("   ")).toBeNull();
  });
  it("otherwise it must look like an email", () => {
    expect(validateRecipient("a@b.co")).toBeNull();
    expect(validateRecipient("nope")).toBe("Enter a valid email address.");
  });
});

describe("cooldown choices", () => {
  it("are the presets, with an unusual saved value added in order", () => {
    expect(cooldownOptions(30)).toEqual([...COOLDOWN_PRESETS]);
    expect(cooldownOptions(45)).toEqual([5, 15, 30, 45, 60, 120, 360, 1440]);
  });
  it("are worded like durations everywhere else", () => {
    expect(formatCooldown(5)).toBe("5 min");
    expect(formatCooldown(60)).toBe("1 h");
    expect(formatCooldown(120)).toBe("2 h");
    expect(formatCooldown(1440)).toBe("1 d");
  });
});

describe("describeNotification", () => {
  it("sent", () => {
    expect(describeNotification(row({}))).toBe("Sent to me@example.com");
  });
  it("queued, never tried and retrying", () => {
    expect(describeNotification(row({ status: "QUEUED", attempts: 0 }))).toBe("Waiting to be sent");
    expect(
      describeNotification(
        row({ status: "QUEUED", attempts: 2, error: "Could not reach the mail server." }),
      ),
    ).toBe("Retrying: attempt 2 failed. Could not reach the mail server.");
  });
  it("failed says how many times it tried", () => {
    expect(
      describeNotification(
        row({ status: "FAILED", attempts: 4, error: "Could not reach the mail server." }),
      ),
    ).toBe("Could not reach the mail server. Gave up after 4 attempts.");
    expect(describeNotification(row({ type: "TEST", status: "FAILED", attempts: 1 }))).toBe(
      "Could not be sent. Gave up after 1 attempt.",
    );
  });
  it("suppressed shows the reason the server gave", () => {
    expect(describeNotification(row({ status: "SUPPRESSED", note: "Cooldown: ..." }))).toBe(
      "Cooldown: ...",
    );
    expect(describeNotification(row({ status: "SUPPRESSED" }))).toBe("Not sent.");
  });
});
