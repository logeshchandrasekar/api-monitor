import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

type Tone = "error" | "info" | "success";

const tones: Record<Tone, string> = {
  error: "border-down/40 bg-down-soft text-down-ink",
  info: "border-brand-ink/30 bg-brand-soft text-brand-soft-ink",
  success: "border-healthy/40 bg-healthy-soft text-healthy-ink",
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
      className={cn("rounded-control border px-3.5 py-2.5 text-sm", tones[tone], className)}
    >
      {children}
    </div>
  );
}
