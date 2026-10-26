import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import dotenv from "dotenv";

export default function setup() {
  const testEnv = dotenv.parse(readFileSync(".env.test"));
  if (!testEnv.DATABASE_URL?.includes("_test")) {
    throw new Error("DATABASE_URL in .env.test must point at a *_test database");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, ...testEnv } });
}
