import { Activity } from "lucide-react";
import { APP_NAME } from "../config";

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-brand text-brand-fg">
        <Activity className="size-4" aria-hidden="true" />
      </span>
      {APP_NAME}
    </span>
  );
}
