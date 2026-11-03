import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError } from "../../services/api";
import type { MonitorInput, PlanLimits } from "../../types/api";
import { fieldErrorsFrom, getErrorMessage } from "../../utils/errors";
import {
  HTTP_METHODS,
  formatJson,
  mapServerFieldErrors,
  methodHasBody,
  defaultTimeoutSec,
  pruneBlankRows,
  toPayload,
  validateForm,
  type FormErrors,
  type HttpMethod,
  type MonitorFormValues,
} from "../../utils/monitorForm";
import { formatInterval } from "../../utils/time";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { Card } from "../ui/Card";
import { Checkbox } from "../ui/Checkbox";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { HeadersEditor } from "./HeadersEditor";

type Props = {
  initial: MonitorFormValues;
  limits: PlanLimits;
  submitLabel: string;
  cancelTo: string;
  onSubmit: (payload: MonitorInput) => void;
  pending: boolean;
  /** The error from the save request, if it failed. Field errors land under their fields; the rest in a banner. */
  error: unknown;
  /** Called when the person edits anything, so the page can clear the old server error. */
  onEdit?: () => void;
};

export function MonitorForm({
  initial,
  limits,
  submitLabel,
  cancelTo,
  onSubmit,
  pending,
  error,
  onEdit,
}: Props) {
  const [values, setValues] = useState(initial);
  const [clientErrors, setClientErrors] = useState<FormErrors>({});
  const formRef = useRef<HTMLFormElement>(null);

  // Errors from the server for the last save, shown until the person changes something
  const serverFields = useMemo(() => mapServerFieldErrors(fieldErrorsFrom(error)), [error]);
  const errors: FormErrors = { ...serverFields, ...clientErrors };
  const hasFieldErrors = Object.keys(serverFields).length > 0;
  const limitReached = error instanceof ApiError && error.code === "MONITOR_LIMIT_REACHED";

  function set<K extends keyof MonitorFormValues>(key: K, value: MonitorFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setClientErrors((e) => (key in e ? { ...e, [key]: "" } : e));
    onEdit?.();
  }

  function changeInterval(intervalSec: number) {
    setValues((v) => ({
      ...v,
      intervalSec,
      // Until the person chooses a timeout themselves it follows the interval, like the server's default
      timeoutSec: v.timeoutTouched ? v.timeoutSec : String(defaultTimeoutSec(intervalSec)),
    }));
    setClientErrors((e) => ({ ...e, intervalSec: "", timeoutSec: "" }));
    onEdit?.();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const cleaned = pruneBlankRows(values); // rows nobody filled in: removed, so header numbers match the screen
    if (cleaned.headers.length !== values.headers.length) setValues(cleaned);

    const found = validateForm(cleaned);
    setClientErrors(found);
    if (Object.keys(found).length > 0) {
      // Move keyboard and screen-reader focus to the first problem
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    onSubmit(toPayload(cleaned));
  }

  // A monitor saved on a different plan can have an interval the plan no longer offers: keep it visible instead of silently switching it
  const intervals = limits.allowedIntervalsSec.includes(values.intervalSec)
    ? limits.allowedIntervalsSec
    : [values.intervalSec, ...limits.allowedIntervalsSec];

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-6">
      {limitReached && (
        <Alert tone="error">
          <p className="font-medium">{(error as ApiError).message}</p>
          <p className="mt-1">
            Delete a monitor you no longer need from{" "}
            <Link className="underline" to="/monitors">
              your monitors
            </Link>
            , or upgrade your plan.
          </p>
        </Alert>
      )}
      {error !== null && error !== undefined && !limitReached && !hasFieldErrors && (
        <Alert tone="error">
          {getErrorMessage(error, "Could not save the monitor. Please try again.")}
        </Alert>
      )}
      {!limitReached && hasFieldErrors && (
        <Alert tone="error">Some fields need attention. They are marked below.</Alert>
      )}

      <Card title="What to check">
        <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div className="sm:col-span-2">
            <Input
              label="Name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              error={errors.name}
              placeholder="Production API"
              maxLength={100}
            />
          </div>
          <Select
            label="Method"
            value={values.method}
            onChange={(e) => set("method", e.target.value as HttpMethod)}
          >
            {HTTP_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
          <Input
            label="URL"
            type="url"
            inputMode="url"
            value={values.url}
            onChange={(e) => set("url", e.target.value)}
            error={errors.url}
            hint="Public http:// or https:// addresses only. Private and internal addresses are blocked."
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </Card>

      <Card title="Schedule and thresholds">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Check every"
            value={values.intervalSec}
            onChange={(e) => changeInterval(Number(e.target.value))}
            error={errors.intervalSec}
            hint={`Your ${limits.plan} plan allows checks every ${formatInterval(limits.minIntervalSec)} or slower.`}
          >
            {intervals.map((s) => (
              <option key={s} value={s}>
                {formatInterval(s)}
              </option>
            ))}
          </Select>
          <Input
            label="Expected status code"
            inputMode="numeric"
            value={values.expectedStatus}
            onChange={(e) => set("expectedStatus", e.target.value)}
            error={errors.expectedStatus}
            hint="Any other status counts as a failure."
          />
          <Input
            label="Timeout (seconds)"
            inputMode="decimal"
            value={values.timeoutSec}
            onChange={(e) => {
              setValues((v) => ({ ...v, timeoutTouched: true }));
              set("timeoutSec", e.target.value);
            }}
            error={errors.timeoutSec}
            hint="Must be shorter than the interval. 1 to 30 seconds."
          />
          <Input
            label="Slow response threshold (ms)"
            inputMode="numeric"
            value={values.responseThresholdMs}
            onChange={(e) => set("responseThresholdMs", e.target.value)}
            error={errors.responseThresholdMs}
            hint="Slower than this is reported as degraded."
          />
          <div className="sm:col-span-2">
            <Checkbox
              label="Follow redirects"
              hint="Treat a redirect as the final answer when this is off."
              checked={values.followRedirects}
              onChange={(e) => set("followRedirects", e.target.checked)}
            />
          </div>
        </div>
      </Card>

      <Card
        title="Request headers"
        description="Sensitive values such as Authorization are stored encrypted and never shown again."
      >
        <HeadersEditor
          rows={values.headers}
          errors={errors}
          onChange={(rows) => {
            setValues((v) => ({ ...v, headers: rows }));
            setClientErrors((e) =>
              Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith("headers"))),
            );
            onEdit?.();
          }}
        />
      </Card>

      {methodHasBody(values.method) && (
        <Card title="Request body">
          <Textarea
            label="JSON body"
            rows={8}
            className="font-mono"
            value={values.body}
            onChange={(e) => set("body", e.target.value)}
            error={errors.body}
            hint="Sent with every check. Must be valid JSON. Leave empty to send no body."
            spellCheck={false}
            action={
              <Button
                size="sm"
                variant="ghost"
                disabled={!values.body.trim()}
                onClick={() => {
                  const pretty = formatJson(values.body);
                  if (pretty === null)
                    setClientErrors((e) => ({ ...e, body: "The body must be valid JSON." }));
                  else set("body", pretty);
                }}
              >
                Format JSON
              </Button>
            }
          />
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink to={cancelTo} variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
