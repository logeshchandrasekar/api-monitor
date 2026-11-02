import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";

/** Quick light/dark switch. The System option lives in Settings > Appearance. */
export function ThemeToggle() {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      aria-label={`Switch to ${next} theme`}
      className="rounded-lg p-2 text-fg-muted hover:bg-subtle hover:text-fg"
    >
      {resolved === "dark" ? (
        <Sun className="size-5" aria-hidden="true" />
      ) : (
        <Moon className="size-5" aria-hidden="true" />
      )}
    </button>
  );
}
