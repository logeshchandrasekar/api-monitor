import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { AuthContext, type AuthContextValue } from "../context/authContext";
import type { User } from "../types/api";

export const testUser: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Test User",
  email: "test@example.com",
  plan: "FREE",
  createdAt: "2026-01-01T00:00:00.000Z",
};

/** A logged-in auth context whose functions are stubs a test can replace. */
export function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: "authenticated",
    user: testUser,
    endedReason: null,
    retry: () => {},
    retrying: false,
    login: async () => {},
    register: async () => {},
    logout: async () => {},
    deleteAccount: async () => {},
    ...overrides,
  };
}

/** Renders inside the same providers the real app has: React Query, a router and the auth context. */
export function renderApp(
  ui: ReactElement,
  options: {
    route?: string | { pathname: string; state?: unknown };
    auth?: Partial<AuthContextValue>;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={authValue(options.auth)}>
        <MemoryRouter initialEntries={[options.route ?? "/"]}>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
