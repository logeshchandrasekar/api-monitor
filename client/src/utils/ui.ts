/** Joins class names, skipping falsy values: cn("a", cond && "b") */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

/** Shared look of text inputs and selects */
export function fieldControl(hasError: boolean): string {
  return cn(
    "block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400",
    "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
    "dark:bg-slate-950 dark:placeholder:text-slate-600 dark:disabled:bg-slate-900",
    hasError ? "border-red-500 dark:border-red-400" : "border-slate-300 dark:border-slate-700",
    focusRing,
  );
}

/** Links an input to its error or hint text for screen readers */
export function describedBy(id: string, error?: string | null, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
