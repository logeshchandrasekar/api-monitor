import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../utils/crypto.js";

describe("crypto", () => {
  it("round-trips text, unicode and the empty string", () => {
    for (const text of ["Bearer abc.def.ghi", "héllo wörld ✓ 你好", "", '{"a":1}']) {
      expect(decrypt(encrypt(text))).toBe(text);
    }
  });
  it("never repeats a ciphertext (random IV) and never contains the plaintext", () => {
    const a = encrypt("super-secret");
    const b = encrypt("super-secret");
    expect(a).not.toBe(b);
    expect(a).not.toContain("super-secret");
    expect(a.startsWith("v1:")).toBe(true);
  });
  it("detects tampering", () => {
    const parts = encrypt("secret").split(":");
    const flipped = Buffer.from(parts[3]!, "base64");
    flipped[0] = flipped[0]! ^ 0xff;
    parts[3] = flipped.toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
  it("rejects unknown versions and garbage", () => {
    expect(() => decrypt("v9:a:b:c")).toThrow();
    expect(() => decrypt("garbage")).toThrow();
  });
});
