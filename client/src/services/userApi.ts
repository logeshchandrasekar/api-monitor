import type { PlanLimits } from "../types/api";
import { api } from "./api";

export type ChangePasswordInput = { currentPassword: string; newPassword: string };

export const usersApi = {
  getLimits: (signal?: AbortSignal) =>
    api<{ limits: PlanLimits }>("/users/me/limits", { signal }).then((r) => r.limits),
  updateName: (name: string) => api("/users/me", { method: "PATCH", body: { name } }),
  changePassword: (input: ChangePasswordInput) =>
    api("/users/me/password", { method: "POST", body: input }),
  /** Permanently deletes the account and everything in it. A wrong password is a 400 INVALID_PASSWORD (never 401). */
  deleteAccount: (password: string) => api("/users/me", { method: "DELETE", body: { password } }),
};
