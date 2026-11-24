// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../test/render";
import type { Monitor, MonitorListItem } from "../types/api";
import { MonitorsPage } from "./MonitorsPage";

const api = vi.hoisted(() => ({ list: vi.fn(), tags: vi.fn() }));
vi.mock("../services/monitorsApi", () => ({ monitorsApi: api }));
vi.mock("../services/userApi", () => ({
  usersApi: {
    getLimits: async () => ({
      plan: "PRO",
      maxMonitors: 50,
      monitorCount: 3,
      minIntervalSec: 60,
      allowedIntervalsSec: [60],
      maxTimeoutMs: 30000,
      retentionDays: 30,
    }),
  },
}));

const item = (over: Partial<MonitorListItem>): MonitorListItem =>
  ({
    id: over.name ?? "x",
    name: "Monitor",
    method: "GET",
    url: "https://api.example.com/",
    status: "HEALTHY",
    isPaused: false,
    failStreak: 0,
    lastCheckedAt: null,
    lastResponseTimeMs: null,
    tags: [],
    uptime24h: 100,
    recent: [],
    ...over,
  }) as unknown as MonitorListItem as Monitor & MonitorListItem;

const ALL = [
  item({ name: "Billing", tags: ["production"] }),
  item({ name: "Docs", tags: ["staging", "a", "b", "c"] }),
];

function Probe() {
  return <p data-testid="search">{useLocation().search}</p>;
}
const renderPage = (route = "/monitors") =>
  renderApp(
    <>
      <MonitorsPage />
      <Probe />
    </>,
    { route },
  );
const lastQuery = () => api.list.mock.calls.at(-1)![0];

beforeEach(() => {
  api.list.mockReset().mockResolvedValue({ items: ALL, nextCursor: null });
  api.tags.mockReset().mockResolvedValue([
    { name: "production", count: 1 },
    { name: "staging", count: 1 },
  ]);
});

describe("MonitorsPage: list, search, filters and sort", () => {
  it("shows every monitor with its tags, and no filter summary", async () => {
    renderPage();
    expect(await screen.findByText("Billing")).toBeVisible();
    expect(screen.getByText("production")).toBeVisible();
    expect(screen.getByText("+1")).toBeVisible(); // only three tags are shown on a row
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
    expect(lastQuery()).toMatchObject({
      status: undefined,
      q: undefined,
      tag: undefined,
      sort: undefined,
    });
  });

  it("searches after a pause in typing, once, and puts the search in the address bar", async () => {
    renderPage();
    await screen.findByText("Billing");
    api.list.mockClear();
    await userEvent.type(screen.getByLabelText("Search"), "bill");
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: "bill" }));
    expect(api.list.mock.calls.filter((c) => c[0].q)).toHaveLength(1); // not one request per key
    expect(screen.getByTestId("search")).toHaveTextContent("?q=bill");
  });

  it("starts from the address bar: a shared link restores search, status, tag and sort", async () => {
    renderPage("/monitors?q=api&status=DOWN&tag=production&sort=slowest");
    await screen.findByText("Billing");
    expect(lastQuery()).toMatchObject({
      q: "api",
      status: "DOWN",
      tag: "production",
      sort: "responseTime",
      order: "desc",
    });
    expect(screen.getByLabelText("Search")).toHaveValue("api");
    expect(screen.getByLabelText("Show")).toHaveValue("DOWN");
    expect(screen.getByLabelText("Tag")).toHaveValue("production");
    expect(screen.getByLabelText("Sort by")).toHaveValue("slowest");
  });

  it("changing the status, the tag or the sort asks the server and updates the address bar", async () => {
    renderPage();
    await screen.findByText("Billing");
    await userEvent.selectOptions(screen.getByLabelText("Show"), "DOWN");
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: "DOWN" }));
    await userEvent.selectOptions(screen.getByLabelText("Tag"), "staging");
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: "DOWN", tag: "staging" }));
    await userEvent.selectOptions(screen.getByLabelText("Sort by"), "name-desc");
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: "name", order: "desc" }));
    expect(screen.getByTestId("search").textContent).toBe(
      "?status=DOWN&tag=staging&sort=name-desc",
    );
  });

  it("the tag filter lists the tags with their counts, and is hidden when there are none", async () => {
    renderPage();
    await screen.findByText("Billing");
    expect(screen.getByRole("option", { name: "production (1)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All tags" })).toBeInTheDocument();
  });

  it("without any tags there is no tag filter", async () => {
    api.tags.mockResolvedValue([]);
    renderPage();
    await screen.findByText("Billing");
    expect(screen.queryByLabelText("Tag")).not.toBeInTheDocument();
  });

  it("says how many match, and 'Clear filters' puts everything back (keeping the sort)", async () => {
    api.list.mockResolvedValue({ items: [ALL[0]], nextCursor: null });
    renderPage("/monitors?q=bill&sort=name-asc");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 monitor matches."));
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(screen.getByTestId("search")).toHaveTextContent(/^\?sort=name-asc$/),
    );
    expect(screen.getByLabelText("Search")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("when more pages exist the count says 'or more'", async () => {
    api.list.mockResolvedValue({ items: ALL, nextCursor: "next" });
    renderPage("/monitors?status=HEALTHY");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("2 or more monitors match."),
    );
  });

  it("no match: a clear message and a way back, not a blank page", async () => {
    api.list.mockResolvedValue({ items: [], nextCursor: null });
    renderPage("/monitors?q=zzz");
    expect(await screen.findByRole("heading", { name: "No monitors match" })).toBeVisible();
    await userEvent.click(screen.getAllByRole("button", { name: "Clear filters" }).at(-1)!);
    await waitFor(() => expect(screen.getByLabelText("Search")).toHaveValue(""));
  });

  it("no monitors at all (no filters) is the first-run empty state with Add monitor", async () => {
    api.list.mockResolvedValue({ items: [], nextCursor: null });
    renderPage();
    expect(await screen.findByRole("heading", { name: "No monitors yet" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Add monitor" }).length).toBeGreaterThan(0);
  });

  it("a failed load shows a retryable error, not an empty list", async () => {
    api.list.mockRejectedValue(new Error("boom"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load your monitors");
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("garbage in the address bar falls back to defaults", async () => {
    renderPage("/monitors?status=EXPLODED&sort=colour");
    await screen.findByText("Billing");
    expect(lastQuery()).toMatchObject({ status: undefined, sort: undefined });
    expect(screen.getByLabelText("Sort by")).toHaveValue("newest");
  });
});