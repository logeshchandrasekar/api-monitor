import { createContext } from "react";

export type ThemePreference = "light" | "dark" | "system";

export interface ThemeContextValue {
  /** What the user chose (system = follow the OS) */
  preference: ThemePreference;
  /** What is actually applied right now */
  resolved: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
  /** Quick switch for the top-bar button: flips light and dark, and stores an explicit choice */
  toggle: () => void;
}

export const THEME_STORAGE_KEY = "am-theme";

export const ThemeContext = createContext<ThemeContextValue | null>(null);
