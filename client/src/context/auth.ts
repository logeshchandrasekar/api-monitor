import { createContext } from "react";
import type { LoginInput, RegisterInput } from "../services/auth";
import type { User } from "../types/api";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /** Ends the session on the server and clears the cached data. Navigation is the caller's job (see ProfileMenu). */
  logout: () => Promise<void>;
  /** Re-asks the server who you are (used by the "Try again" button when /auth/me could not be reached) */
  retry: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
