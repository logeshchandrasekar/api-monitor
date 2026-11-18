import { createContext } from "react";
import type { LoginInput, RegisterInput } from "../services/authApi";
import type { User } from "../types/api";

export type AuthStatus = "loading" | "authenticated" | "anonymous" | "error";

/** Why the last session ended: lets the login page say "session expired" and decide whether to return you to your page. */
export type SessionEndReason = "expired" | "logout";

export type AuthContextValue = {
  status: AuthStatus;
  user: User | null;
  endedReason: SessionEndReason | null;
  /** Retry the initial /auth/me after a network or server error. */
  retry: () => void;
  retrying: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  /** Deletes the account (after re-entering the password), then ends the session like a logout. */
  deleteAccount: (password: string) => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
