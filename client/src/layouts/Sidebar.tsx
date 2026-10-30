import { NavLink } from "react-router";
import { useAuth } from "../hooks/useAuth";
import type { Plan } from "../types/api";
import { cn, focusRing } from "../utils/ui";
import { BrandIcon, navItems } from "./navItems";

const PLAN_LABEL: Record<Plan, string> = { FREE: "Free", PRO: "Pro", TEAM: "Team" };

/** The navigation column. `onNavigate` closes the mobile drawer when a link is clicked. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
        <BrandIcon className="size-6 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        <span className="text-base font-semibold">API Monitor</span>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 p-3">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                focusRing,
              )
            }
          >
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      {user && (
        <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {PLAN_LABEL[user.plan]} plan
        </div>
      )}
    </div>
  );
}
