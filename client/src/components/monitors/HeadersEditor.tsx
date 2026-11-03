import { KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  isSensitiveHeader,
  MAX_HEADERS,
  newHeaderRow,
  type FormErrors,
  type HeaderRow,
} from "../../utils/monitorForm";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

type Props = {
  rows: HeaderRow[];
  errors: FormErrors;
  onChange: (rows: HeaderRow[]) => void;
};

/**
 * Key/value rows for request headers (SEC-2). A saved sensitive value (Authorization, tokens, cookies ...) is never sent
 * back by the API, so such a row shows a mask with "Replace". Leaving it alone saves { name, keepExisting: true }.
 */
export function HeadersEditor({ rows, errors, onChange }: Props) {
  const update = (key: string, patch: Partial<HeaderRow>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addBearer = () => {
    if (rows.some((r) => r.name.trim().toLowerCase() === "authorization")) {
      toast.info("There is already an Authorization header. Edit it, or use Replace.");
      return;
    }
    onChange([...rows, newHeaderRow({ name: "Authorization", value: "Bearer " })]);
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 && (
        <p className="text-sm text-fg-muted">
          No custom headers. API Monitor sends its own User-Agent; add headers such as Accept or an
          API key if the endpoint needs them.
        </p>
      )}

      {rows.map((row, i) => {
        const sensitive = isSensitiveHeader(row.name);
        const nameError = errors[`headers.${i}.name`];
        const valueError = errors[`headers.${i}.value`];
        return (
          <div
            key={row.key}
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-start"
          >
            <Input
              label={`Header ${i + 1} name`}
              hideLabel
              placeholder="Header name, e.g. Accept"
              value={row.name}
              disabled={row.kept} // renaming a saved secret would lose the link to its stored value
              onChange={(e) => update(row.key, { name: e.target.value })}
              error={nameError}
              autoComplete="off"
              spellCheck={false}
            />

            {row.kept ? (
              <div className="flex items-center gap-2">
                <Input
                  label={`Header ${i + 1} value`}
                  hideLabel
                  value="••••••••••••"
                  readOnly
                  disabled
                  hint="Saved. The value is hidden and stays as it is."
                  className="font-mono"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => update(row.key, { kept: false, value: "" })}
                >
                  Replace
                </Button>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    label={`Header ${i + 1} value`}
                    hideLabel
                    placeholder="Value"
                    type={sensitive ? "password" : "text"} // secrets are not shown on screen as you type them
                    value={row.value}
                    onChange={(e) => update(row.key, { value: e.target.value })}
                    error={valueError}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                {row.saved && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update(row.key, { kept: true, value: "" })}
                  >
                    Keep saved
                  </Button>
                )}
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove header ${row.name.trim() || i + 1}`}
              onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        );
      })}

      {errors.headers && <p className="text-sm text-red-600 dark:text-red-400">{errors.headers}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={rows.length >= MAX_HEADERS}
          onClick={() => onChange([...rows, newHeaderRow()])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add header
        </Button>
        <Button variant="ghost" size="sm" onClick={addBearer}>
          <KeyRound className="size-4" aria-hidden="true" />
          Add Bearer token
        </Button>
      </div>
    </div>
  );
}
