import { useMutation } from "@tanstack/react-query";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { useCurrentUser, useAuth } from "../hooks/useAuth";
import { getErrorMessage } from "../utils/errors";

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function ProfileMenu() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onError: (error) => toast.error(getErrorMessage(error, "Could not log out. Please try again.")),
  });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg p-1.5 pr-2 hover:bg-subtle"
      >
        <span className="grid size-8 place-items-center rounded-full bg-brand text-xs font-semibold text-brand-fg">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">{user.name}</span>
        <ChevronDown className="size-4 text-fg-muted" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl border border-line bg-surface p-1.5 shadow-lg"
        >
          <div className="border-b border-line px-3 py-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-fg-muted">{user.email}</p>
          </div>
          <Link
            role="menuitem"
            to="/settings"
            onClick={() => setOpen(false)}
            className="mt-1.5 flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-subtle"
          >
            <Settings className="size-4 text-fg-muted" aria-hidden="true" />
            Settings
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-subtle disabled:opacity-60"
          >
            <LogOut className="size-4 text-fg-muted" aria-hidden="true" />
            {logoutMutation.isPending ? "Logging out..." : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
