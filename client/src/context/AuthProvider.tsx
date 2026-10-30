import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError, setUnauthorizedHandler } from "../services/api";
import { fetchMe, loginRequest, logoutRequest, registerRequest } from "../services/auth";
import { queryKeys } from "../utils/queryKeys";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: queryKeys.me,
    queryFn: fetchMe, // resolves to the user, or null on a 401
    retry: false, // the error screen has its own "Try again"
    staleTime: Infinity, // the session does not change by itself; we write it on login, logout and 401
    refetchOnWindowFocus: false,
  });

  /** Forget everything that belonged to the previous session (all cached server data except `me`) */
  const dropUserData = useCallback(() => {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
  }, [queryClient]);

  // A 401 from any normal API call means the session is gone: clear it. The route guard does the redirect.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!queryClient.getQueryData(queryKeys.me)) return; // already logged out: several calls can fail at once
      dropUserData();
      queryClient.setQueryData(queryKeys.me, null);
      toast.info("Your session has expired. Please log in again.");
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient, dropUserData]);

  const login = useCallback<AuthContextValue["login"]>(
    async (input) => {
      const user = await loginRequest(input);
      dropUserData(); // never show a previous account's cached data
      queryClient.setQueryData(queryKeys.me, user);
    },
    [queryClient, dropUserData],
  );

  const register = useCallback<AuthContextValue["register"]>(
    async (input) => {
      const user = await registerRequest(input); // registering also logs you in (the server sets the cookie)
      dropUserData();
      queryClient.setQueryData(queryKeys.me, user);
    },
    [queryClient, dropUserData],
  );

  const logout = useCallback<AuthContextValue["logout"]>(async () => {
    try {
      await logoutRequest();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err; // a 401 just means "already logged out"
    }
    dropUserData();
    queryClient.setQueryData(queryKeys.me, null);
  }, [queryClient, dropUserData]);

  const retry = useCallback(() => {
    void me.refetch();
  }, [me]);

  const user = me.data ?? null;
  let status: AuthStatus;
  if (user) status = "authenticated";
  else if (me.isPending || (me.isError && me.isFetching))
    status = "loading"; // includes a retry in progress
  else if (me.isError) status = "error";
  else status = "unauthenticated";

  const value = useMemo<AuthContextValue>(
    () => ({ user, status, login, register, logout, retry }),
    [user, status, login, register, logout, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
