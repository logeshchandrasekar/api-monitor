// flaky-api: a tiny test target for API Monitor. No dependencies, no build step.
// Start it with `npm run flaky` from the repo root. It listens on http://localhost:4100
import http from "node:http";

const PORT = Number(process.env.PORT ?? 4100);

// "up" answers normally. The other modes simulate an outage:
//   503   every request gets 503              (UNEXPECTED_STATUS)
//   hang  requests are accepted, never answered (TIMEOUT)
//   reset the connection is dropped immediately  (CONNECTION)
let mode = "up";
const OUTAGE_MODES = ["503", "hang", "reset"];

const ENDPOINTS = {
  "GET /ok": "200 {ok:true}",
  "GET /slow?ms=2000": "answers after 2000 ms",
  "GET /status/:code": "answers with that status code (200-599)",
  "GET /flaky?p=0.3": "500 with probability p, otherwise 200",
  "GET /redirect?to=URL": "302 to URL",
  "GET /hops/:n": "redirects n times, then 200 on /ok",
  "GET /big?kb=4096": "streams that many KB (tests the 1 MB body cap)",
  "ANY /echo": "returns the method, headers and body it received",
  "POST /admin/down?mode=503|hang|reset": "simulate an outage (default 503)",
  "POST /admin/up": "back to normal",
  "GET /admin/state": "current mode",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const started = Date.now();

  res.on("finish", () => {
    console.log(
      `${new Date().toISOString()}  ${req.method} ${req.url}  ->  ${res.statusCode}  (${Date.now() - started} ms)`,
    );
  });

  const json = (status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };

  // Admin endpoints always work, even during a simulated outage
  if (path === "/admin/state") return json(200, { mode });
  if (path === "/admin/down" || path === "/admin/up") {
    if (req.method !== "POST") return json(405, { error: "use POST" });
    if (path === "/admin/up") mode = "up";
    else {
      const wanted = url.searchParams.get("mode") ?? "503";
      if (!OUTAGE_MODES.includes(wanted))
        return json(400, { error: `mode must be one of ${OUTAGE_MODES.join(", ")}` });
      mode = wanted;
    }
    return json(200, { mode });
  }

  if (mode === "503") return json(503, { error: "flaky-api is simulating an outage" });
  if (mode === "hang") return; // never answer: the monitor's timeout has to rescue it
  if (mode === "reset") return void req.socket.destroy();

  if (path === "/") return json(200, { service: "flaky-api", endpoints: ENDPOINTS });
  if (path === "/ok") return json(200, { ok: true });

  if (path === "/slow") {
    const ms = Math.min(Math.max(Number(url.searchParams.get("ms") ?? 1000) || 0, 0), 60_000);
    return void setTimeout(() => json(200, { ok: true, delayedMs: ms }), ms);
  }

  if (path.startsWith("/status/")) {
    const code = Number(path.split("/")[2]);
    if (!Number.isInteger(code) || code < 200 || code > 599)
      return json(400, { error: "code must be 200-599" });
    return json(code, { status: code });
  }

  if (path === "/flaky") {
    const p = Math.min(Math.max(Number(url.searchParams.get("p") ?? 0.3), 0), 1);
    return Math.random() < p
      ? json(500, { error: "random failure", p })
      : json(200, { ok: true, p });
  }

  if (path === "/redirect") {
    const to = url.searchParams.get("to");
    if (!to) return json(400, { error: "missing ?to=" });
    return json(302, { redirect: to }, { location: to });
  }

  if (path.startsWith("/hops/")) {
    const n = Number(path.split("/")[2]);
    if (!Number.isInteger(n) || n < 1 || n > 50) return json(400, { error: "n must be 1-50" });
    return json(302, { hopsLeft: n }, { location: n === 1 ? "/ok" : `/hops/${n - 1}` });
  }

  if (path === "/big") {
    const totalBytes =
      Math.min(Math.max(Number(url.searchParams.get("kb") ?? 4096) || 1, 1), 512_000) * 1024;
    res.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(totalBytes),
    });
    res.on("error", () => {}); // the client hangs up once it has read enough: that is expected
    const chunk = Buffer.alloc(64 * 1024, 97);
    let sent = 0;
    const write = () => {
      while (sent < totalBytes) {
        const piece = chunk.subarray(0, Math.min(chunk.length, totalBytes - sent));
        sent += piece.length;
        if (!res.write(piece)) return void res.once("drain", write);
      }
      res.end();
    };
    return write();
  }

  if (path === "/echo") {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    return void req.on("end", () =>
      json(200, {
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      }),
    );
  }

  return json(404, { error: "not found", hint: "GET / lists the endpoints" });
});

server.listen(PORT, () => {
  console.log(`flaky-api listening on http://localhost:${PORT}  (GET / lists the endpoints)`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  });
}
