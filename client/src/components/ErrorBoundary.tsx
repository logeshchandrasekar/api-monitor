import { Component, type ErrorInfo, type ReactNode } from "react";

type State = { error: Error | null };

/**
 * Catches errors thrown while RENDERING (a bug in a component). It does not catch errors in event handlers
 * or in async code: those are handled where they happen (query errors, mutation errors, toasts).
 * The fallback uses only plain Tailwind classes, so it still works if a provider is what crashed.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-fg">
        <div className="w-full max-w-md rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold">Something broke</h1>
          <p className="mt-2 text-sm text-fg-muted">
            An unexpected error stopped this page from loading. Reloading usually fixes it.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 overflow-auto rounded-lg bg-subtle p-3 text-left text-xs">
              {error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 h-10 rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-hover"
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
