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
