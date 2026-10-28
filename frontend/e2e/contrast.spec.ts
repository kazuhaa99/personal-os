import { expect, test, type Browser, type Page } from "@playwright/test";
import { contrastFailures, syntheticWallpaper, type ContrastFailure } from "./support/contrast";

// Text must stay readable (WCAG AA) on every screen, in both themes, over any wallpaper, including
// photos people upload: checked on the built-in ones and on synthetic white, black and striped ones.
// E2E_CONTRAST=full runs every wallpaper; the default runs the extremes.

const ADMIN = { login: "e2eadmin", password: process.env.E2E_ADMIN_PASSWORD! };
const SCREENS = ["./", "./tasks", "./goals", "./habits", "./finances/transactions", "./finances/accounts", "./finances/budgets",
  "./finances/recurring", "./finances/installments", "./analytics", "./settings", "./profile"];
const FULL = process.env.E2E_CONTRAST === "full";
const BUILT_IN = FULL ? ["lake", "alpine", "ocean", "night"] : ["lake", "night"];
const SYNTHETIC = (FULL ? ["stripes", "white", "black"] : ["stripes"]) as ("stripes" | "white" | "black")[];
const DESKTOP = { width: 1440, height: 1500 };
const PHONE = { width: 375, height: 1400 };

let state: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

async function open(browser: Browser, theme: "light" | "dark", viewport = DESKTOP) {
  const context = await browser.newContext({ viewport, storageState: state, colorScheme: theme, deviceScaleFactor: 1, locale: "en-US" });
  const page = await context.newPage();
  await page.addInitScript((t) => { localStorage.setItem("pos.theme", t); localStorage.setItem("pos.lang", "en"); }, theme);
  return { context, page };
}

async function check(page: Page, label: string, screens = SCREENS) {
  const found: (ContrastFailure & { screen: string })[] = [];
  for (const path of screens) {
    await page.goto(path);
    await settle(page);
    for (const f of await contrastFailures(page)) found.push({ ...f, screen: path });
  }
  expect(found, `${label}: text below WCAG AA\n${found.map((f) => `  ${f.screen} «${f.text}» ${f.ratio}:1 < ${f.need} (${f.where})`).join("\n")}`).toEqual([]);
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: DESKTOP });
  const page = await context.newPage();
  await page.goto("./");
  await page.getByLabel("Username or email").fill(ADMIN.login);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const demo = await page.request.get("./api/demo");
  if (!(await demo.json()).loaded) expect((await page.request.post("./api/demo")).ok()).toBe(true);
  state = await context.storageState();
  await context.close();
});

for (const theme of ["light", "dark"] as const) {
  for (const wallpaper of BUILT_IN) {
    test(`readable in ${theme} on the ${wallpaper} wallpaper`, async ({ browser }) => {
      const { context, page } = await open(browser, theme);
      await page.addInitScript((w) => localStorage.setItem("pos.wallpaper", w), wallpaper);
      await check(page, `${theme}/${wallpaper}`);
      await context.close();
    });
  }
  for (const kind of SYNTHETIC) {
    test(`readable in ${theme} on an uploaded ${kind} wallpaper`, async ({ browser }) => {
      const { context, page } = await open(browser, theme);
      await page.goto("./settings");
      await settle(page);
      await page.locator("input[type=file]").first().setInputFiles({ name: `${kind}.png`, mimeType: "image/png", buffer: await syntheticWallpaper(page, kind) });
      await expect(page.getByText("Wallpaper updated")).toBeVisible();
      await check(page, `${theme}/${kind}`);
      await context.close();
    });
  }
  test(`readable in ${theme} on a phone`, async ({ browser }) => {
    const { context, page } = await open(browser, theme, PHONE);
    await page.addInitScript(() => localStorage.setItem("pos.wallpaper", "lake"));
    await check(page, `${theme}/phone`);
    await context.close();
  });
  test(`the sign-in screen is readable in ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: PHONE, colorScheme: theme, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.addInitScript((t) => { localStorage.setItem("pos.theme", t); localStorage.setItem("pos.wallpaper", "lake"); }, theme);
    await check(page, `${theme}/sign-in`, ["./"]);
    await context.close();
  });
}
