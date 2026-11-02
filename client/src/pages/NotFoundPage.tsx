import { Link } from "react-router";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-6 text-center text-fg">
      <div>
        <p className="text-6xl font-semibold tracking-tight text-fg-muted">404</p>
        <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-sm text-fg-muted">That address does not exist, or it moved.</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-fg hover:bg-brand-hover"
        >
          Go to the dashboard
        </Link>
      </div>
    </div>
  );
}
