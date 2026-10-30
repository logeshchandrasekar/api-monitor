import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { FullScreenError, FullScreenLoader } from "./FullScreenState";

/** Wraps every page that needs a logged-in user. */
export function ProtectedRoute() {
  const { status, retry } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "error") return <FullScreenError onRetry={retry} />;
  if (status === "unauthenticated") {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ from }} />; // PublicOnlyRoute reads this after login
  }
  return <Outlet />;
}
