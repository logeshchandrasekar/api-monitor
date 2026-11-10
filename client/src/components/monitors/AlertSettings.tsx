import { Mail, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAlertSettings, useSaveAlertSettings, useSendTestEmail } from "../../hooks/useAlerts";
import { useCurrentUser } from "../../hooks/useAuth";
import {
  cooldownOptions,
  formatCooldown,
  formFromSettings,
  isDirty,
  toInput,
  validateRecipient,
  type AlertForm,
} from "../../utils/alerts";
import { fieldErrorsFrom, getErrorMessage } from "../../utils/errors";
import { ErrorState } from "../ErrorState";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";

/**
 * Who gets emailed, and when. Alerts fire when an incident starts and when it ends, never for a single
 * failed check; the cooldown stops a flapping monitor from filling an inbox.
 */
export function AlertSettings({ monitorId }: { monitorId: string }) {
  const settings = useAlertSettings(monitorId);
  const save = useSaveAlertSettings(monitorId);
  const test = useSendTestEmail(monitorId);
  const account = useCurrentUser();

  // `draft` is null until the person changes something, so the form always shows the saved rule otherwise
  const [draft, setDraft] = useState<AlertForm | null>(null);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  if (settings.isPending) {
    return (
      <Card title="Alerts">
        <div aria-busy="true" className="space-y-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-10 w-full max-w-sm" />
        </div>
      </Card>
    );
  }

  if (settings.isError) {
    return (
      <Card title="Alerts">
        <ErrorState
          title="Could not load the alert settings"
          error={settings.error}
          onRetry={() => void settings.refetch()}
          retrying={settings.isFetching}
        />
      </Card>
    );
  }

  const saved = settings.data;
  const form = draft ?? formFromSettings(saved);
  const dirty = draft !== null && isDirty(draft, saved);
  const change = (patch: Partial<AlertForm>) => setDraft({ ...form, ...patch });
  const serverFieldErrors = fieldErrorsFrom(save.error);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateRecipient(form.recipient);
    setRecipientError(problem);
    if (problem) return;
    save.mutate(toInput(form), { onSuccess: () => setDraft(null) });
  };

  return (
    <Card
      title="Alerts"
      description="You get an email when an incident starts and when it ends, never for a single failed check."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-3">
          <Checkbox
            label="Notify me when this API goes down"
            checked={form.notifyOnDown}
            onChange={(e) => change({ notifyOnDown: e.target.checked })}
          />
          <Checkbox
            label="Notify me when it recovers"
            hint="Only sent if an alert was sent for that incident."
            checked={form.notifyOnRecovery}
            onChange={(e) => change({ notifyOnRecovery: e.target.checked })}
          />
          <Checkbox
            label="Notify me when the response time is high"
            checked={form.notifyOnSlow}
            onChange={(e) => change({ notifyOnSlow: e.target.checked })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Cooldown"
            hint="At most one down alert and one slow alert per this period."
            value={form.cooldownMinutes}
            onChange={(e) => change({ cooldownMinutes: Number(e.target.value) })}
            error={serverFieldErrors.cooldownMinutes}
          >
            {cooldownOptions(form.cooldownMinutes).map((m) => (
              <option key={m} value={m}>
                {formatCooldown(m)}
              </option>
            ))}
          </Select>

          <Input
            label="Send alerts to"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder={account.email}
            hint={`Leave empty to use your account email (${account.email}).`}
            value={form.recipient}
            onChange={(e) => {
              setRecipientError(null);
              change({ recipient: e.target.value });
            }}
            error={recipientError ?? serverFieldErrors.recipientEmail}
          />
        </div>

        {save.isError && Object.keys(serverFieldErrors).length === 0 && (
          <Alert tone="error">{getErrorMessage(save.error, "Could not save the settings.")}</Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={save.isPending} disabled={!dirty}>
            {!save.isPending && <Save className="size-4" aria-hidden="true" />}
            Save settings
          </Button>
          <Button
            variant="secondary"
            onClick={() => test.mutate()}
            loading={test.isPending}
            disabled={dirty}
            title={
              dirty ? "Save your changes first: the test goes to the saved address." : undefined
            }
          >
            {!test.isPending && <Mail className="size-4" aria-hidden="true" />}
            Send test email
          </Button>
          <p className="text-sm text-fg-muted">
            Test goes to <span className="font-medium text-fg">{saved.effectiveRecipient}</span>
          </p>
        </div>
      </form>
    </Card>
  );
}