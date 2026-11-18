// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../services/api";
import { renderApp } from "../test/render";
import { LoginPage } from "./LoginPage";

const fill = async (email: string, password: string) => {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText("Password"), password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
};

describe("LoginPage", () => {
  it("asks for both fields and does not call the server", async () => {
    const login = vi.fn();
    renderApp(<LoginPage />, { auth: { login } });
    await fill("", "");
    expect(screen.getByText("Enter your email address.")).toBeVisible();
    expect(screen.getByText("Enter your password.")).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(login).not.toHaveBeenCalled();
  });

  it("rejects an email that is not an email", async () => {
    const login = vi.fn();
    renderApp(<LoginPage />, { auth: { login } });
    await fill("not-an-email", "secret123");
    expect(screen.getByText("Enter a valid email address.")).toBeVisible();
    expect(login).not.toHaveBeenCalled();
  });

  it("sends the trimmed email and the password as typed", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    renderApp(<LoginPage />, { auth: { login } });
    await fill("  me@example.com  ", " pass word ");
    await waitFor(() => expect(login).toHaveBeenCalledOnce());
    expect(login.mock.calls[0]![0]).toEqual({ email: "me@example.com", password: " pass word " });
  });

  it("a 401 says 'Incorrect email or password.' and never which of the two was wrong", async () => {
    const login = vi
      .fn()
      .mockRejectedValue(new ApiError(401, "INVALID_CREDENTIALS", "internal wording"));
    renderApp(<LoginPage />, { auth: { login } });
    await fill("me@example.com", "wrong-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("internal wording");
  });

  it("a 429 says to wait", async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(429, "RATE_LIMITED", "x"));
    renderApp(<LoginPage />, { auth: { login } });
    await fill("me@example.com", "wrong-password");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Wait a few minutes",
    );
  });

  it("a network failure gets a generic message, not an exception", async () => {
    const login = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    renderApp(<LoginPage />, { auth: { login } });
    await fill("me@example.com", "secret123");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not sign in. Please try again.",
    );
  });

  it("disables the button and marks it busy while the request runs, so it cannot be sent twice", async () => {
    let finish!: () => void;
    const login = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderApp(<LoginPage />, { auth: { login } });
    await fill("me@example.com", "secret123");
    const button = await screen.findByRole("button", { name: "Sign in" });
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    finish();
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("explains an expired session", () => {
    renderApp(<LoginPage />, { route: { pathname: "/login", state: { expired: true } } });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session expired. Please sign in again.",
    );
  });

  it("links to the registration page", () => {
    renderApp(<LoginPage />);
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/register",
    );
  });
});