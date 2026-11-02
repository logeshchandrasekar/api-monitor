import { useEffect, useState } from "react";
import { Outlet } from "react-router";
import { Drawer } from "./Drawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);

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

      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Sidebar onNavigate={() => setDrawerOpen(false)} />
      </Drawer>

      <div className="lg:pl-64">
        <TopBar onOpenMenu={() => setDrawerOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
