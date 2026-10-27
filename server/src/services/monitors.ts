import { PLAN_LIMITS, allowedIntervals, formatInterval, type PlanName } from "../config/plans.js";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import type {
  CreateMonitorInput,
  ListMonitorsQuery,
  UpdateMonitorInput,
} from "../schemas/monitor.js";
import { decrypt, encrypt } from "../utils/crypto.js";
import { AppError } from "../utils/errors.js";
import { decryptHeaders, encryptHeaders, headersKey, resolveHeaders } from "../utils/headers.js";
import { validateTargetUrl } from "../utils/url-guard.js";

export type Owner = { id: string; plan: PlanName };

const notFound = () => new AppError(404, "NOT_FOUND", "Monitor not found.");

const fieldError = (path: string, message: string, code = "VALIDATION_ERROR") =>
  new AppError(400, code, message, [{ location: "body", path, message }]);

const limitError = (plan: PlanName) =>
  new AppError(
    403,
    "MONITOR_LIMIT_REACHED",
    `Monitor limit reached (${PLAN_LIMITS[plan].maxMonitors} on the ${plan} plan). Upgrade your plan to add more monitors.`,
  );

/** First check happens within 0-10% of the interval, so monitors created together do not fire together. */
const firstCheckAt = (intervalSec: number) =>
  new Date(Date.now() + Math.random() * 0.1 * intervalSec * 1000);

const dedupe = (tags: string[]) => [...new Set(tags)];

/** Every monitor read goes through here: ownership is part of the query (SEC-4). */
async function findOwned(userId: string, id: string) {
  const monitor = await prisma.monitor.findFirst({ where: { id, userId } });
  if (!monitor) throw notFound();
  return monitor;
}

export type MonitorRow = Awaited<ReturnType<typeof findOwned>>;

/** Rules that depend on several fields at once (and on the plan), checked on create and on update. */
function assertConfig(
  cfg: { method: string; body: string | null; intervalSec: number; timeoutMs: number },
  plan: PlanName,
) {
  if (cfg.body && (cfg.method === "GET" || cfg.method === "HEAD")) {
    throw fieldError("body", `${cfg.method} requests cannot have a body.`);
  }

  const intervals = allowedIntervals(plan);
  if (!intervals.includes(cfg.intervalSec)) {
    throw fieldError(
      "intervalSec",
      `This interval is not available on the ${plan} plan. Choose one of: ${intervals.map(formatInterval).join(", ")}.`,
      "INTERVAL_NOT_ALLOWED",
    );
  }
  if (cfg.timeoutMs >= cfg.intervalSec * 1000) {
    throw fieldError("timeoutMs", "Timeout must be shorter than the check interval.");
  }
  if (cfg.timeoutMs > PLAN_LIMITS[plan].maxTimeoutMs) {
    throw fieldError(
      "timeoutMs",
      `Timeout cannot exceed ${PLAN_LIMITS[plan].maxTimeoutMs / 1000} seconds.`,
    );
  }
}

/**
 * Plan-limit enforcement. The user row is locked for the duration of the transaction, so
 * parallel requests cannot both pass the count check and exceed the limit.
 */
async function insertWithinLimit(
  owner: Owner,
  data: Omit<Prisma.MonitorUncheckedCreateInput, "userId">,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner.id} FOR UPDATE`;
    const count = await tx.monitor.count({ where: { userId: owner.id } });
    if (count >= PLAN_LIMITS[owner.plan].maxMonitors) throw limitError(owner.plan);
    return tx.monitor.create({ data: { ...data, userId: owner.id } });
  });
}

/** Back to "never checked": used after a material edit and on resume. */
const freshState = (now: Date) => ({
  status: "PENDING" as const,
  failStreak: 0,
  slowStreak: 0,
  okStreak: 0,
  lastCheckedAt: null,
  lastStatusCode: null,
  lastResponseTimeMs: null,
  lastStatusChangeAt: null,
  nextCheckAt: now,
});

export async function listMonitors(userId: string, query: ListMonitorsQuery) {
  const where: Prisma.MonitorWhereInput = { userId };
  if (query.status === "PAUSED") where.isPaused = true;
  else if (query.status) Object.assign(where, { status: query.status, isPaused: false });

  const rows = await prisma.monitor.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  return { items, nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null };
}

export const getMonitor = (userId: string, id: string) => findOwned(userId, id);

export async function createMonitor(owner: Owner, input: CreateMonitorInput) {
  const url = await validateTargetUrl(input.url);
  const headers = resolveHeaders(input.headers ?? [], []);
  const body = input.body || null;
  const method = input.method ?? "GET";
  const timeoutMs = input.timeoutMs ?? Math.min(10_000, Math.floor(input.intervalSec * 800));

  assertConfig({ method, body, intervalSec: input.intervalSec, timeoutMs }, owner.plan);

  return insertWithinLimit(owner, {
    name: input.name,
    description: input.description ?? null,
    url: url.href,
    method,
    headersEnc: encryptHeaders(headers),
    bodyEnc: body ? encrypt(body) : null,
    expectedStatus: input.expectedStatus ?? 200,
    followRedirects: input.followRedirects ?? true,
    intervalSec: input.intervalSec,
    timeoutMs,
    responseThresholdMs: input.responseThresholdMs ?? 1000,
    tags: dedupe(input.tags ?? []),
    nextCheckAt: firstCheckAt(input.intervalSec),
  });
}

export async function updateMonitor(owner: Owner, id: string, input: UpdateMonitorInput) {
  const existing = await findOwned(owner.id, id);
  const existingHeaders = decryptHeaders(existing.headersEnc);
  const existingBody = existing.bodyEnc ? decrypt(existing.bodyEnc) : null;

  const url = input.url !== undefined ? (await validateTargetUrl(input.url)).href : existing.url;
  const method = input.method ?? existing.method;
  const headers =
    input.headers !== undefined ? resolveHeaders(input.headers, existingHeaders) : existingHeaders;
  const body = input.body !== undefined ? input.body || null : existingBody;
  const expectedStatus = input.expectedStatus ?? existing.expectedStatus;
  const followRedirects = input.followRedirects ?? existing.followRedirects;
  const intervalSec = input.intervalSec ?? existing.intervalSec;
  const timeoutMs = input.timeoutMs ?? existing.timeoutMs;

  assertConfig({ method, body, intervalSec, timeoutMs }, owner.plan);

  // A "material" edit changes what is being checked, so old streaks and incidents no longer apply (ENG-5)
  const material =
    url !== existing.url ||
    method !== existing.method ||
    expectedStatus !== existing.expectedStatus ||
    followRedirects !== existing.followRedirects ||
    headersKey(headers) !== headersKey(existingHeaders) ||
    body !== existingBody;

  const now = new Date();
  const soonest = new Date(now.getTime() + intervalSec * 1000);

  // TODO(Phase 4): when `material` is true, also resolve open incidents with CONFIG_CHANGED
  return prisma.monitor.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      url,
      method,
      headersEnc: encryptHeaders(headers),
      bodyEnc: body ? encrypt(body) : null,
      expectedStatus,
      followRedirects,
      intervalSec,
      timeoutMs,
      responseThresholdMs: input.responseThresholdMs ?? existing.responseThresholdMs,
      tags: input.tags ? dedupe(input.tags) : existing.tags,
      ...(material
        ? freshState(now)
        : intervalSec !== existing.intervalSec
          ? { nextCheckAt: existing.nextCheckAt < soonest ? existing.nextCheckAt : soonest }
          : {}),
    },
  });
}

export async function deleteMonitor(userId: string, id: string) {
  const { count } = await prisma.monitor.deleteMany({ where: { id, userId } });
  if (count === 0) throw notFound();
}

export async function pauseMonitor(userId: string, id: string) {
  const monitor = await findOwned(userId, id);
  if (monitor.isPaused) return monitor;
  // TODO(Phase 4): resolve open incidents with PAUSED
  return prisma.monitor.update({ where: { id }, data: { isPaused: true } });
}

export async function resumeMonitor(userId: string, id: string) {
  const monitor = await findOwned(userId, id);
  if (!monitor.isPaused) return monitor;
  return prisma.monitor.update({
    where: { id },
    data: { isPaused: false, ...freshState(new Date()) },
  });
}

export async function duplicateMonitor(owner: Owner, id: string) {
  const src = await findOwned(owner.id, id);
  const name = src.name.length > 93 ? src.name.slice(0, 93) : src.name;
  return insertWithinLimit(owner, {
    name: `${name} (copy)`,
    description: src.description,
    url: src.url,
    method: src.method,
    headersEnc: src.headersEnc,
    bodyEnc: src.bodyEnc,
    expectedStatus: src.expectedStatus,
    followRedirects: src.followRedirects,
    intervalSec: src.intervalSec,
    timeoutMs: src.timeoutMs,
    responseThresholdMs: src.responseThresholdMs,
    failureThreshold: src.failureThreshold,
    slowThreshold: src.slowThreshold,
    tags: src.tags,
    nextCheckAt: firstCheckAt(src.intervalSec),
  });
}
