import http from "node:http";
import type { AddressInfo } from "node:net";

export type TestServer = { port: number; url: string; close: () => Promise<void> };

/** A tiny local HTTP server for runner and scheduler tests. Listens on 127.0.0.1, random port. */
export async function startTestServer(): Promise<TestServer> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const path = url.pathname;
      const send = (
        status: number,
        body: unknown = { ok: true },
        headers: Record<string, string> = {},
      ) => {
        res.writeHead(status, { "content-type": "application/json", ...headers });
        res.end(JSON.stringify(body));
      };

      if (path === "/ok") return send(200);
      if (path.startsWith("/status/")) return send(Number(path.split("/")[2]));
      if (path === "/slow")
        return void setTimeout(() => send(200), Number(url.searchParams.get("ms") ?? 100));
      if (path === "/hang") return; // never answers
      if (path === "/redirect")
        return send(302, {}, { location: url.searchParams.get("to") ?? "/ok" });
      if (path === "/redirect-code") {
        return send(
          Number(url.searchParams.get("code") ?? 302),
          {},
          { location: url.searchParams.get("to") ?? "/ok" },
        );
      }
      if (path.startsWith("/hops/")) {
        const n = Number(path.split("/")[2]);
        return send(302, {}, { location: n <= 1 ? "/ok" : `/hops/${n - 1}` });
      }
      if (path === "/big") {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        const total = Number(url.searchParams.get("kb") ?? 4096) * 1024;
        let sent = 0;
        const chunk = Buffer.alloc(64 * 1024, 97);
        const write = () => {
          while (sent < total) {
            sent += chunk.length;
            if (!res.write(chunk)) return void res.once("drain", write);
          }
          res.end();
        };
        res.on("error", () => {});
        return write();
      }
      if (path === "/echo") {
        return send(200, {
          method: req.method,
          headers: req.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      }
      return send(404, { error: "not found" });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A port nothing is listening on (for "connection refused"). */
export async function closedPort(): Promise<number> {
  const s = await startTestServer();
  const port = s.port;
  await s.close();
  return port;
}

export type Seen = {
  method?: string | undefined;
  url?: string | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
};

/**
 * Records every request it receives and answers 200 (except GET /r, which redirects to /landing on the
 * same origin). Lets a test inspect exactly what the runner sent.
 */
export async function startCaptureServer(): Promise<TestServer & { seen: Seen[] }> {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seen.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      if (req.url === "/r") return void res.writeHead(302, { location: "/landing" }).end(); // same-origin redirect
      res.writeHead(200).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
