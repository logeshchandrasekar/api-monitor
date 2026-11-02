// Client-side checks are a convenience (instant feedback). The server is the authority and its errors are shown too.

/** Keep in sync with the server's auth schema (server/src/schemas/auth.ts). */
export const MAX_NAME_LENGTH = 100;
export const PASSWORD_MIN_LENGTH = 8;
export const MIN_PASSWORD_LENGTH = PASSWORD_MIN_LENGTH;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(value: string): string | null {
  const email = value.trim();

  if (!email) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";

  return null;
}

export function validateName(value: string): string | null {
  const name = value.trim();

  if (!name) return "Enter your name.";
  if (name.length > MAX_NAME_LENGTH) return "Name is too long.";

  return null;
}

export function validateNewPassword(value: string): string | null {
  if (!value) return "Choose a password.";
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (value.length > 128) return "Password is too long.";

  // bcrypt only uses the first 72 bytes. Match the server's UTF-8 byte limit.
  if (new TextEncoder().encode(value).length > 72) {
    return "Password must be 72 bytes or fewer.";
  }

  return null;
}

export function validateConfirmation(password: string, confirmation: string): string | null {
  if (!confirmation) return "Please confirm your password.";
  if (password !== confirmation) return "Passwords do not match.";

  return null;
}
