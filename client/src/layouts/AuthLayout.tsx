import { ArrowLeft } from "lucide-react";
import { Link, Outlet } from "react-router";
import { Brand } from "../components/Brand";
import { SampleMonitorCard } from "../components/marketing/SampleMonitors";
import { ThemeToggle } from "../components/ThemeToggle";

/**
 * Split screen for sign in and register: a brand panel on the left (large screens only) and the form on the
 * right. The panel is always dark: the `dark` class re-scopes the colour tokens inside it, whatever the theme.
 */
export function AuthLayout() {
  return (
    <div className="grid min-h-dvh bg-canvas text-fg lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="dark relative hidden flex-col justify-between gap-10 overflow-hidden bg-canvas p-10 text-fg lg:flex">
        {/* A faint grid that fades out downwards */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--line)_1px,transparent_1px),linear-gradient(to_bottom,var(--line)_1px,transparent_1px)] bg-size-[44px_44px] opacity-60 mask-[radial-gradient(ellipse_at_top_left,black,transparent_75%)]"
        />
        <Link to="/" className="relative w-fit text-lg">
          <Brand />
        </Link>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-balance">
            Know when your API breaks. Before your users do.
          </h2>
          <p className="mt-4 text-fg-muted">
            Checks run on a schedule, incidents open on their own, and an email tells you when it
            matters.
          </p>
        </div>
        <SampleMonitorCard className="relative" />
      </aside>

      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between p-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-control px-2 py-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Home
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-4 pb-16">
          <div className="mb-8 text-xl lg:hidden">
            <Brand />
          </div>
          <div className="animate-rise w-full max-w-sm">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
