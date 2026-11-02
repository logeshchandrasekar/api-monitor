import type { User } from "../types/api";
import { api } from "./api";

export type LoginInput = { email: string; password: string };
export type RegisterInput = { name: string; email: string; password: string };

// A 401 from any of these is an ordinary answer, not "session expired", hence skipUnauthorizedHandler.
export const authApi = {
  me: () => api<{ user: User }>("/auth/me", { skipUnauthorizedHandler: true }),
  login: (input: LoginInput) =>
    api<{ user: User }>("/auth/login", {
      method: "POST",
      body: input,
      skipUnauthorizedHandler: true,
    }),
  register: (input: RegisterInput) =>
    api<{ user: User }>("/auth/register", {
      method: "POST",
      body: input,
      skipUnauthorizedHandler: true,
    }),
  logout: () => api("/auth/logout", { method: "POST", skipUnauthorizedHandler: true }),
};
