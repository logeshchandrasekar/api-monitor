import { api } from "./api";

export type ChangePasswordInput = { currentPassword: string; newPassword: string };

export const usersApi = {
  updateName: (name: string) => api("/users/me", { method: "PATCH", body: { name } }),
  changePassword: (input: ChangePasswordInput) =>
    api("/users/me/password", { method: "POST", body: input }),
};
