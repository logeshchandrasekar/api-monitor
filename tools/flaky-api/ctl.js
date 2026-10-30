// Usage (from the repo root):
//   npm run flaky:down                  every request answers 503           -> FAILURE / UNEXPECTED_STATUS
//   npm run flaky:down -- hang          requests are never answered         -> FAILURE / TIMEOUT
//   npm run flaky:down -- reset         connections are dropped             -> FAILURE / CONNECTION
//   npm run flaky:up                    back to normal
const [command, mode] = process.argv.slice(2);
const base = process.env.FLAKY_URL ?? "http://localhost:4100";

if (command !== "down" && command !== "up") {
  console.error("Usage: node tools/flaky-api/ctl.js <down [503|hang|reset] | up>");
  process.exit(1);
}

const path =
  command === "up" ? "/admin/up" : `/admin/down${mode ? `?mode=${encodeURIComponent(mode)}` : ""}`;

try {
  const res = await fetch(base + path, { method: "POST" });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  console.log(`flaky-api is now: ${body.mode}`);
} catch (err) {
  console.error(
    `Could not reach flaky-api at ${base}: ${err instanceof Error ? err.message : err}`,
  );
  console.error("Is it running? Start it with: npm run flaky");
  process.exit(1);
}
