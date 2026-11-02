import { Menu } from "lucide-react";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";
import { ProfileMenu } from "./ProfileMenu";

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="-ml-2 rounded-lg p-2 text-fg-muted hover:bg-subtle hover:text-fg lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <div className="lg:hidden">
        <Brand />
      </div>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  );
}
