import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { FullScreenError, FullScreenSpinner } from "./FullScreen";

/** Wraps every page that needs a login. Anonymous visitors go to /login and come back here afterwards. */
export function ProtectedRoute() {
  const { status, endedReason, retry, retrying } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenSpinner />;
  if (status === "error") return <FullScreenError onRetry={retry} retrying={retrying} />;
  if (status === "anonymous") {
    // After an explicit logout there is no page to return to; after expiry or a first visit there is
    const from = endedReason === "logout" ? undefined : location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from, expired: endedReason === "expired" }} />;
  }
  return <Outlet />;
}
