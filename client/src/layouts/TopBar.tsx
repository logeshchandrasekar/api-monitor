import { Menu } from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { focusRing, cn } from "../utils/ui";
import { ProfileMenu } from "./ProfileMenu";

export function TopBar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/80 px-4 backdrop-blur sm:px-6 dark:border-slate-800 dark:bg-slate-950/80">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800",
          focusRing,
        )}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  );
}
