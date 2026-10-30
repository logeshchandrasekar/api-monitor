import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled UI error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
          The page hit an unexpected problem. Reloading usually fixes it. Your monitors keep running
          either way.
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-w-xl overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-red-700 dark:bg-slate-900 dark:text-red-300">
            {this.state.error.message}
          </pre>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Reload page
          </button>
          <a
            href="/"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }
}
