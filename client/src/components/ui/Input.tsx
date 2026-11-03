import { useId, type InputHTMLAttributes } from "react";
import { cn } from "../../utils/cn";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  /** Shown in red under the field; also marks it invalid for screen readers. */
  error?: string;
  hint?: string;
  /** Keeps the label for screen readers but hides it visually (compact rows). */
  hideLabel?: boolean;
};

export function Input({ label, error, hint, hideLabel, className, ...rest }: InputProps) {
  const id = useId();
  const messageId = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label
        htmlFor={id}
        className={cn("block text-sm font-medium", hideLabel ? "sr-only" : "mb-1.5")}
      >
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        className={cn(
          "h-10 w-full rounded-lg border bg-surface px-3 text-sm placeholder:text-fg-muted",
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
