import { Outlet } from "react-router";
import { Brand } from "../components/Brand";
import { ThemeToggle } from "../components/ThemeToggle";

/** Centered card for login and register. */
export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-fg">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
        <div className="mb-6 text-xl">
          <Brand />
        </div>
        <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
