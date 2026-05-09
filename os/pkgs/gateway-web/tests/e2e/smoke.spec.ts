import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.exposeFunction("__ownloomBrowserErrors", () => browserErrors);
});

async function expectNoBrowserErrors(page: { evaluate: <T>(fn: () => T) => Promise<T> }) {
  const errors = await page.evaluate(() => (window as any).__ownloomBrowserErrors());
  expect(errors).toEqual([]);
}

test("personal shell renders the user-mode chat without operator controls", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Ownloom Web");
  await expect(page.getByRole("heading", { name: "Ask Ownloom" })).toBeVisible();
  await expect(page.getByText("Conversation: web-personal-main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pair and remember" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Send/ })).toBeDisabled();

  await expect(page.locator("#pairButton")).toHaveCount(0);
  await expect(page.locator("#terminalFrame")).toHaveCount(0);
  await expect(page.locator("#radicaleFrame")).toHaveCount(0);

  await expectNoBrowserErrors(page);
});

test("admin cockpit supports tab navigation and lazy service frames", async ({ page }) => {
  await page.route("**/radicale/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Radicale fixture</h1>" }));
  await page.route("**/terminal/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Terminal fixture</h1>" }));

  await page.goto("/admin");

  await expect(page).toHaveTitle("Ownloom Cockpit");
  await expect(page.getByRole("heading", { name: "Active thread" })).toBeVisible();
  await expect(page.locator("#connectionState")).toHaveText("disconnected");
  await expect(page.locator("#sendButton")).toBeDisabled();

  await page.getByRole("button", { name: /Threads/ }).click();
  await expect(page.locator("#threadRailToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#threadRail")).toBeHidden();
  await page.getByRole("button", { name: /Threads/ }).click();
  await expect(page.locator("#threadRailToggle")).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("tab", { name: /Planner/ }).click();
  await expect(page).toHaveURL(/\/admin\?tab=organizer$/);
  await expect(page.locator("#tab-organizer")).toBeVisible();
  await expect(page.locator("#radicaleFrame")).toHaveAttribute("src", "/radicale/");

  await page.getByRole("tab", { name: /Shell/ }).click();
  await expect(page).toHaveURL(/\/admin\?tab=terminal$/);
  await expect(page.locator("#tab-terminal")).toBeVisible();
  await expect(page.locator("#terminalFrame")).toHaveAttribute("src", "/terminal/ownloom");

  await page.getByRole("tab", { name: /Trace/ }).click();
  await expect(page.locator("#tab-log")).toBeVisible();

  await expectNoBrowserErrors(page);
});

test("component catalogs render through the static server", async ({ page }) => {
  await page.goto("/components.html");
  await expect(page).toHaveTitle(/Ownloom Component Loom/);
  await expect(page.getByRole("heading", { name: "Ownloom Components" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to admin" })).toHaveAttribute("href", "/admin");

  await page.goto("/components-lit.html");
  await expect(page).toHaveTitle(/Ownloom Lit Component Loom/);
  await expect(page.getByRole("heading", { name: "Ownloom Lit Component Loom" })).toBeVisible();
  await expect(page.locator("ownloom-lit-catalog")).toBeVisible();

  await expectNoBrowserErrors(page);
});

test("server keeps loopback security headers and terminal token endpoint", async ({ request }) => {
  const index = await request.get("/");
  expect(index.ok()).toBeTruthy();
  expect(index.headers()["content-security-policy"]).toContain("default-src 'self'");
  expect(index.headers()["x-content-type-options"]).toBe("nosniff");
  expect(index.headers()["referrer-policy"]).toBe("no-referrer");

  const token = await request.get("/api/v1/terminal-token");
  expect(token.ok()).toBeTruthy();
  expect(token.headers()["cache-control"]).toContain("no-store");
  expect(await token.json()).toEqual({ token: "e2e-zellij-token" });

  const rejected = await request.get("/", { headers: { host: "evil.example" } });
  expect(rejected.status()).toBe(421);
});
