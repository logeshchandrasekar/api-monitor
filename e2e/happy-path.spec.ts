import { expect, test, type Page } from "@playwright/test";

// A request the browser reports as "Failed to load resource" is an HTTP error answer (the 401 for "nobody is
// logged in" is normal). Anything else printed to the console as an error is a bug.
const isExpectedNoise = (text: string) => /Failed to load resource/i.test(text);

test("the whole journey: sign up, monitor, pause, settings, sign out and in, delete everything", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on(
    "console",
    (m) => m.type() === "error" && !isExpectedNoise(m.text()) && consoleErrors.push(m.text()),
  );
  page.on("pageerror", (e) => consoleErrors.push(`uncaught: ${e.message}`));

  const stamp = Date.now();
  const email = `e2e-${stamp}@example.com`;
  const password = "correct-horse-battery";
  const monitorName = `E2E health ${stamp}`;

  // ---- Sign up -------------------------------------------------------------------------------
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("No monitors yet")).toBeVisible(); // the empty state

  // ---- Add a monitor that watches the API itself ----------------------------------------------
  await page.getByRole("link", { name: "Add monitor" }).first().click();
  await expect(page.getByRole("heading", { name: "Add monitor" })).toBeVisible();

  // An empty required field is refused with a message, nothing is sent
  await page.getByLabel("Name").fill("");
  await page.getByRole("button", { name: "Create monitor" }).click();
  await expect(page.getByText("Enter a name.")).toBeVisible();

  await page.getByLabel("Name").fill(monitorName);
  await page.getByLabel("URL").fill("http://localhost:4000/api/health");
  await page.getByLabel("Check every").selectOption({ label: "10 s" }); // development only
  await page.getByRole("button", { name: "Create monitor" }).click();

  // ---- It is checked and turns healthy ---------------------------------------------------------
  await expect(page.getByRole("heading", { name: monitorName })).toBeVisible();
  await expect(page.getByText("Healthy").first()).toBeVisible({ timeout: 40_000 });

  // A manual check works and shows up in the history, labelled as manual
  await page.getByRole("button", { name: "Check now" }).click();
  await expect(page.getByRole("cell", { name: /manual/i }).first()).toBeVisible();

  // ---- Pause and resume ------------------------------------------------------------------------
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByText("Paused").first()).toBeVisible();
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();

  // ---- The monitor list and the dashboard see it -----------------------------------------------
  await page.getByRole("link", { name: "Monitors", exact: true }).first().click();
  await expect(page.getByRole("link", { name: monitorName })).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).first().click();
  await expect(page.getByText(monitorName).first()).toBeVisible();

  // ---- Settings --------------------------------------------------------------------------------
  await page.getByRole("link", { name: "Settings", exact: true }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("E2E Renamed");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: /E2E Renamed/ })).toBeVisible();

  // ---- Delete the monitor (it asks first) ------------------------------------------------------
  await page.getByRole("link", { name: "Monitors", exact: true }).first().click();
  await page.getByRole("link", { name: monitorName }).click();
  await page.getByRole("button", { name: /more/i }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog")).toContainText(`Delete "${monitorName}"?`);
  await page.getByRole("button", { name: "Delete monitor" }).click();
  await expect(page.getByText("No monitors yet")).toBeVisible();

  // ---- Sign out and back in --------------------------------------------------------------------
  await logout(page);
  await login(page, email, password);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  // ---- Delete the account ----------------------------------------------------------------------
  await page.getByRole("link", { name: "Settings", exact: true }).first().click();
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel("Your password").fill("not-the-password");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("That is not your password.")).toBeVisible();
  await page.getByLabel("Your password").fill(password);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();

  // The account really is gone
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Incorrect email or password.");

  // ---- Nothing was printed as an error along the way -------------------------------------------
  expect(consoleErrors, "console errors during the journey").toEqual([]);
});

async function logout(page: Page) {
  await page.getByRole("button", { name: /E2E Renamed/ }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/); // a logout from inside the app lands on the sign-in page
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}
