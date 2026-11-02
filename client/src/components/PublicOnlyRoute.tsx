import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { safeRedirect } from "../utils/navigation";
import { FullScreenError, FullScreenSpinner } from "./FullScreen";

/**
 * Login and register. Someone who is already logged in is sent on. Because this also fires the moment a
 * login succeeds, it is the one place that decides where you land afterwards: back where you came from.
 */
export function PublicOnlyRoute() {
  const { status, retry, retrying } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenSpinner />;
  if (status === "error") return <FullScreenError onRetry={retry} retrying={retrying} />;
  if (status === "authenticated") {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={safeRedirect(from)} replace />;
  }
  return <Outlet />;
}
