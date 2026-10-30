import { LoaderCircle } from "lucide-react";
import { cn } from "../utils/ui";

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 animate-spin", className)} aria-hidden="true" />;
}
