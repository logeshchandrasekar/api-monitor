/**
 * Where to go after logging in: the page the guard remembered in the router state, or "/".
 * Only in-app paths are accepted (no "//evil.com", no full URLs), and never the login/register pages themselves.
 */
export function getReturnPath(state: unknown): string {
  if (state && typeof state === "object" && "from" in state) {
    const from = (state as { from: unknown }).from;
    if (
      typeof from === "string" &&
      from.startsWith("/") &&
      !from.startsWith("//") &&
      !from.startsWith("/login") &&
      !from.startsWith("/register")
    ) {
      return from;
    }
  }
  return "/";
}
