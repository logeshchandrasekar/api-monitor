import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));
const name = z.string().trim().min(1, "Name is required").max(100, "Name is too long");

// bcrypt only uses the first 72 bytes, so longer passwords are rejected instead of silently truncated
const newPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .refine((v) => Buffer.byteLength(v, "utf8") <= 72, "Password must be 72 bytes or fewer");

export const registerSchema = z.object({ name, email, password: newPassword });

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, "Email is required"),
  password: z.string().min(1, "Password is required").max(128),
});

export const updateMeSchema = z.object({ name });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required").max(128),
  newPassword,
});
