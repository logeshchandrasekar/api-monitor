import { api } from "./api";

// If the settings endpoints use other field names, this is the only file to change.
export async function updateName(name: string): Promise<void> {
  await api.patch("/users/me", { name });
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  await api.post("/users/me/password", input);
}
