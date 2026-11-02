import { createContext } from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export type ThemeContextValue = {
  /** What the user chose. "system" follows the operating system. */
  preference: ThemePreference;
  /** What is actually applied right now. */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

export const ThemeContext = createContext<ThemeContextValue | null>(null);
