import type { SessionEndReason } from "../context/authContext";

/**
 * Where to go after login. Only same-site absolute paths are accepted, so a crafted
 * state or link can never send someone to another site, and never back to /login or /register.
 */
export function safeRedirect(from: unknown, fallback = "/"): string {
  if (typeof from !== "string") return fallback;
  if (!from.startsWith("/") || from.startsWith("//")) return fallback;

  const path = from.split(/[?#]/)[0];

  if (path === "/login" || path === "/register") return fallback;

  return from;
}

/** Extract and validate the remembered in-app path from navigation state. */
export function getReturnPath(state: unknown): string {
  if (!state || typeof state !== "object") return "/";

  const from = (state as { from?: unknown }).from;

  return safeRedirect(from);
}

/**
 * Whether a visitor who is not logged in sees the public landing page instead of being sent to sign in.
 * Only the home address "/" does, and only for a first visit or a logout: when a session expired in the middle
 * of work, the sign-in page with its "session expired" message is the right place.
 */
export function showsLanding(pathname: string, endedReason: SessionEndReason | null): boolean {
  return pathname === "/" && endedReason !== "expired";
}
