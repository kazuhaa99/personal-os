import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// Runs in order against a fresh database; each test leaves the browser signed out.
test.describe.configure({ mode: "serial" });

const ADMIN = { login: "e2eadmin", password: process.env.E2E_ADMIN_PASSWORD! };
const USER = { login: `e2e_${Date.now().toString(36)}`, password: "e2e correct horse" };
const EMAIL = `${USER.login}@example.com`;

async function signIn(page: Page, identifier: string, password: string) {
  await page.goto("./");
  await page.getByLabel("Username or email").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const overview = (page: Page) => page.getByRole("heading", { name: "Overview" });

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(overview(page)).toBeHidden();
}

/** The API runs with POS_MAIL_DEV_LOG: confirmation emails land in its log. */
async function codeFor(email: string): Promise<string> {
  let code = "";
  await expect.poll(() => {
    const log = readFileSync("e2e/.out/api.log", "utf8");
    const at = log.lastIndexOf(`email to ${email}`);
    code = at >= 0 ? (log.slice(at).match(/\b(\d{6})\b/)?.[1] ?? "") : "";
    return code;
  }, { timeout: 15_000 }).not.toBe("");
  return code;
}

test("signing out returns to the login page", async ({ page }) => {
  await signIn(page, ADMIN.login, ADMIN.password);
  await expect(overview(page)).toBeVisible();
  await signOut(page);
  // and it sticks after a reload: the session cookie is gone
  await page.reload();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("register, confirm the email code, sign in by email", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Create one" }).click();
  await page.getByLabel("Username", { exact: true }).fill(USER.login); // exact: the sign-in form is still fading out
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await page.getByLabel("Password (8+ characters)").fill(USER.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  await page.getByLabel("Digit 1").fill(await codeFor(EMAIL)); // a full code typed/pasted into the first box submits
  await expect(overview(page)).toBeVisible();
  await signOut(page);

  await signIn(page, EMAIL.toUpperCase(), USER.password);
  await expect(overview(page)).toBeVisible();
  await signOut(page);
});

test("profile: personal info is saved", async ({ page }) => {
  await signIn(page, USER.login, USER.password);
  await page.locator('a[href$="/profile"]').first().click();
  await expect(page.getByText(USER.login).first()).toBeVisible();
  const first = page.getByLabel("First name");
  await first.fill("Ada");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Profile saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("First name")).toHaveValue("Ada");
  await signOut(page);
});

test("server errors come back in the chosen language", async ({ page }) => {
  await page.goto("./");
  const r = await page.request.post("api/auth/login", { data: { identifier: "x" }, headers: { "Accept-Language": "ru" } });
  expect(r.status()).toBe(422);
  expect((await r.json()).error.message).toBe("Пароль: Обязательное поле");

  await page.getByRole("radio", { name: "Русский" }).click();
  await page.getByLabel("Логин или почта").fill(USER.login);
  await page.getByLabel("Пароль", { exact: true }).fill("wrong password");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByText("Неверный логин или пароль")).toBeVisible();
  await page.getByRole("radio", { name: "English" }).click();
});

test("delete account removes it for good", async ({ page }) => {
  await signIn(page, USER.login, USER.password);
  await page.locator('a[href$="/profile"]').first().click();
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Current password").fill(USER.password);
  const confirm = dialog.getByRole("button", { name: "Delete forever" });
  await expect(confirm).toBeDisabled(); // until the login is typed
  await dialog.getByLabel(/Type your login/).fill(USER.login);
  await confirm.click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  await signIn(page, USER.login, USER.password);
  await expect(page.getByText("Wrong username or password")).toBeVisible();
});

test("accent colour follows the wallpaper and can be switched off", async ({ page }) => {
  await signIn(page, ADMIN.login, ADMIN.password);
  await expect(overview(page)).toBeVisible(); // let the sign-in finish before navigating
  await page.goto("./settings");
  await page.getByRole("radio", { name: "Moraine Lake" }).click(); // a wallpaper with clear colour
  const accent = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--accent"));
  await expect.poll(accent).not.toBe("");
  const fromWallpaper = await accent();
  await page.getByRole("tab", { name: "Standard blue" }).click();
  await expect.poll(accent).toBe("");
  await page.getByRole("tab", { name: "From wallpaper" }).click();
  await expect.poll(accent).toBe(fromWallpaper);
  // remembered for the next visit, applied before React starts
  await page.reload();
  expect(await accent()).toBe(fromWallpaper);
  await signOut(page);
});

test("phone width: no sideways scroll, tab bar visible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, ADMIN.login, ADMIN.password);
  await expect(overview(page)).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test.describe("PWA under its own path", () => {
  test.use({ serviceWorkers: "allow" });

  test("service worker is scoped to the app and never caches the API", async ({ page, baseURL }) => {
    const base = new URL(baseURL!).pathname; // "/" or "/prefix/"
    await page.goto("./");
    const sw = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      await new Promise((r) => setTimeout(r, 500));
      const keys = await caches.keys();
      const urls = (await Promise.all(keys.map(async (k) => (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)))).flat();
      return { scope: new URL(reg.scope).pathname, urls };
    });
    expect(sw.scope).toBe(base); // a prefixed app must not control the host site's other pages
    expect(sw.urls.length).toBeGreaterThan(0);
    expect(sw.urls.every((u) => u.startsWith(base))).toBe(true);
    expect(sw.urls.some((u) => u.startsWith(`${base}api/`))).toBe(false);

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toBe(`${base}manifest.webmanifest`);
    const manifest = await (await page.request.get(manifestHref!)).json();
    for (const icon of manifest.icons) {
      expect((await page.request.get(new URL(icon.src, new URL(manifestHref!, baseURL)).href)).status()).toBe(200);
    }
  });
});

test("the web app runs under a strict Content Security Policy", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()); });
  await signIn(page, ADMIN.login, ADMIN.password);
  await expect(overview(page)).toBeVisible();
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(csp).toContain("script-src 'self';");
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toMatch(/^(light|dark)$/);
  for (const path of ["tasks", "goals", "habits", "finances", "finances/budgets", "analytics", "settings", "profile"]) {
    await page.goto(`./${path}`);
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
  await signOut(page);
});
