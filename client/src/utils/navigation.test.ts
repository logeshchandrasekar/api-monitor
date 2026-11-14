import { describe, expect, it } from "vitest";
import { getReturnPath, showsLanding } from "./navigation";

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

describe("showsLanding", () => {
  it("a first visit or a logout at the home address shows the landing page", () => {
    expect(showsLanding("/", null)).toBe(true);
    expect(showsLanding("/", "logout")).toBe(true);
  });
  it("an expired session goes to sign in so the 'session expired' message is shown", () => {
    expect(showsLanding("/", "expired")).toBe(false);
  });
  it("every other address still requires a login", () => {
    expect(showsLanding("/monitors", null)).toBe(false);
    expect(showsLanding("/settings", "logout")).toBe(false);
  });
});
