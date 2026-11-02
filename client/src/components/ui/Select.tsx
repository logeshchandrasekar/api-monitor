import { useId, type SelectHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
};

/** A native <select>: <Select label="Method" value={v} onChange={...}><option value="GET">GET</option></Select> */
export function Select({ label, error, hint, className, children, ...rest }: SelectProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          "h-10 w-full rounded-lg border bg-surface px-3 text-sm",
          error ? "border-red-500" : "border-line",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
