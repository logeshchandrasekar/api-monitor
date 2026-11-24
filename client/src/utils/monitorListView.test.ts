import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  SORT_OPTIONS,
  hasActiveFilters,
  parseView,
  viewToParams,
  viewToQuery,
} from "./monitorListView";

describe("parseView", () => {
  it("an empty address bar is the default view", () => {
    expect(parseView(new URLSearchParams())).toEqual(DEFAULT_VIEW);
  });

  it("reads every field", () => {
    const view = parseView(
      new URLSearchParams("q=billing&status=DOWN&tag=production&sort=name-desc"),
    );
    expect(view).toEqual({ q: "billing", status: "DOWN", tag: "production", sort: "name-desc" });
  });

  it("ignores values it does not know instead of breaking the page", () => {
    const view = parseView(new URLSearchParams("status=EXPLODED&sort=colour"));
    expect(view.status).toBe("");
    expect(view.sort).toBe("newest");
  });

  it("cuts an absurdly long search and tag to what the server accepts", () => {
    const view = parseView(new URLSearchParams(`q=${"a".repeat(500)}&tag=${"b".repeat(500)}`));
    expect(view.q).toHaveLength(100);
    expect(view.tag).toHaveLength(30);
  });
});

describe("viewToParams", () => {
  it("leaves out everything that is still the default", () => {
    expect(viewToParams(DEFAULT_VIEW).toString()).toBe("");
  });

  it("writes only what was changed, and trims the search", () => {
    const params = viewToParams({ ...DEFAULT_VIEW, q: "  api  ", sort: "slowest" });
    expect(params.toString()).toBe("q=api&sort=slowest");
  });

  it("round-trips through the address bar", () => {
    const view = {
      q: "client a",
      status: "HEALTHY" as const,
      tag: "client a",
      sort: "checked" as const,
    };
    expect(parseView(new URLSearchParams(viewToParams(view).toString()))).toEqual(view);
  });
});

describe("viewToQuery", () => {
  it("'newest' sends no sort, so the server keeps its original path", () => {
    expect(viewToQuery(DEFAULT_VIEW)).toEqual({
      status: "",
      q: undefined,
      tag: undefined,
      sort: undefined,
      order: undefined,
    });
  });

  it.each(SORT_OPTIONS.filter((o) => o.sort))(
    "%j maps to a sort and an order the server understands",
    (option) => {
      const query = viewToQuery({ ...DEFAULT_VIEW, sort: option.id });
      expect(query.sort).toBe(option.sort);
      expect(query.order).toBe(option.order);
    },
  );

  it("an empty or blank search is not sent", () => {
    expect(viewToQuery({ ...DEFAULT_VIEW, q: "   " }).q).toBeUndefined();
  });
});

describe("hasActiveFilters", () => {
  it("a search, a status or a tag narrows the list; a sort order does not", () => {
    expect(hasActiveFilters(DEFAULT_VIEW)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_VIEW, sort: "name-asc" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_VIEW, q: "x" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_VIEW, q: "   " })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_VIEW, status: "DOWN" })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_VIEW, tag: "prod" })).toBe(true);
  });
});