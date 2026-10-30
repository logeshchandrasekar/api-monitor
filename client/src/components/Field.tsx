import type { ReactNode } from "react";
import { cn } from "../utils/ui";

export interface FieldProps {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  className?: string;
  children: ReactNode;
}

/** Label + control + error/hint text. Input and Select are built on it. */
export function Field({ id, label, error, hint, className, children }: FieldProps) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-down">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={cn("mt-1.5 text-sm text-slate-500 dark:text-slate-400")}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
