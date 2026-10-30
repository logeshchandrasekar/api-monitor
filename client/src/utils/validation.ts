// Client-side checks are for speed and friendliness only. The server validates everything again.
// Keep MIN_PASSWORD_LENGTH in step with the register schema in server/src/schemas/auth.ts.
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NAME_LENGTH = 80;

export function validateName(value: string): string | null {
  const name = value.trim();
  if (!name) return "Enter your name.";
  if (name.length > MAX_NAME_LENGTH) return `Name must be at most ${MAX_NAME_LENGTH} characters.`;
  return null;
}

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address.";
  return null;
}

export function validateNewPassword(value: string): string | null {
  if (!value) return "Enter a password.";
  if (value.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return null;
}

export function validateConfirmation(password: string, confirmation: string): string | null {
  if (!confirmation) return "Repeat the password.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}
