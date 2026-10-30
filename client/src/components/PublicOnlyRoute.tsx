import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { getReturnPath } from "../utils/navigation";
import { FullScreenError, FullScreenLoader } from "./FullScreenState";

/** Wraps /login and /register: a logged-in user has no business here. */
export function PublicOnlyRoute() {
  const { status, retry } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "error") return <FullScreenError onRetry={retry} />;
  if (status === "authenticated") return <Navigate to={getReturnPath(location.state)} replace />;
  return <Outlet />;
}
