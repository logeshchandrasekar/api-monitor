// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../../services/api";
import { renderApp } from "../../test/render";
import type { PlanLimits } from "../../types/api";
import { newFormValues } from "../../utils/monitorForm";
import { MonitorForm } from "./MonitorForm";

const limits: PlanLimits = {
  plan: "FREE",
  maxMonitors: 5,
  monitorCount: 1,
  minIntervalSec: 300,
  allowedIntervalsSec: [300, 600, 1800, 3600],
  maxTimeoutMs: 30_000,
  retentionDays: 7,
};

function setup(props: Partial<Parameters<typeof MonitorForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const view = renderApp(
    <MonitorForm
      initial={newFormValues(limits.allowedIntervalsSec)}
      limits={limits}
      submitLabel="Create monitor"
      cancelTo="/monitors"
      onSubmit={onSubmit}
      pending={false}
      error={null}
      {...props}
    />,
  );
  return { onSubmit, ...view };
}

const submit = () => userEvent.click(screen.getByRole("button", { name: "Create monitor" }));

describe("MonitorForm validation", () => {
  it("an empty form shows what is missing, sends nothing, and moves focus to the first problem", async () => {
    const { onSubmit } = setup();
    await submit();
    expect(screen.getByText("Enter a name.")).toBeVisible();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());
  });

  it.each([
    ["not a url", "Enter a full URL, for example https://api.example.com/health."],
    ["ftp://example.com/file", "The URL must start with http:// or https://."],
  ])("rejects the URL %j", async (url, message) => {
    const { onSubmit } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "My API");
    await user.clear(screen.getByLabelText("URL"));
    await user.type(screen.getByLabelText("URL"), url);
    await user.click(screen.getByRole("button", { name: "Create monitor" }));
    expect(screen.getByText(message)).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("checks the status code, the timeout and the slow threshold", async () => {
    const { onSubmit } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "My API");
    await user.type(screen.getByLabelText("URL"), "api.example.com");
    for (const [label, value] of [
      ["Expected status code", "99"],
      ["Timeout (seconds)", "45"],
      ["Slow response threshold (ms)", "10"],
    ] as const) {
      await user.clear(screen.getByLabelText(label));
      await user.type(screen.getByLabelText(label), value);
    }
    await user.click(screen.getByRole("button", { name: "Create monitor" }));
    expect(screen.getByText("Enter a status code between 100 and 599.")).toBeVisible();
    expect(screen.getByText("Enter a timeout between 1 and 30 seconds.")).toBeVisible();
    expect(screen.getByText(/whole number of milliseconds between 50 and 60000/)).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("the body box only exists for methods that send a body, and must be valid JSON", async () => {
    const { onSubmit } = setup();
    const user = userEvent.setup();
    expect(screen.queryByLabelText("JSON body")).not.toBeInTheDocument(); // GET
    await user.selectOptions(screen.getByLabelText("Method"), "POST");
    const body = screen.getByLabelText("JSON body");
    await user.type(body, "{{ not json");
    await user.type(screen.getByLabelText("Name"), "My API");
    await user.clear(screen.getByLabelText("URL"));
    await user.type(screen.getByLabelText("URL"), "https://api.example.com/x");
    await user.click(screen.getByRole("button", { name: "Create monitor" }));
    expect(screen.getByText("The body must be valid JSON.")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("MonitorForm submit", () => {
  it("a valid form sends the payload once, in the units the server expects", async () => {
    const { onSubmit } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Name"), "  Production API  ");
    await user.clear(screen.getByLabelText("URL"));
    await user.type(screen.getByLabelText("URL"), "https://api.example.com/health");
    await user.selectOptions(screen.getByLabelText("Check every"), "600");
    await user.click(screen.getByRole("button", { name: "Create monitor" }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      name: "Production API",
      url: "https://api.example.com/health",
      method: "GET",
      intervalSec: 600,
      expectedStatus: 200,
      followRedirects: true,
      body: null,
    });
    expect(typeof onSubmit.mock.calls[0]![0].timeoutMs).toBe("number"); // seconds on screen, milliseconds on the wire
  });

  it("the timeout follows the interval until the person sets it themselves", async () => {
    setup();
    const user = userEvent.setup();
    const timeout = screen.getByLabelText("Timeout (seconds)");
    const before = (timeout as HTMLInputElement).value;
    await user.selectOptions(screen.getByLabelText("Check every"), "3600");
    expect((timeout as HTMLInputElement).value).toBe("10"); // 80 % of an hour, capped at 10 s
    await user.clear(timeout);
    await user.type(timeout, "3");
    await user.selectOptions(screen.getByLabelText("Check every"), "600");
    expect((timeout as HTMLInputElement).value).toBe("3"); // now it is theirs, and stays
    expect(before).not.toBe("");
  });

  it("states the plan's minimum interval and only offers allowed intervals", () => {
    setup();
    expect(screen.getByText("Your FREE plan allows checks every 5 min or slower.")).toBeVisible();
    const options = within(screen.getByLabelText("Check every")).getAllByRole("option");
    expect(options).toHaveLength(4);
  });

  it("keeps a saved interval the plan no longer offers visible instead of silently changing it", () => {
    const initial = { ...newFormValues(limits.allowedIntervalsSec), intervalSec: 60 };
    setup({ initial });
    const options = within(screen.getByLabelText("Check every")).getAllByRole("option");
    expect(options).toHaveLength(5);
    expect(screen.getByLabelText("Check every")).toHaveValue("60");
  });

  it("shows a busy submit button while saving", () => {
    setup({ pending: true });
    expect(screen.getByRole("button", { name: "Create monitor" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });
});

describe("MonitorForm server errors", () => {
  it("puts a field error under its field and says some fields need attention", () => {
    setup({
      error: new ApiError(400, "VALIDATION_ERROR", "Invalid input", [
        { path: ["url"], message: "That address is not allowed." },
      ]),
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Some fields need attention.");
    expect(screen.getByText("That address is not allowed.")).toBeVisible();
    expect(screen.getByLabelText("URL")).toHaveAttribute("aria-invalid", "true");
  });

  it("the monitor limit explains the way out", () => {
    setup({
      error: new ApiError(403, "MONITOR_LIMIT_REACHED", "Your Free plan allows 5 monitors."),
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Your Free plan allows 5 monitors.");
    expect(screen.getByRole("link", { name: "your monitors" })).toHaveAttribute(
      "href",
      "/monitors",
    );
  });

  it("any other failure shows one safe message", () => {
    setup({ error: new ApiError(500, "INTERNAL", "boom: stack trace") });
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong on our side.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("boom");
  });

  it("tells the page when the person edits, so the old error can be cleared", async () => {
    const onEdit = vi.fn();
    setup({ onEdit });
    await userEvent.type(screen.getByLabelText("Name"), "x");
    expect(onEdit).toHaveBeenCalled();
  });
});