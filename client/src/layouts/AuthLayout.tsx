import { Outlet } from "react-router";
import { ThemeToggle } from "../components/ThemeToggle";
import { BrandIcon } from "./navItems";

/** Centered card layout for /login and /register */
export function AuthLayout() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-8 flex items-center gap-2 text-xl font-semibold">
        <BrandIcon className="size-7 text-indigo-600 dark:text-indigo-400" aria-hidden="true" />
        API Monitor
      </div>
      <main className="w-full max-w-sm">
        <Outlet />
      </main>
    </div>
  );
}
