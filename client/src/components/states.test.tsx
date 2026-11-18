// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../services/api";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";

describe("EmptyState", () => {
  it("shows the title, the description and the action", async () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No monitors yet"
        description="Add one to start."
        action={<button onClick={onClick}>Add monitor</button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "No monitors yet" })).toBeVisible();
    expect(screen.getByText("Add one to start.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Add monitor" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("works with only a title", () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("is announced to screen readers as an alert", () => {
    render(<ErrorState message="It broke." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("alert")).toHaveTextContent("It broke.");
  });

  it.each([
    [
      new ApiError(500, "INTERNAL", "stack trace here"),
      "Something went wrong on our side. Please try again in a moment.",
    ],
    [
      new ApiError(429, "RATE_LIMITED", "x"),
      "Too many attempts. Please wait a moment and try again.",
    ],
    [new ApiError(404, "NOT_FOUND", "Monitor not found."), "Monitor not found."],
    [new Error("TypeError: x is undefined"), "Something went wrong. Please try again."],
  ])("turns %s into a message that is safe to show", (error, expected) => {
    render(<ErrorState error={error} />);
    expect(screen.getByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/stack trace|TypeError/);
  });

  it("offers Try again only when it can retry, and calls the handler", async () => {
    const { rerender } = render(<ErrorState message="x" />);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    const onRetry = vi.fn();
    rerender(<ErrorState message="x" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows a busy retry button while retrying", () => {
    render(<ErrorState message="x" onRetry={() => {}} retrying />);
    expect(screen.getByRole("button", { name: "Try again" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
  });
});