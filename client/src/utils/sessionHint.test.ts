import { afterEach, describe, expect, it, vi } from "vitest";
import { hasSessionHint, setSessionHint } from "./sessionHint";

/** The tests run in Node, which has no localStorage: a tiny stand-in with the same three methods. */
function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("session hint", () => {
  it("is off for a first-time visitor", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    expect(hasSessionHint()).toBe(false);
  });

  it("turns on at login and off at logout", () => {
    vi.stubGlobal("localStorage", fakeStorage());
    setSessionHint(true);
    expect(hasSessionHint()).toBe(true);
    setSessionHint(false);
    expect(hasSessionHint()).toBe(false);
  });

  it("behaves like a first-time visitor when storage is blocked, and never throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    vi.stubGlobal("localStorage", blocked);
    expect(() => setSessionHint(true)).not.toThrow();
    expect(() => setSessionHint(false)).not.toThrow();
    expect(hasSessionHint()).toBe(false);
  });
});
