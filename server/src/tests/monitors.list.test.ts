import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma.js";
import { registerAgent, type Agent } from "./helpers.js";

// Phase 9: search, tag filter, sorting and the tag list on GET /api/monitors

type Spec = {
  name: string;
  url?: string;
  tags?: string[];
  status?: "PENDING" | "HEALTHY" | "DEGRADED" | "DOWN";
  paused?: boolean;
  lastCheckedMinutesAgo?: number;
  responseMs?: number;
};

async function seed(agent: Agent, specs: Spec[]) {
  const ids: Record<string, string> = {};
  for (const [i, s] of specs.entries()) {
    const res = await agent.post("/api/monitors").send({
      name: s.name,
      url: s.url ?? `https://8.8.8.8/${i}`,
      intervalSec: 300,
      tags: s.tags ?? [],
    });
    expect(res.status).toBe(201);
    ids[s.name] = res.body.monitor.id;
    await prisma.monitor.update({
      where: { id: res.body.monitor.id },
      data: {
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)), // creation order = list order
        status: s.status ?? "PENDING",
        isPaused: s.paused ?? false,
        lastCheckedAt:
          s.lastCheckedMinutesAgo === undefined
            ? null
            : new Date(Date.now() - s.lastCheckedMinutesAgo * 60_000),
        lastResponseTimeMs: s.responseMs ?? null,
      },
    });
  }
  return ids;
}

const names = (res: { body: { items: { name: string }[] } }) => res.body.items.map((m) => m.name);

const FLEET: Spec[] = [
  {
    name: "Production API",
    url: "https://8.8.8.8/prod",
    tags: ["production", "critical"],
    status: "HEALTHY",
    lastCheckedMinutesAgo: 1,
    responseMs: 120,
  },
  {
    name: "staging api",
    url: "https://8.8.4.4/staging",
    tags: ["staging"],
    status: "DEGRADED",
    lastCheckedMinutesAgo: 5,
    responseMs: 900,
  },
  {
    name: "Billing service",
    url: "https://1.1.1.1/billing",
    tags: ["production", "client a"],
    status: "DOWN",
    lastCheckedMinutesAgo: 2,
    responseMs: 30,
  },
  {
    name: "Docs site",
    url: "https://1.0.0.1/docs",
    tags: [],
    status: "HEALTHY",
    lastCheckedMinutesAgo: 10,
    responseMs: 300,
  },
  {
    name: "Paused thing",
    url: "https://9.9.9.9/x",
    tags: ["staging"],
    status: "HEALTHY",
    paused: true,
    lastCheckedMinutesAgo: 60,
    responseMs: 50,
  },
  { name: "Brand new", url: "https://149.112.112.112/new", tags: [], status: "PENDING" },
];

async function fleet() {
  const agent = await registerAgent("fleet@example.com", "PRO");
  const ids = await seed(agent, FLEET);
  return { agent, ids };
}

describe("search (q)", () => {
  it("matches the name, case-insensitively, anywhere in it", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?q=api"))).toEqual([
      "staging api",
      "Production API",
    ]);
    expect(names(await agent.get("/api/monitors?q=BILLING"))).toEqual(["Billing service"]);
    expect(names(await agent.get("/api/monitors?q=ice"))).toEqual(["Billing service"]);
  });

  it("matches the URL", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?q=1.1.1.1"))).toEqual(["Billing service"]);
    expect(names(await agent.get("/api/monitors?q=/docs"))).toEqual(["Docs site"]);
  });

  it("matches a tag (whole or part of it)", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?q=critical"))).toEqual(["Production API"]);
    expect(names(await agent.get("/api/monitors?q=crit"))).toEqual(["Production API"]); // part of a tag counts
    expect(names(await agent.get(`/api/monitors?q=${encodeURIComponent("client a")}`))).toEqual([
      "Billing service",
    ]);
  });

  it("treats % and _ as plain characters, not wildcards", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?q=%25"))).toEqual([]);
    expect(names(await agent.get("/api/monitors?q=_"))).toEqual([]);
    expect(names(await agent.get("/api/monitors?q=%25%25%25"))).toEqual([]);
  });

  it("an empty or blank search means no search", async () => {
    const { agent } = await fleet();
    expect((await agent.get("/api/monitors?q=")).body.items).toHaveLength(6);
    expect((await agent.get("/api/monitors?q=%20%20")).body.items).toHaveLength(6);
  });

  it("finds nothing when nothing matches, with no cursor", async () => {
    const { agent } = await fleet();
    const res = await agent.get("/api/monitors?q=zzz-nothing");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it("combines with the status filter", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?q=api&status=DEGRADED"))).toEqual(["staging api"]);
    expect(names(await agent.get("/api/monitors?q=api&status=DOWN"))).toEqual([]);
    expect(names(await agent.get("/api/monitors?status=PAUSED"))).toEqual(["Paused thing"]);
  });

  it("never reaches another user's monitors", async () => {
    const { agent } = await fleet();
    const other = await registerAgent("other@example.com", "PRO");
    await seed(other, [{ name: "Secret production", tags: ["production"] }]);
    expect(names(await agent.get("/api/monitors?q=secret"))).toEqual([]);
    expect(names(await agent.get("/api/monitors?tag=production"))).not.toContain(
      "Secret production",
    );
  });

  it("rejects a search longer than 100 characters", async () => {
    const { agent } = await fleet();
    const res = await agent.get(`/api/monitors?q=${"a".repeat(101)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("tag filter (tag)", () => {
  it("returns exactly the monitors that carry the tag", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?tag=production")).sort()).toEqual([
      "Billing service",
      "Production API",
    ]);
    expect(names(await agent.get("/api/monitors?tag=staging")).sort()).toEqual([
      "Paused thing",
      "staging api",
    ]);
  });

  it("is case-insensitive and does not match half a tag", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?tag=PRODUCTION"))).toHaveLength(2);
    expect(names(await agent.get("/api/monitors?tag=prod"))).toEqual([]);
  });

  it("combines with search, status and sort", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?tag=production&q=api"))).toEqual([
      "Production API",
    ]);
    expect(names(await agent.get("/api/monitors?tag=production&status=DOWN"))).toEqual([
      "Billing service",
    ]);
    expect(names(await agent.get("/api/monitors?tag=production&sort=name"))).toEqual([
      "Billing service",
      "Production API",
    ]);
  });

  it("a tag nobody uses is an empty list, not an error", async () => {
    const { agent } = await fleet();
    expect((await agent.get("/api/monitors?tag=nope")).body.items).toEqual([]);
  });
});

describe("sorting (sort, order)", () => {
  it("without sort the order is unchanged: newest first", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors"))).toEqual([
      "Brand new",
      "Paused thing",
      "Docs site",
      "Billing service",
      "staging api",
      "Production API",
    ]);
  });

  it("name: A to Z ignoring case, Z to A on request", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?sort=name"))).toEqual([
      "Billing service",
      "Brand new",
      "Docs site",
      "Paused thing",
      "Production API",
      "staging api",
    ]);
    expect(names(await agent.get("/api/monitors?sort=name&order=desc"))).toEqual([
      "staging api",
      "Production API",
      "Paused thing",
      "Docs site",
      "Brand new",
      "Billing service",
    ]);
  });

  it("status: worst first by default (down, degraded, pending, healthy, paused)", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?sort=status"))).toEqual([
      "Billing service",
      "staging api",
      "Brand new",
      "Docs site",
      "Production API",
      "Paused thing",
    ]);
    expect(names(await agent.get("/api/monitors?sort=status&order=desc"))[0]).toBe("Paused thing");
  });

  it("lastChecked: most recent first; never-checked monitors are last in both directions", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?sort=lastChecked"))).toEqual([
      "Production API",
      "Billing service",
      "staging api",
      "Docs site",
      "Paused thing",
      "Brand new",
    ]);
    const asc = names(await agent.get("/api/monitors?sort=lastChecked&order=asc"));
    expect(asc[0]).toBe("Paused thing");
    expect(asc.at(-1)).toBe("Brand new");
  });

  it("responseTime: slowest first by default; monitors with no response yet are last", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?sort=responseTime"))).toEqual([
      "staging api",
      "Docs site",
      "Production API",
      "Paused thing",
      "Billing service",
      "Brand new",
    ]);
    const asc = names(await agent.get("/api/monitors?sort=responseTime&order=asc"));
    expect(asc[0]).toBe("Billing service");
    expect(asc.at(-1)).toBe("Brand new");
  });

  it("created: newest first, oldest first on request", async () => {
    const { agent } = await fleet();
    expect(names(await agent.get("/api/monitors?sort=created"))[0]).toBe("Brand new");
    expect(names(await agent.get("/api/monitors?sort=created&order=asc"))[0]).toBe(
      "Production API",
    );
  });

  it("pages through a sorted list with the cursor: every monitor once, in order", async () => {
    const { agent } = await fleet();
    const all = names(await agent.get("/api/monitors?sort=name"));
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const res: { body: { items: { name: string }[]; nextCursor: string | null } } =
        await agent.get(`/api/monitors?sort=name&limit=2${cursor ? `&cursor=${cursor}` : ""}`);
      seen.push(...names(res));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(all);
  });

  it("the last page has no cursor, and a filter applies to every page", async () => {
    const { agent } = await fleet();
    const first = await agent.get("/api/monitors?sort=name&tag=production&limit=1");
    expect(names(first)).toEqual(["Billing service"]);
    const second = await agent.get(
      `/api/monitors?sort=name&tag=production&limit=1&cursor=${first.body.nextCursor}`,
    );
    expect(names(second)).toEqual(["Production API"]);
    expect(second.body.nextCursor).toBeNull();
  });

  it("a cursor that is not in the user's list (deleted, or someone else's) gives an empty page", async () => {
    const { agent } = await fleet();
    const other = await registerAgent("other@example.com", "PRO");
    const ids = await seed(other, [{ name: "theirs" }]);
    const res = await agent.get(`/api/monitors?sort=name&cursor=${ids.theirs}`);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it("rejects an unknown sort or order", async () => {
    const { agent } = await fleet();
    expect((await agent.get("/api/monitors?sort=colour")).status).toBe(400);
    expect((await agent.get("/api/monitors?sort=name&order=sideways")).status).toBe(400);
  });

  it("items keep the same shape as before (uptime and recent ticks included)", async () => {
    const { agent } = await fleet();
    const [first] = (await agent.get("/api/monitors?sort=name")).body.items;
    expect(first).toHaveProperty("uptime24h");
    expect(first).toHaveProperty("recent");
    expect(first).toHaveProperty("tags");
  });
});

describe("GET /api/monitors/tags", () => {
  it("lists the user's tags with counts, most used first, then A to Z", async () => {
    const { agent } = await fleet();
    const res = await agent.get("/api/monitors/tags");
    expect(res.status).toBe(200);
    expect(res.body.tags).toEqual([
      { name: "production", count: 2 },
      { name: "staging", count: 2 },
      { name: "client a", count: 1 },
      { name: "critical", count: 1 },
    ]);
  });

  it("is empty for a user without tags, and never shows other users' tags", async () => {
    const agent = await registerAgent("plain@example.com", "PRO");
    const other = await registerAgent("tagged@example.com", "PRO");
    await seed(other, [{ name: "x", tags: ["private"] }]);
    expect((await agent.get("/api/monitors/tags")).body).toEqual({ tags: [] });
  });

  it("answers 401 without a session", async () => {
    const { default: request } = await import("supertest");
    const { createApp } = await import("../app.js");
    expect((await request(createApp()).get("/api/monitors/tags")).status).toBe(401);
  });
});

describe("tags on create and update (unchanged rules)", () => {
  it("are lower-cased and de-duplicated, up to 10 per monitor", async () => {
    const agent = await registerAgent("rules@example.com", "PRO");
    const ok = await agent.post("/api/monitors").send({
      name: "t",
      url: "https://8.8.8.8/",
      intervalSec: 300,
      tags: ["Prod", "prod", "EU West"],
    });
    expect(ok.body.monitor.tags).toEqual(["prod", "eu west"]);
    const tooMany = await agent.post("/api/monitors").send({
      name: "t2",
      url: "https://8.8.8.8/",
      intervalSec: 300,
      tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
    });
    expect(tooMany.status).toBe(400);
    const bad = await agent
      .patch(`/api/monitors/${ok.body.monitor.id}`)
      .send({ tags: ["no/slashes"] });
    expect(bad.status).toBe(400);
  });
});
