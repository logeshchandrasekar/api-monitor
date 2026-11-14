import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { showsLanding } from "../utils/navigation";
import { hasSessionHint } from "../utils/sessionHint";
import { FullScreenError, FullScreenSpinner } from "./FullScreen";

/**
 * Wraps every page that needs a login. Anonymous visitors go to /login and come back here afterwards.
 * `publicHome` (the landing page) is shown instead at "/" for visitors who are simply not logged in: at once for
 * a first-time visitor, after the session check for someone who was logged in before (see utils/sessionHint.ts).
 */
export function ProtectedRoute({ publicHome }: { publicHome?: ReactNode }) {
  const { status, endedReason, retry, retrying } = useAuth();
  const location = useLocation();

  // A first-time visitor (no session hint) must not stare at a spinner just to see the landing page,
  // and the landing page needs no API, so it also shows while the server is unreachable.
  const landingNow =
    publicHome && !hasSessionHint() && showsLanding(location.pathname, endedReason);
  if (status === "loading") return landingNow ? publicHome : <FullScreenSpinner />;
  if (status === "error") {
    return landingNow ? publicHome : <FullScreenError onRetry={retry} retrying={retrying} />;
  }
  if (status === "anonymous") {
    if (publicHome && showsLanding(location.pathname, endedReason)) return publicHome;
    // After an explicit logout there is no page to return to; after expiry or a first visit there is
    const from = endedReason === "logout" ? undefined : location.pathname + location.search;
    return <Navigate to="/login" replace state={{ from, expired: endedReason === "expired" }} />;
  }
  return <Outlet />;
}
