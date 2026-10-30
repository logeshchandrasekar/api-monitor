import { describe, expect, it } from "vitest";
import { getReturnPath } from "./navigation";

describe("getReturnPath", () => {
  it("returns the remembered in-app path, with its query and hash", () => {
    expect(getReturnPath({ from: "/monitors/abc?tab=checks#top" })).toBe(
      "/monitors/abc?tab=checks#top",
    );
  });
  it("falls back to / for missing or odd state", () => {
    expect(getReturnPath(null)).toBe("/");
    expect(getReturnPath(undefined)).toBe("/");
    expect(getReturnPath({})).toBe("/");
    expect(getReturnPath({ from: 42 })).toBe("/");
  });
  it("refuses anything that is not a plain in-app path", () => {
    expect(getReturnPath({ from: "https://evil.example" })).toBe("/");
    expect(getReturnPath({ from: "//evil.example" })).toBe("/");
    expect(getReturnPath({ from: "monitors" })).toBe("/");
  });
  it("never returns to the login or register page", () => {
    expect(getReturnPath({ from: "/login" })).toBe("/");
    expect(getReturnPath({ from: "/register?x=1" })).toBe("/");
  });
});
