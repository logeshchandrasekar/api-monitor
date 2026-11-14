import { Activity } from "lucide-react";
import { APP_NAME } from "../config";

/** Logo mark plus name. `compact` keeps only the mark (the collapsed sidebar); the name stays for screen readers. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap font-semibold tracking-tight">
      <span className="grid size-8 shrink-0 place-items-center rounded-control bg-brand text-brand-fg">
        <Activity className="size-4" aria-hidden="true" />
      </span>
      <span className={compact ? "sr-only" : undefined}>{APP_NAME}</span>
    </span>
  );
}
