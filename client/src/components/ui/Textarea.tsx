import { useId, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
  /** Extra controls shown on the label row, e.g. a "Format JSON" button. */
  action?: ReactNode;
};

export function Textarea({ label, error, hint, action, className, ...rest }: TextareaProps) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="block text-sm font-medium">
          {label}
        </label>
        {action}
      </div>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(
          "w-full rounded-lg border bg-surface px-3 py-2 text-sm placeholder:text-fg-muted",
          "disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-red-500" : "border-line",
          className,
        )}
        {...rest}
      />
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
