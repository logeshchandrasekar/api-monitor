import type { AlertSettings, AlertSettingsInput, NotificationItem } from "../types/api";
import { formatDuration } from "./time";
import { validateEmail } from "./validation";

/** Keep in sync with server/src/schemas/alerts.ts. */
export const MIN_COOLDOWN_MINUTES = 1;
export const MAX_COOLDOWN_MINUTES = 1440;

/** The cooldown choices in the select. A value saved through the API that is not here is added, so it is never lost. */
export const COOLDOWN_PRESETS = [5, 15, 30, 60, 120, 360, 1440] as const;

export function cooldownOptions(current: number): number[] {
  const all = new Set<number>([...COOLDOWN_PRESETS, current]);
  return [...all].sort((a, b) => a - b);
}

/** 5 -> "5 min", 60 -> "1 h", 1440 -> "1 d". */
export const formatCooldown = (minutes: number) => formatDuration(minutes * 60);

/** The settings form as the person edits it. `recipient` is text; "" means "my account email". */
export type AlertForm = {
  notifyOnDown: boolean;
  notifyOnRecovery: boolean;
  notifyOnSlow: boolean;
  cooldownMinutes: number;
  recipient: string;
};

export function formFromSettings(s: AlertSettings): AlertForm {
  return {
    notifyOnDown: s.notifyOnDown,
    notifyOnRecovery: s.notifyOnRecovery,
    notifyOnSlow: s.notifyOnSlow,
    cooldownMinutes: s.cooldownMinutes,
    recipient: s.recipientEmail ?? "",
  };
}

const cleanRecipient = (value: string) => value.trim().toLowerCase();

/** What PUT receives. A blank recipient becomes null (the server rejects an empty string). */
export function toInput(form: AlertForm): AlertSettingsInput {
  const recipient = cleanRecipient(form.recipient);
  return {
    notifyOnDown: form.notifyOnDown,
    notifyOnRecovery: form.notifyOnRecovery,
    notifyOnSlow: form.notifyOnSlow,
    cooldownMinutes: form.cooldownMinutes,
    recipientEmail: recipient === "" ? null : recipient,
  };
}

/** True when saving would change something (compares what would be sent with what is saved). */
export function isDirty(form: AlertForm, saved: AlertSettings): boolean {
  const next = toInput(form);
  return (
    next.notifyOnDown !== saved.notifyOnDown ||
    next.notifyOnRecovery !== saved.notifyOnRecovery ||
    next.notifyOnSlow !== saved.notifyOnSlow ||
    next.cooldownMinutes !== saved.cooldownMinutes ||
    next.recipientEmail !== saved.recipientEmail
  );
}

/** Blank is fine (it means "my account email"). Anything else must look like an address. */
export function validateRecipient(value: string): string | null {
  return value.trim() === "" ? null : validateEmail(value);
}

/** The second line of a history row: what happened to this notification, in words. */
export function describeNotification(n: NotificationItem): string {
  switch (n.status) {
    case "SENT":
      return `Sent to ${n.recipient}`;
    case "QUEUED":
      return n.attempts === 0
        ? "Waiting to be sent"
        : `Retrying: attempt ${n.attempts} failed. ${n.error ?? ""}`.trim();
    case "FAILED":
      return `${n.error ?? "Could not be sent."} Gave up after ${n.attempts} ${n.attempts === 1 ? "attempt" : "attempts"}.`;
    case "SUPPRESSED":
      return n.note ?? "Not sent.";
  }
}