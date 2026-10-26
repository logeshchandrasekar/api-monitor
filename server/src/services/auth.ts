import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/errors.js";

const COST = env.NODE_ENV === "test" ? 4 : 12;
// Compared against when the email is unknown, so timing does not reveal which emails exist
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", COST);

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  plan: true,
  createdAt: true,
} as const;

export const hashPassword = (password: string) => bcrypt.hash(password, COST);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && e.code === "P2002";
}

const emailTaken = () =>
  new AppError(409, "EMAIL_TAKEN", "An account with this email already exists.");

export async function registerUser(input: { name: string; email: string; password: string }) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) throw emailTaken();

  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: publicUserSelect,
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw emailTaken(); // lost a race with a parallel signup
    throw e;
  }
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Incorrect email or password.");
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan,
    createdAt: user.createdAt,
  };
}
