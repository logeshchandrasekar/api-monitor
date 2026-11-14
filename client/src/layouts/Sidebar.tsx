import {
  Activity,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
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

/**
 * The navigation list. Used in the fixed desktop sidebar and inside the mobile drawer.
 * - `collapsed`: icons only (labels stay for screen readers and show as a tooltip).
 * - `onToggleCollapse`: pass it to show the collapse button (desktop only; the drawer does not pass it).
 * - `onNavigate`: the drawer passes it to close itself after a click.
 */
export function Sidebar({
  collapsed = false,
  onToggleCollapse,
  onNavigate,
}: {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-14 items-center border-b border-line",
          collapsed ? "justify-center px-0" : "px-5",
        )}
      >
        <Brand compact={collapsed} />
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 p-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-control py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center px-0" : "px-3",
                isActive
                  ? "bg-brand-soft text-brand-soft-ink"
                  : "text-fg-muted hover:bg-subtle hover:text-fg",
              )
            }
          >
            <Icon
              className="size-5 shrink-0 transition-transform duration-150 group-hover:scale-110"
              aria-hidden="true"
            />
            <span className={collapsed ? "sr-only" : undefined}>{label}</span>
          </NavLink>
        ))}
      </nav>

      {onToggleCollapse && (
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-control py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-subtle hover:text-fg",
              collapsed ? "justify-center px-0" : "px-3",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-5 shrink-0" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="size-5 shrink-0" aria-hidden="true" />
            )}
            {!collapsed && "Collapse"}
          </button>
        </div>
      )}
    </div>
  );
}
