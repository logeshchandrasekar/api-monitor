import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { useSidebarCollapsed } from "../hooks/useSidebarCollapsed";
import { cn } from "../utils/cn";
import { Drawer } from "./Drawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const { pathname } = useLocation();

  // If the window grows past the desktop breakpoint while the drawer is open, close it (the desktop sidebar takes over)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (query.matches) setDrawerOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 hidden border-r border-line bg-surface transition-[width] duration-200 ease-out-quint lg:block",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </aside>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Sidebar onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      <div
        className={cn(
          "transition-[padding] duration-200 ease-out-quint",
          collapsed ? "lg:pl-16" : "lg:pl-64",
        )}
      >
        <TopBar onOpenMenu={() => setDrawerOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Keyed by path so each page fades in; the page itself is a fresh mount anyway on a route change */}
          <div key={pathname} className="animate-rise">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
