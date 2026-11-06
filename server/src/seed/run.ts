// Entry point of `npm run seed:demo`. Kept apart from seedDemo.ts so tests can import the function without running it.
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from "./seedDemo.js";

if (env.NODE_ENV === "production") {
  console.error("Refusing to seed demo data with NODE_ENV=production.");
  process.exit(1);
}

const started = Date.now();
try {
  const result = await seedDemo();
  const total = result.monitors.reduce((acc, m) => acc + m.checks, 0);
  console.log(`Demo data ready in ${((Date.now() - started) / 1000).toFixed(1)} s:`);
  for (const m of result.monitors) {
    console.log(
      `  ${m.name.padEnd(16)} ${String(m.checks).padStart(6)} checks, ${m.incidents} incidents`,
    );
  }
  console.log(`  ${"total".padEnd(16)} ${String(total).padStart(6)} checks`);
  console.log(`\nLog in at ${env.CLIENT_URL} with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} catch (error) {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
