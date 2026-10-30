import {
  Activity,
  Globe,
  LayoutDashboard,
  Settings,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only (the dashboard lives at "/", which would otherwise be active on every page) */
  end?: boolean;
}

// UX-1: only sections that exist are listed. Analytics and Status Page stay out until they are built.
export const navItems: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/monitors", label: "Monitors", icon: Globe },
  { to: "/incidents", label: "Incidents", icon: TriangleAlert },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const BrandIcon = Activity;
