import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The Phase 9 accessibility and responsive pass, made repeatable:  npm run e2e:a11y
//
// For every screen, in light and dark, on a phone, a tablet and a laptop:
//   1. axe-core finds no WCAG 2.0, 2.1 or 2.2 A/AA problems (labels, contrast, names, landmarks, focus order...)
//   2. the page never scrolls sideways
// Plus: every control you can reach with the Tab key shows a focus ring, and nothing animates with "reduce motion" on.

const VIEWPORTS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
] as const;
const SCHEMES = ["light", "dark"] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function scan(page: Page, label: string) {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(" "))
        .join(" | ")}`,
  );
  expect(summary, `accessibility problems on ${label}`).toEqual([]);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, `${label} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
}

async function newAccount(page: Page, withData: boolean) {
  const email = `a11y-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const res = await page.request.post("/api/auth/register", {
    data: { name: "A11y Tester", email, password: "correct-horse-battery" },
  });
  expect(res.status()).toBe(201);
  if (withData) {
    for (const [name, tags] of [
      ["Production API", ["production", "critical"]],
      ["Staging API", ["staging"]],
    ] as const) {
      const created = await page.request.post("/api/monitors", {
        data: { name, url: "http://localhost:4000/api/health", intervalSec: 300, tags },
      });
      expect(created.status()).toBe(201);
      // One finished check, so the monitor's page has a row in its checks table (a wide table is what scrolls on a phone)
      const { monitor } = await created.json();
      expect((await page.request.post(`/api/monitors/${monitor.id}/check`)).status()).toBe(201);
    }
  }
}

for (const vp of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test.describe(`${vp.name}, ${scheme}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme });

      test("public pages", async ({ page }) => {
        for (const path of ["/welcome", "/login", "/register", "/no-such-page"]) {
          await page.goto(path);
          await scan(page, `${path} (${vp.name}, ${scheme})`);
        }
      });

      test("empty states for a brand new account", async ({ page }) => {
        await newAccount(page, false);
        for (const path of ["/", "/monitors", "/incidents"]) {
          await page.goto(path);
          await scan(page, `${path} empty (${vp.name}, ${scheme})`);
        }
      });

      test("signed-in pages with data, the new filters, the tags field and the delete dialog", async ({
        page,
      }) => {
        await newAccount(page, true);
        for (const path of [
          "/",
          "/monitors",
          "/monitors?tag=production&sort=name-asc",
          "/monitors?q=nothing-matches",
          "/monitors/new",
          "/incidents",
          "/settings",
        ]) {
          await page.goto(path);
          await scan(page, `${path} (${vp.name}, ${scheme})`);
        }

        await page.goto("/monitors");
        await page.getByRole("link", { name: "Production API" }).click();
        await expect(page.getByRole("heading", { name: "Production API" })).toBeVisible();
        await scan(page, `monitor detail (${vp.name}, ${scheme})`);

        await page.goto("/monitors/new");
        await page.getByLabel("Tags (optional)").fill("one");
        await page.keyboard.press("Enter");
        await page.getByLabel("Tags (optional)").fill("bad/tag");
        await page.keyboard.press("Enter"); // shows the error message
        await scan(page, `new monitor with tags and an error (${vp.name}, ${scheme})`);

        await page.goto("/settings");
        await page.getByRole("button", { name: "Delete account" }).click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await scan(page, `delete account dialog (${vp.name}, ${scheme})`);
      });
    });
  }
}

test.describe("keyboard and motion", () => {
  test("every control reachable with Tab shows a focus ring", async ({ page }) => {
    await newAccount(page, true);
    for (const path of ["/monitors", "/monitors/new", "/settings"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const withoutRing: string[] = [];
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press("Tab");
        const info = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const s = getComputedStyle(el);
          const ring =
            (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
            (s.boxShadow !== "" && s.boxShadow !== "none");
          return {
            ring,
            name: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName)
              .trim()
              .slice(0, 40),
          };
        });
        if (info && !info.ring) withoutRing.push(info.name);
      }
      expect(withoutRing, `controls without a visible focus ring on ${path}`).toEqual([]);
    }
  });

  test.describe("reduce motion", () => {
    test.use({ reducedMotion: "reduce" });
    test("nothing animates or transitions for more than a blink", async ({ page }) => {
      await newAccount(page, true);
      for (const path of ["/", "/monitors", "/settings"]) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const moving = await page.evaluate(() =>
          [...document.querySelectorAll("*")]
            .filter((e) => {
              const s = getComputedStyle(e);
              return (
                (s.animationName !== "none" && parseFloat(s.animationDuration) > 0.05) ||
                parseFloat(s.transitionDuration) > 0.05
              );
            })
            .slice(0, 5)
            .map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}`),
        );
        expect(moving, `moving elements on ${path}`).toEqual([]);
      }
    });
  });
});
