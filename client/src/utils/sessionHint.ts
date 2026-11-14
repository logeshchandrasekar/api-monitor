const KEY = "am-session-hint";

/**
 * A hint (not proof) that this browser has a logged-in session: set on login and when /auth/me answers with a user,
 * cleared on logout, expiry and when /auth/me answers "nobody". The route guard uses it to decide whether the home
 * address may show the landing page straight away (no hint: a first-time visitor) or must wait for the session check
 * (hint: a returning user, who is about to see the dashboard). A wrong hint only costs a one-off flash, never access:
 * the server still decides who is logged in.
 */
export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: behave like a first-time visitor
  }
}

export function setSessionHint(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore: the hint just is not remembered */
  }
}
