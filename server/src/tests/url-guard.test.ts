import { describe, expect, it } from "vitest";
import {
  assertResolvesPublic,
  isBlockedIp,
  parseTargetUrl,
  validateTargetUrl,
} from "../utils/url-guard.js";

const strict = { allowPrivate: false };

describe("parseTargetUrl (strict mode)", () => {
  const blockedUrls = [
    "http://localhost",
    "http://localhost:3000/api",
    "http://LOCALHOST./",
    "http://app.localhost/",
    "http://127.0.0.1",
    "http://127.1",
    "http://0177.0.0.1", // octal form of 127.0.0.1
    "http://[0:0:0:0:0:ffff:7f00:1]", // expanded IPv4-mapped IPv6 loopback
    "http://0.0.0.0",
    "http://0",
    "http://2130706433", // decimal form of 127.0.0.1
    "http://0x7f.1", // hex form
    "http://017700000001", // octal form
    "http://10.0.0.5",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.1",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1", // carrier-grade NAT
    "http://224.0.0.1", // multicast
    "http://[::1]/",
    "http://[::]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:10.0.0.1]/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
    "http://[fd12:3456::1]/",
    "http://metadata.google.internal/",
    "http://printer.local/",
    "http://db/",
    "http://redis:6379",
  ];
  it.each(blockedUrls)("blocks %s", (url) => {
    expect(() => parseTargetUrl(url, strict)).toThrow(
      expect.objectContaining({ code: "BLOCKED_TARGET" }),
    );
  });

  const invalidUrls: [string, string][] = [
    ["not a url", "INVALID_URL"],
    ["", "INVALID_URL"],
    ["example.com", "INVALID_URL"],
    ["ftp://8.8.8.8", "INVALID_URL"],
    ["file:///etc/passwd", "INVALID_URL"],
    ["javascript:alert(1)", "INVALID_URL"],
    ["http://user:pass@example.com", "INVALID_URL"],
    [`https://example.com/${"a".repeat(2100)}`, "INVALID_URL"],
  ];
  it.each(invalidUrls)("rejects %s", (url, code) => {
    expect(() => parseTargetUrl(url, strict)).toThrow(expect.objectContaining({ code }));
  });

  it.each([
    "https://example.com",
    "https://api.example.com/users?x=1",
    "http://8.8.8.8:8080/health",
    "https://[2606:4700:4700::1111]/",
    "  https://example.com/padded  ",
  ])("allows %s", (url) => {
    expect(() => parseTargetUrl(url, strict)).not.toThrow();
  });

  it("returns a normalised URL", () => {
    expect(parseTargetUrl("https://Example.COM", strict).href).toBe("https://example.com/");
  });
});

describe("parseTargetUrl (private targets allowed, dev only)", () => {
  it.each(["http://localhost:4100/ok", "http://127.0.0.1:4100", "http://db/"])(
    "allows %s",
    (url) => {
      expect(() => parseTargetUrl(url, { allowPrivate: true })).not.toThrow();
    },
  );
  it("still enforces scheme and credentials", () => {
    expect(() => parseTargetUrl("ftp://localhost", { allowPrivate: true })).toThrow();
    expect(() => parseTargetUrl("http://a:b@localhost", { allowPrivate: true })).toThrow();
  });
});

describe("isBlockedIp", () => {
  it("allows ordinary public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111"]) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });
  it("blocks unparseable input", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });
  it("blocks documentation, benchmarking and 6to4 space", () => {
    for (const ip of [
      "192.0.2.1",
      "198.51.100.1",
      "203.0.113.5",
      "198.18.0.1",
      "2002:7f00:1::1",
      "2001:db8::1",
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });
});

describe("assertResolvesPublic", () => {
  const lookupTo =
    (...addresses: string[]) =>
    async () =>
      addresses.map((address) => ({ address }));

  it("blocks a public-looking name that resolves to a private address", async () => {
    await expect(
      assertResolvesPublic("evil.example.com", {
        allowPrivate: false,
        lookup: lookupTo("10.0.0.7"),
      }),
    ).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
  });

  it("blocks nip.io hostnames that resolve to loopback", async () => {
    await expect(
      assertResolvesPublic("127.0.0.1.nip.io", {
        allowPrivate: false,
        lookup: lookupTo("127.0.0.1"),
      }),
    ).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
  });

  it("blocks when ANY resolved address is private (DNS rebinding style)", async () => {
    await expect(
      assertResolvesPublic("mixed.example.com", {
        allowPrivate: false,
        lookup: lookupTo("8.8.8.8", "127.0.0.1"),
      }),
    ).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
  });
  it("allows names that resolve to public addresses", async () => {
    await expect(
      assertResolvesPublic("ok.example.com", { allowPrivate: false, lookup: lookupTo("8.8.8.8") }),
    ).resolves.toBeUndefined();
  });
  it("allows names that do not resolve yet", async () => {
    const failing = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(
      assertResolvesPublic("not-live-yet.example.com", { allowPrivate: false, lookup: failing }),
    ).resolves.toBeUndefined();
  });
  it("does not hang on a slow resolver", async () => {
    const never = () => new Promise<{ address: string }[]>(() => {});
    await expect(
      assertResolvesPublic("slow.example.com", {
        allowPrivate: false,
        lookup: never,
        dnsTimeoutMs: 50,
      }),
    ).resolves.toBeUndefined();
  });
  it("skips everything when private targets are allowed", async () => {
    await expect(
      assertResolvesPublic("x.example.com", { allowPrivate: true, lookup: lookupTo("127.0.0.1") }),
    ).resolves.toBeUndefined();
  });
});

describe("validateTargetUrl", () => {
  it("combines syntax and DNS checks", async () => {
    await expect(
      validateTargetUrl("https://sneaky.example.com", {
        allowPrivate: false,
        lookup: async () => [{ address: "169.254.169.254" }],
      }),
    ).rejects.toMatchObject({ code: "BLOCKED_TARGET" });
    const url = await validateTargetUrl("https://fine.example.com/x", {
      allowPrivate: false,
      lookup: async () => [{ address: "8.8.8.8" }],
    });
    expect(url.hostname).toBe("fine.example.com");
  });
});
