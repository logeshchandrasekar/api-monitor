import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, setUnauthorizedHandler } from "../services/api";
import { authApi, type LoginInput, type RegisterInput } from "../services/authApi";
import { queryKeys } from "../services/queryKeys";
import type { User } from "../types/api";
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  type SessionEndReason,
} from "./authContext";

/**
 * Everything cached except the "auth" entry belongs to the person who was logged in.
 * It is dropped whenever the session changes, so the next user never sees the previous user's data.
 */
function dropUserData(queryClient: QueryClient) {
  const isUserData = (query: { queryKey: readonly unknown[] }) => query.queryKey[0] !== "auth";
  void queryClient.cancelQueries({ predicate: isUserData });
  queryClient.removeQueries({ predicate: isUserData });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [endedReason, setEndedReason] = useState<SessionEndReason | null>(null);

  const meQuery = useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<User | null> => {
      try {
        return (await authApi.me()).user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null; // "not logged in" is an answer, not an error
        throw error;
      }
    },
    staleTime: 5 * 60_000, // coming back to the tab after 5+ minutes re-checks the session
  });

  const startSession = useCallback(
    (user: User) => {
      dropUserData(queryClient);
      queryClient.setQueryData(queryKeys.me, user);
      setEndedReason(null);
    },
    [queryClient],
  );

  const endSession = useCallback(
    (reason: SessionEndReason) => {
      setEndedReason(reason);
      queryClient.setQueryData(queryKeys.me, null); // the route guards redirect to /login on this render
      dropUserData(queryClient);
    },
    [queryClient],
  );

  // A 401 from any request in the middle of a session: the cookie expired or was revoked
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!queryClient.getQueryData(queryKeys.me)) return; // already signed out: parallel requests can fail together
      endSession("expired");
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, endSession]);

  const login = useCallback(
    async (input: LoginInput) => {
      startSession((await authApi.login(input)).user);
    },
    [startSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      startSession((await authApi.register(input)).user);
    },
    [startSession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // 401 means the session was already gone, which is what we wanted. Anything else (network, 500) is shown to the person.
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    endSession("logout");
  }, [endSession]);

  const { data, isPending, isError, isFetching, refetch } = meQuery;
  const user = data ?? null;
  // A failed background re-check while we still hold a user does not log anyone out
  const status: AuthStatus = user
    ? "authenticated"
    : isPending
      ? "loading"
      : isError
        ? "error"
        : "anonymous";
  const retry = useCallback(() => void refetch(), [refetch]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, endedReason, retry, retrying: isFetching, login, register, logout }),
    [status, user, endedReason, retry, isFetching, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
