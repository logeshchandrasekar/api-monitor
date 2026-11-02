import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "../context/authContext";
import type { User } from "../types/api";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** For pages behind ProtectedRoute, where a user is guaranteed. Throws if used anywhere else. */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("useCurrentUser must be used on a protected page");
  return user;
}
