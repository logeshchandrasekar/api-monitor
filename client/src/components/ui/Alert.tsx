import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type Tone = "error" | "info" | "success";

const tones: Record<Tone, string> = {
  error:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200",
  info: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200",
  success:
    "border-green-300 bg-green-50 text-green-900 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-200",
};

/** An inline message box, e.g. the server's error above a form. Errors are announced to screen readers immediately. */
export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-lg border px-3.5 py-2.5 text-sm", tones[tone], className)}
    >
      {children}
    </div>
  );
}
