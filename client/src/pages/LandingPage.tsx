import {
  Activity,
  BellRing,
  ChartLine,
  History,
  LockKeyhole,
  Play,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { Brand } from "../components/Brand";
import { SampleMonitorCard } from "../components/marketing/SampleMonitors";
import { ThemeToggle } from "../components/ThemeToggle";
import { ButtonLink } from "../components/ui/ButtonLink";
import { useAuth } from "../hooks/useAuth";
import { APP_NAME } from "../config";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

const STEPS = [
  {
    title: "Add an endpoint",
    text: "Enter the URL, pick the method, add headers or a body, and say which status code means healthy.",
  },
  {
    title: "It is checked on a schedule",
    text: "Every result is stored: status code, response time and any error, so you can look back at what happened.",
  },
  {
    title: "You hear about it when it matters",
    text: "After three failed checks in a row an incident opens and you get an email. When the API recovers, you get that too.",
  },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Activity,
    title: "Status at a glance",
    text: "A 24-hour strip per monitor shows every hour at once. One failed check is visible even before the monitor counts as down.",
  },
  {
    icon: ChartLine,
    title: "Response-time charts",
    text: "24 hours, 7 days or 30 days, with the average, the p95 and your slow threshold drawn in.",
  },
  {
    icon: History,
    title: "Incidents that run themselves",
    text: "An incident opens when a monitor goes down or degrades, closes when it recovers, and keeps its duration.",
  },
  {
    icon: BellRing,
    title: "Email alerts without the spam",
    text: "Alerts fire on state changes, not on every failed check. A cooldown stops a flapping API from filling your inbox.",
  },
  {
    icon: Play,
    title: "Check now",
    text: "Test an endpoint on demand while you debug. Manual checks never change a status or skew your uptime.",
  },
  {
    icon: LockKeyhole,
    title: "Secrets stay secret",
    text: "Headers and bodies are encrypted at rest and never shown back. Private and internal addresses are blocked.",
  },
];

const YEAR = new Date().getFullYear(); // read once, not on every render

const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

/**
 * The public home page: shown at "/" to visitors who are not logged in, and always at "/welcome".
 * A logged-in visitor (who can only get here through /welcome) sees "Open dashboard" instead of the sign-up prompts.
 */
export function LandingPage() {
  useDocumentTitle("Know when your API breaks");
  const signedIn = useAuth().status === "authenticated";

  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link to="/" className="mr-auto">
            <Brand />
          </Link>
          <nav aria-label="Page sections" className="hidden items-center gap-6 text-sm sm:flex">
            <a href="#how" className="text-fg-muted transition-colors hover:text-fg">
              How it works
            </a>
            <a href="#features" className="text-fg-muted transition-colors hover:text-fg">
              Features
            </a>
          </nav>
          <ThemeToggle />
          {signedIn ? (
            <ButtonLink to="/" size="sm">
              Open dashboard
            </ButtonLink>
          ) : (
            <>
              {/* Wrapped, because a `hidden` class on the link itself would lose to the button's own display class */}
              <span className="hidden sm:inline-flex">
                <ButtonLink to="/login" variant="ghost" size="sm">
                  Sign in
                </ButtonLink>
              </span>
              <ButtonLink to="/register" size="sm">
                Get started
              </ButtonLink>
            </>
          )}
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--line)_1px,transparent_1px),linear-gradient(to_bottom,var(--line)_1px,transparent_1px)] bg-size-[56px_56px] opacity-50 mask-[radial-gradient(ellipse_at_top,black,transparent_70%)]"
          />
          <div className="relative mx-auto max-w-6xl px-4 pt-16 text-center sm:px-6 sm:pt-24">
            <h1
              className="animate-rise mx-auto max-w-3xl text-4xl font-semibold text-balance sm:text-hero"
              style={delay(0)}
            >
              Know when your API breaks. Before your users do.
            </h1>
            <p
              className="animate-rise mx-auto mt-5 max-w-2xl text-lg text-fg-muted text-balance"
              style={delay(80)}
            >
              {APP_NAME} checks your endpoints on a schedule, shows uptime and response time at a
              glance, opens an incident when something fails, and emails you when it does.
            </p>
            <div
              className="animate-rise mt-8 flex flex-wrap items-center justify-center gap-3"
              style={delay(160)}
            >
              {signedIn ? (
                <ButtonLink to="/" size="lg">
                  Open dashboard
                </ButtonLink>
              ) : (
                <ButtonLink to="/register" size="lg">
                  Start monitoring
                </ButtonLink>
              )}
              <a
                href="#how"
                className="inline-flex h-12 items-center rounded-control px-5 text-base font-medium text-fg-muted transition-colors hover:bg-subtle hover:text-fg"
              >
                See how it works
              </a>
            </div>
            <p className="animate-rise mt-4 text-sm text-fg-muted" style={delay(220)}>
              The free plan covers 5 monitors, checked every 5 minutes.
            </p>

            <div className="animate-rise mx-auto mt-14 max-w-4xl text-left" style={delay(300)}>
              <SampleMonitorCard className="shadow-xl" />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <h2 className="text-3xl font-semibold">How it works</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="rounded-xl border border-line bg-surface p-6">
                <span className="data grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand-soft-ink">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-fg-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
            <h2 className="text-3xl font-semibold">
              Built for one developer, ready for production
            </h2>
            <p className="mt-3 max-w-2xl text-fg-muted">
              The things you need to know your API is healthy, and nothing you have to configure for
              an hour first.
            </p>
            <ul className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title}>
                  <span className="grid size-10 place-items-center rounded-control bg-brand-soft text-brand-soft-ink">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-fg-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final call to action: only for people who have no account yet */}
        {!signedIn && (
          <section className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold text-balance">
              Start monitoring your first API in a minute.
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ButtonLink to="/register" size="lg">
                Create a free account
              </ButtonLink>
              <ButtonLink to="/login" variant="secondary" size="lg">
                Sign in
              </ButtonLink>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-fg-muted sm:px-6">
          <span>
            © {YEAR} {APP_NAME}
          </span>
          {!signedIn && (
            <span className="flex gap-5">
              <Link to="/login" className="hover:text-fg">
                Sign in
              </Link>
              <Link to="/register" className="hover:text-fg">
                Create an account
              </Link>
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
