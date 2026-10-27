import { describe, expect, it } from "vitest";
import {
  decryptHeaders,
  encryptHeaders,
  headersKey,
  isSensitiveHeader,
  maskHeaders,
  resolveHeaders,
} from "../utils/headers.js";

describe("headers", () => {
  it("flags sensitive header names", () => {
    for (const n of [
      "Authorization",
      "X-API-Key",
      "Cookie",
      "X-Auth-Token",
      "x-secret",
      "Proxy-Authorization",
    ]) {
      expect(isSensitiveHeader(n)).toBe(true);
    }
    for (const n of ["Accept", "Content-Type", "X-Env"]) expect(isSensitiveHeader(n)).toBe(false);
  });
  it("masks sensitive values only", () => {
    expect(
      maskHeaders([
        { name: "Authorization", value: "Bearer x" },
        { name: "Accept", value: "json" },
      ]),
    ).toEqual([
      { name: "Authorization", value: null, sensitive: true },
      { name: "Accept", value: "json", sensitive: false },
    ]);
  });
  it("keepExisting reuses the saved value, case-insensitively", () => {
    const saved = [{ name: "Authorization", value: "Bearer old" }];
    expect(
      resolveHeaders(
        [
          { name: "authorization", keepExisting: true },
          { name: "X-A", value: "1" },
        ],
        saved,
      ),
    ).toEqual([
      { name: "authorization", value: "Bearer old" },
      { name: "X-A", value: "1" },
    ]);
  });
  it("keepExisting without a saved value, or a missing value, is a validation error", () => {
    expect(() => resolveHeaders([{ name: "X-A", keepExisting: true }], [])).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
    expect(() => resolveHeaders([{ name: "X-A" }], [])).toThrow(
      expect.objectContaining({ code: "VALIDATION_ERROR" }),
    );
  });
  it("encrypts and decrypts, and returns null for no headers", () => {
    const headers = [{ name: "Authorization", value: "Bearer abc" }];
    const enc = encryptHeaders(headers)!;
    expect(enc).not.toContain("abc");
    expect(decryptHeaders(enc)).toEqual(headers);
    expect(encryptHeaders([])).toBeNull();
    expect(decryptHeaders(null)).toEqual([]);
  });
  it("fingerprint ignores order and header-name case", () => {
    expect(
      headersKey([
        { name: "A", value: "1" },
        { name: "B", value: "2" },
      ]),
    ).toBe(
      headersKey([
        { name: "b", value: "2" },
        { name: "a", value: "1" },
      ]),
    );
    expect(headersKey([{ name: "A", value: "1" }])).not.toBe(
      headersKey([{ name: "A", value: "2" }]),
    );
  });
});
