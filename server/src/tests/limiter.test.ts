import { describe, expect, it } from "vitest";
import { createLimiter } from "../utils/limiter.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createLimiter", () => {
  it("never runs more than `max` tasks at once and finishes them all", async () => {
    const limiter = createLimiter(3);
    let running = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        limiter.run(async () => {
          running++;
          peak = Math.max(peak, running);
          await sleep(10);
          running--;
          return i;
        }),
      ),
    );
    expect(peak).toBe(3);
    expect(results).toEqual(Array.from({ length: 12 }, (_, i) => i));
    expect(limiter.active).toBe(0);
    expect(limiter.pending).toBe(0);
  });

  it("a failing task rejects its own promise and does not block the queue", async () => {
    const limiter = createLimiter(1);
    const bad = limiter.run(async () => {
      throw new Error("boom");
    });
    const good = limiter.run(async () => "fine");
    await expect(bad).rejects.toThrow("boom");
    await expect(good).resolves.toBe("fine");
  });

  it("a task that throws synchronously is handled too", async () => {
    const limiter = createLimiter(1);
    const bad = limiter.run((() => {
      throw new Error("sync boom");
    }) as () => Promise<never>);
    await expect(bad).rejects.toThrow("sync boom");
    await expect(limiter.run(async () => 1)).resolves.toBe(1);
  });
});