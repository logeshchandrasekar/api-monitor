import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, setUnauthorizedHandler, withQuery } from "./api";

const fetchMock = vi.fn();

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setUnauthorizedHandler(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("request basics", () => {
  it("sends the cookie, asks for JSON and returns the parsed body", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, { items: [], nextCursor: null })));
    const data = await api.get("/monitors");
    expect(data).toEqual({ items: [], nextCursor: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/monitors",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
  });

  it("sends a JSON body with a Content-Type on POST", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(201, { ok: true })));
    await api.post("/monitors", { name: "x" });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe('{"name":"x"}');
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("a POST without a body still sends {} as JSON (the server rejects non-JSON bodies with 415)", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, { ok: true })));
    await api.post("/monitors/1/pause");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe("{}");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("a GET sends no body and no Content-Type", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, {})));
    await api.get("/health");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
  });

  it("returns undefined for an empty 204 answer", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 204 })));
    await expect(api.delete("/monitors/1")).resolves.toBeUndefined();
  });
});

describe("errors", () => {
  it("turns the standard error body into an ApiError", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        json(
          404,
          { error: { code: "NOT_FOUND", message: "Monitor not found." } },
          { "x-request-id": "req-1" },
        ),
      ),
    );
    const err = await api.get("/monitors/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Monitor not found.",
      requestId: "req-1",
    });
  });

  it("keeps validation details", async () => {
    const details = [{ path: ["email"], message: "Invalid email" }];
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        json(400, { error: { code: "VALIDATION_ERROR", message: "Invalid input", details } }),
      ),
    );
    const err = (await api.post("/auth/login", {}).catch((e: unknown) => e)) as ApiError;
    expect(err.details).toEqual(details);
  });

  it("a dead network becomes ApiError status 0, not a raw TypeError", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("Failed to fetch")));
    const err = await api.get("/monitors").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: "NETWORK_ERROR" });
  });

  it("an HTML error page (for example a proxy 502) becomes a BAD_RESPONSE ApiError", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response("<html>Bad gateway</html>", { status: 502 })),
    );
    const err = await api.get("/monitors").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 502, code: "BAD_RESPONSE" });
  });

  it("lets an aborted request through as an AbortError", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new DOMException("aborted", "AbortError")));
    await expect(api.get("/monitors")).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("401 handling", () => {
  const unauthorized = () =>
    Promise.resolve(json(401, { error: { code: "UNAUTHENTICATED", message: "Please log in." } }));

  it("calls the registered handler on a 401", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockImplementation(unauthorized);
    await expect(api.get("/monitors")).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does NOT call it when the caller opted out (login, /auth/me, logout)", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockImplementation(unauthorized);
    await expect(
      api.post("/auth/login", {}, { skipUnauthorizedHandler: true }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call it for other errors (a 400 is not an expired session)", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        json(400, {
          error: { code: "INVALID_CURRENT_PASSWORD", message: "Current password is incorrect." },
        }),
      ),
    );
    await expect(api.post("/users/me/password", {})).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("withQuery", () => {
  it("skips undefined, null and empty values and encodes the rest", () => {
    expect(withQuery("/monitors", { limit: 20, status: undefined, cursor: null, q: "" })).toBe(
      "/monitors?limit=20",
    );
    expect(withQuery("/monitors", { q: "a b&c" })).toBe("/monitors?q=a+b%26c");
    expect(withQuery("/monitors", {})).toBe("/monitors");
  });
});
