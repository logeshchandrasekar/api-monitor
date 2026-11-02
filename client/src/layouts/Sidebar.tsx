import { Activity, LayoutDashboard, Settings, TriangleAlert, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router";
import { Brand } from "../components/Brand";
import { cn } from "../utils/cn";

type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };

// UX-1: only sections that exist are listed. Add Analytics when Phase 7 ships; a Status Page is not in the MVP.
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/monitors", label: "Monitors", icon: Activity },
  { to: "/incidents", label: "Incidents", icon: TriangleAlert },
  { to: "/settings", label: "Settings", icon: Settings },
];

/** The navigation list. Used in the fixed desktop sidebar and inside the mobile drawer (which passes onNavigate to close itself). */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-line px-5">
        <Brand />
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 p-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-subtle text-fg" : "text-fg-muted hover:bg-subtle hover:text-fg",
              )
            }
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
