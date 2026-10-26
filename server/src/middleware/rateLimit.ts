import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

// Disabled under test unless a test opts in with RATE_LIMIT_TEST=1
const skip = () => env.NODE_ENV === "test" && process.env.RATE_LIMIT_TEST !== "1";

const handler = (_req: unknown, _res: unknown, next: (err?: unknown) => void) =>
  next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later."));

export const globalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  handler,
});

// Applied only to register/login. Successful requests are not counted.
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip,
  handler,
});
