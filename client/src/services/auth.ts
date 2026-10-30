import type { User } from "../types/api";
import { api, ApiError } from "./api";

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  name: string;
}

/** The current user, or null when nobody is logged in (a 401 here is a normal answer, not an error). */
export async function fetchMe(): Promise<User | null> {
  try {
    const { user } = await api.get<{ user: User }>("/auth/me", { skipUnauthorizedHandler: true });
    return user;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

export async function loginRequest(input: LoginInput): Promise<User> {
  const { user } = await api.post<{ user: User }>("/auth/login", input, {
    skipUnauthorizedHandler: true,
  });
  return user;
}

export async function registerRequest(input: RegisterInput): Promise<User> {
  const { user } = await api.post<{ user: User }>("/auth/register", input, {
    skipUnauthorizedHandler: true,
  });
  return user;
}

export async function logoutRequest(): Promise<void> {
  await api.post("/auth/logout", undefined, { skipUnauthorizedHandler: true });
}
