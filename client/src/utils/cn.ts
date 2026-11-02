/** Joins class names, skipping falsy values: cn("a", cond && "b"). Only ADD classes with it; it does not resolve conflicts. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
