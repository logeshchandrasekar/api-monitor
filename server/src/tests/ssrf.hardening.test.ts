import { describe, expect, it } from "vitest";
import { createCheckRunner, type CheckInput } from "../services/checkRunner.js";
import { BlockedTargetError, createSafeLookup } from "../utils/safeLookup.js";
import { isBlockedIp, parseTargetUrl, validateTargetUrl } from "../utils/url-guard.js";
import { startTestServer } from "./testServer.js";
import { afterAll, beforeAll } from "vitest";

// Phase 9 SSRF review (SEC-1). Everything here must stay blocked; the public list must stay allowed.

const BLOCKED_IPS = [
  // IPv4
  "0.0.0.0",
  "10.0.0.1",
  "10.255.255.255",
  "100.64.0.1",
  "100.127.255.255",
  "127.0.0.1",
  "127.255.255.254",
  "169.254.169.254",
  "172.16.0.1",
  "172.31.255.255",
  "192.0.0.1",
  "192.0.2.1",
  "192.88.99.1",
  "192.168.0.1",
  "198.18.0.1",
  "198.19.255.255",
  "198.51.100.7",
  "203.0.113.5",
  "224.0.0.1",
  "239.255.255.255",
  "240.0.0.1",
  "255.255.255.255",
  // IPv6 basics
  "::",
  "::1",
  "fe80::1",
  "fc00::1",
  "fd12:3456::1",
  "ff02::1",
  "ff00::1",
  // IPv4 inside IPv6
  "::ffff:127.0.0.1",
  "::ffff:7f00:1",
  "::ffff:10.0.0.1",
  "::ffff:a9fe:a9fe",
  "::ffff:0:7f00:1",
  "::127.0.0.1",
  "::10.0.0.1",
  "64:ff9b::7f00:1",
  "64:ff9b::a00:1",
  "2002:7f00:1::",
  "2002:a9fe:a9fe::",
  "2001::1",
  "2001:0:4136:e378:8000:63bf:3fff:fdd2",
  // Added in the Phase 9 review
  "::2",
  "100::1",
  "64:ff9b:1::1",
  "fec0::1",
  "2001:2::1",
  "2001:10::1",
  "2001:20::1",
  "3fff::1",
  "5f00::1",
  "2001:db8::1",
  "2001:db8:1::1",
  // not an address at all
  "",
  "not-an-ip",
  "999.1.1.1",
];

const PUBLIC_IPS = [
  "8.8.8.8",
  "1.1.1.1",
  "93.184.216.34",
  "172.15.255.255",
  "172.32.0.1",
  "100.63.255.255",
  "100.128.0.1",
  "2606:4700:4700::1111",
  "2a00:1450:4009:81f::200e",
  "2620:119:35::35",
];

describe("isBlockedIp", () => {
  it.each(BLOCKED_IPS)("blocks %j", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });
  it.each(PUBLIC_IPS)("still allows the public address %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });
});

const BLOCKED_URLS = [
  // numeric tricks for 127.0.0.1
  "http://2130706433/",
  "http://0x7f.1/",
  "http://0X7F.1/",
  "http://017700000001/",
  "http://127.1/",
  "http://0177.0.0.1/",
  "http://0x7f000001/",
  "http://127.0.0.1./",
  "http://127.0.0.1.:80/",
  "http://0/",
  "http://0.0.0.0/",
  // unusual dots and Unicode digits
  "http://127。0。0。1/",
  "http://①②⑦.0.0.1/",
  // IPv6 literals
  "http://[::1]/",
  "http://[::]/",
  "http://[::ffff:127.0.0.1]/",
  "http://[::ffff:7f00:1]/",
  "http://[0:0:0:0:0:ffff:7f00:1]/",
  "http://[64:ff9b::7f00:1]/",
  "http://[2002:7f00:1::]/",
  "http://[fd00:ec2::254]/",
  "http://[fec0::1]/",
  "http://[::2]/",
  // cloud metadata and internal names
  "http://169.254.169.254/latest/meta-data/",
  "http://metadata.google.internal/",
  "http://metadata/",
  "http://100.64.0.1/",
  "http://localhost/",
  "http://LOCALHOST:8080/x",
  "http://localhost./",
  "http://localhost%2e/",
  "http://%6c%6f%63%61%6c%68%6f%73%74/",
  "http://foo.localhost/",
  "http://a.b.internal/",
  "http://printer.local/",
  "http://redis/",
  "http://xn--localhost-9o0a/",
  "http://[fe80::1]/",
  "http://10.0.0.1:6379/",
  "http://192.168.1.1/admin",
];

const REJECTED_AS_INVALID = [
  "ftp://example.com/",
  "file:///etc/passwd",
  "gopher://example.com/",
  "javascript:alert(1)",
  "data:text/plain,hi",
  "http://user:pass@example.com/",
  "http://example.com@127.0.0.1/",
  "http://127.0.0.1%2509/",
  "http://localhost%00.example.com/",
  "http://[fe80::1%25eth0]/",
  "http://exa mple.com/",
  "http://example.com:99999/",
  "",
  "   ",
  "example.com",
  "http://",
  `http://${"a".repeat(2100)}.com/`,
];

const ALLOWED_URLS = [
  "https://example.com/health",
  "http://8.8.8.8:8080/x",
  "https://[2606:4700:4700::1111]/",
  "http://example.com:8080/",
  "HTTP://EXAMPLE.COM/",
  "http://ex%61mple.com/",
  "https://api.example.co.uk/v1/status?x=1#frag",
  // The WHATWG parser reads the backslash like a slash, so the HOST is evil.example.com and the 127.0.0.1 is only path text
  "http://evil.example.com\\@127.0.0.1/",
];

describe("parseTargetUrl (allowPrivate=false)", () => {
  it.each(BLOCKED_URLS)("blocks %s as BLOCKED_TARGET", (url) => {
    expect(() => parseTargetUrl(url, { allowPrivate: false })).toThrowError(
      expect.objectContaining({ code: "BLOCKED_TARGET" }),
    );
  });
  it.each(REJECTED_AS_INVALID)("rejects %j as INVALID_URL", (url) => {
    expect(() => parseTargetUrl(url, { allowPrivate: false })).toThrowError(
      expect.objectContaining({ code: "INVALID_URL" }),
    );
  });
  it.each(ALLOWED_URLS)("allows %s", (url) => {
    expect(() => parseTargetUrl(url, { allowPrivate: false })).not.toThrow();
  });
  it("the backslash URL connects to evil.example.com, not to 127.0.0.1", () => {
    expect(
      parseTargetUrl("http://evil.example.com\\@127.0.0.1/", { allowPrivate: false }).hostname,
    ).toBe("evil.example.com");
  });
  it("allowPrivate=true (development only) lets localhost through", () => {
    expect(() => parseTargetUrl("http://localhost:4100/ok", { allowPrivate: true })).not.toThrow();
  });
});

describe("names that point inside (DNS), checked when a monitor is saved", () => {
  const answers =
    (...addresses: string[]) =>
    async () =>
      addresses.map((address) => ({ address }));
  it.each([
    ["wildcard DNS names such as 127.0.0.1.nip.io", "127.0.0.1.nip.io", ["127.0.0.1"]],
    ["a name that resolves to the metadata address", "meta.example.com", ["169.254.169.254"]],
    [
      "a name that resolves to an IPv4-mapped IPv6 address",
      "mapped.example.com",
      ["::ffff:10.0.0.5"],
    ],
    ["a name that resolves to a NAT64 address", "nat.example.com", ["64:ff9b::7f00:1"]],
    [
      "a name with one public and one private answer",
      "mixed.example.com",
      ["93.184.216.34", "192.168.0.10"],
    ],
  ])("rejects %s", async (_label, host, addrs) => {
    await expect(
      validateTargetUrl(`http://${host}/`, { allowPrivate: false, lookup: answers(...addrs) }),
    ).rejects.toMatchObject({
      code: "BLOCKED_TARGET",
    });
  });
  it("accepts a name that resolves to public addresses only", async () => {
    await expect(
      validateTargetUrl("https://api.example.com/", {
        allowPrivate: false,
        lookup: answers("93.184.216.34", "2606:4700:4700::1111"),
      }),
    ).resolves.toBeInstanceOf(URL);
  });
  it("allows a name that does not resolve yet (monitoring a not-yet-live API is allowed; the connection check still applies)", async () => {
    await expect(
      validateTargetUrl("https://not-live-yet.example.com/", {
        allowPrivate: false,
        lookup: async () => {
          throw new Error("ENOTFOUND");
        },
      }),
    ).resolves.toBeInstanceOf(URL);
  });
});

describe("createSafeLookup (the connection-time check)", () => {
  const run = (lookup: ReturnType<typeof createSafeLookup>, options: object = {}) =>
    new Promise<{ err: unknown; result: unknown }>((resolve) =>
      lookup("any.example.com", options, (err, a, b) =>
        resolve({ err, result: b === undefined ? a : [a, b] }),
      ),
    );

  it("hands the validated address to the connection", async () => {
    const lookup = createSafeLookup({
      allowPrivate: false,
      resolve: async () => [{ address: "93.184.216.34", family: 4 }],
    });
    expect(await run(lookup)).toEqual({ err: null, result: ["93.184.216.34", 4] });
    expect(await run(lookup, { all: true })).toEqual({
      err: null,
      result: [{ address: "93.184.216.34", family: 4 }],
    });
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::",
    "fec0::1",
  ])("refuses %s with BlockedTargetError", async (address) => {
    const lookup = createSafeLookup({
      allowPrivate: false,
      resolve: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
    });
    const { err } = await run(lookup);
    expect(err).toBeInstanceOf(BlockedTargetError);
    expect(err).toMatchObject({ code: "BLOCKED_TARGET" });
  });

  it("one private answer among public ones rejects the whole name (DNS rebinding with round-robin answers)", async () => {
    const lookup = createSafeLookup({
      allowPrivate: false,
      resolve: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    });
    expect((await run(lookup, { all: true })).err).toBeInstanceOf(BlockedTargetError);
  });

  it("a different answer on the next lookup is judged again (the answer is never cached)", async () => {
    let calls = 0;
    const lookup = createSafeLookup({
      allowPrivate: false,
      resolve: async () => [{ address: ++calls === 1 ? "93.184.216.34" : "127.0.0.1", family: 4 }],
    });
    expect((await run(lookup)).err).toBeNull();
    expect((await run(lookup)).err).toBeInstanceOf(BlockedTargetError);
  });

  it("allowPrivate lets a private answer through (development only)", async () => {
    const lookup = createSafeLookup({
      allowPrivate: true,
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    expect((await run(lookup)).err).toBeNull();
  });

  it("passes a resolver failure on, and reports an empty answer as not found", async () => {
    const failing = createSafeLookup({
      allowPrivate: false,
      resolve: async () => {
        throw Object.assign(new Error("x"), { code: "ESERVFAIL" });
      },
    });
    expect((await run(failing)).err).toMatchObject({ code: "ESERVFAIL" });
    const empty = createSafeLookup({ allowPrivate: false, resolve: async () => [] });
    expect((await run(empty)).err).toMatchObject({ code: "ENOTFOUND" });
  });
});

describe("redirects into internal addresses, through the real runner", () => {
  let server: Awaited<ReturnType<typeof startTestServer>>;
  beforeAll(async () => {
    server = await startTestServer();
  });
  afterAll(async () => {
    await server.close();
  });

  const input = (url: string): CheckInput => ({
    url,
    method: "GET",
    headers: [],
    body: null,
    expectedStatus: 200,
    followRedirects: true,
    timeoutMs: 2000,
    responseThresholdMs: 1000,
  });

  // The first hop (our own test server) is waived so a redirect can happen; every later hop is judged by the real strict rules
  const runner = () =>
    createCheckRunner({
      allowPrivate: false,
      hopCheck: (url) => {
        if (url.port !== String(server.port)) parseTargetUrl(url.href, { allowPrivate: false });
      },
    });

  it.each([
    "http://2130706433/",
    "http://0x7f.1/",
    "http://017700000001/",
    "http://[64:ff9b::7f00:1]/",
    "http://[2002:7f00:1::]/",
    "http://[::ffff:127.0.0.1]/",
    "http://100.64.0.1/",
    "http://localhost./",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://10.0.0.1:6379/",
    "//127.0.0.1:9/x",
    "http://[fec0::1]/",
    "http://[::2]/",
  ])("a redirect to %s is blocked and never connected to", async (target) => {
    const r = await runner()(input(`${server.url}/redirect?to=${encodeURIComponent(target)}`));
    expect(r).toMatchObject({ outcome: "FAILURE", failureType: "BLOCKED_TARGET" });
    expect(r.errorMessage).toBe("This address is not allowed.");
  });

  it.each([
    "file:///etc/passwd",
    "gopher://127.0.0.1/",
    "javascript:alert(1)",
    "ftp://example.com/x",
    "http://user:pass@8.8.8.8/",
  ])("a redirect to the unsupported target %s fails cleanly", async (target) => {
    const r = await runner()(input(`${server.url}/redirect?to=${encodeURIComponent(target)}`));
    expect(r.outcome).toBe("FAILURE");
    expect(r.failureType).toBe("OTHER");
    expect(r.errorMessage).toMatch(/not supported|not valid/);
  });

  it("a hop in the MIDDLE of a chain is judged too, not just the first redirect", async () => {
    const hop2 = `${server.url}/redirect?to=${encodeURIComponent("http://169.254.169.254/latest/meta-data/")}`;
    const r = await runner()(input(`${server.url}/redirect?to=${encodeURIComponent(hop2)}`));
    expect(r).toMatchObject({ outcome: "FAILURE", failureType: "BLOCKED_TARGET" });
  });
});
