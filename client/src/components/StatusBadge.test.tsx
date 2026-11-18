// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DISPLAY_STATUSES, STATUS_HINT, STATUS_LABEL } from "../utils/status";
import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it.each(DISPLAY_STATUSES)("%s shows its written label, never only a colour (UX-1)", (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(STATUS_LABEL[status])).toBeVisible();
  });

  it.each(DISPLAY_STATUSES)("%s explains itself in a tooltip", (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByTitle(STATUS_HINT[status])).toBeInTheDocument();
  });

  it("hides the decorative dot from screen readers, so the status is read once", () => {
    const { container } = render(<StatusBadge status="down" />);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(container).toHaveTextContent("Down");
  });

  it("pending reads 'Waiting for first check'", () => {
    render(<StatusBadge status="pending" />);
    expect(screen.getByTitle("Waiting for first check")).toHaveTextContent("Pending");
  });

  it("the small size is smaller than the default and keeps the label", () => {
    const { rerender } = render(<StatusBadge status="healthy" size="sm" />);
    const small = screen.getByText("Healthy");
    expect(small.className).toContain("text-xs");
    rerender(<StatusBadge status="healthy" />);
    expect(screen.getByText("Healthy").className).toContain("text-sm");
  });

  it("accepts an extra class", () => {
    render(<StatusBadge status="paused" className="ml-2" />);
    expect(screen.getByText("Paused")).toHaveClass("ml-2");
  });
});