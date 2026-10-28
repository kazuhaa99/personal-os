import { expect, test, type Page } from "@playwright/test";

// Keyboard focus, touch target size and reduced motion, on the screens people use most.
const ADMIN = { login: "e2eadmin", password: process.env.E2E_ADMIN_PASSWORD! };
const SCREENS = ["./", "./tasks", "./goals", "./habits", "./finances/transactions", "./finances/accounts", "./finances/budgets",
  "./finances/recurring", "./finances/installments", "./analytics", "./settings", "./profile"];

async function signIn(page: Page) {
  await page.goto("./");
  await page.getByLabel("Username or email").fill(ADMIN.login);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

test("every focused control shows a solid ring at least 2px wide", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page);
  const weak: string[] = [];
  for (const path of ["./", "./tasks", "./finances/transactions", "./settings"]) {
    await page.goto(path);
    await settle(page);
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const alpha = Number((cs.outlineColor.match(/[\d.]+/g) ?? [])[3] ?? 1);
        const ok = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2 && alpha === 1;
        return ok ? "" : `${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}» outline ${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`;
      });
      if (ring) weak.push(`${path} ${ring}`);
    }
  }
  expect([...new Set(weak)]).toEqual([]);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test("every control has a 44×44 tap area of its own", async ({ page }) => {
    await signIn(page);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const small: string[] = [];
    for (const path of SCREENS) {
      await page.goto(path);
      await settle(page);
      small.push(...(await page.evaluate((where) => {
        const out: string[] = [];
        const controls = document.querySelectorAll<HTMLElement>("a[href],button,input:not([type=hidden]),select,textarea,[role=tab],[role=checkbox],[role=switch],[role=radio]");
        const clipped = (el: Element, r: DOMRect) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            if (getComputedStyle(p).overflowX === "visible") continue;
            const b = p.getBoundingClientRect();
            if (r.left < b.left - 1 || r.right > b.right + 1) return true; // partly scrolled out of view
          }
          return false;
        };
        for (const control of controls) {
          // A checkbox or radio inside a label is tapped through the whole label.
          const el = (control.matches("input[type=checkbox],input[type=radio]") && control.closest("label")) || control;
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          if (!r.width || !r.height || cs.visibility === "hidden" || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
          if (el.closest("[aria-hidden='true'],[inert]") || (el.tagName === "A" && el.closest("p"))) continue; // inline links in text are exempt
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const own = (x: number, y: number) => {
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true; // the screen edge isn't another control
            const hit = document.elementFromPoint(x, y);
            if (!hit) return false;
            if (hit === el || el.contains(hit)) return true;
            // A floating bar (the phone tab bar) over the edge: the page scrolls the control out from under it.
            const fixedLayer = (e: Element | null) => { for (; e; e = e.parentElement) if (getComputedStyle(e).position === "fixed") return e; return null; };
            return fixedLayer(hit) !== null && fixedLayer(hit) !== fixedLayer(el);
          };
          if (!own(cx, cy) || clipped(el, r)) continue; // covered by another layer, or partly scrolled away
          const probes = [[-21, 0], [21, 0], [0, -21], [0, 21]];
          const miss = probes.find(([dx, dy]) => !own(cx + dx, cy + dy));
          if (miss) {
            const other = document.elementFromPoint(cx + miss[0], cy + miss[1]);
            out.push(`${where} ${el.tagName.toLowerCase()} «${(el.getAttribute("aria-label") || el.textContent || el.getAttribute("type") || "").trim().slice(0, 28)}» ${Math.round(r.width)}×${Math.round(r.height)} (at ${miss}: ${other?.tagName.toLowerCase()}.${String(other?.className).split(" ")[0]})`);
          }
        }
        return out;
      }, path)));
    }
    expect([...new Set(small)]).toEqual([]);
  });
});

test.describe("on a phone in long languages", () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  for (const lang of ["ru", "ko"]) {
    test(`page titles fit the header in ${lang}`, async ({ page }) => {
      await page.addInitScript((l) => localStorage.setItem("pos.lang", l), lang);
      await page.goto("./");
      await page.locator("input[autocomplete=username]").fill(ADMIN.login);
      await page.locator("input[type=password]").fill(ADMIN.password);
      await page.locator("form button[type=submit]").click();
      await page.locator("main").waitFor();
      const cut: string[] = [];
      for (const path of SCREENS) {
        await page.goto(path);
        await settle(page);
        cut.push(...(await page.evaluate((where) => [...document.querySelectorAll<HTMLElement>("header h1, header p")]
          .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
          .map((el) => `${where} «${el.textContent}»`), path)));
      }
      expect(cut).toEqual([]);
    });
  }
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing slides or scales", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page);
    await settle(page);
    // Watch while doing what animates: moving between pages and switching tabs.
    const watch = () => page.evaluate(async () => {
      const name = (el: Element | null) => (el?.className ? `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}` : el?.outerHTML.slice(0, 90) ?? "?");
      // Per element, the transforms seen: an animation passes through several, an instant change only two.
      const values = new Map<HTMLElement, Set<string>>();
      const sample = () => { for (const el of document.querySelectorAll<HTMLElement>("[style]")) { if (!values.has(el)) values.set(el, new Set()); values.get(el)!.add(el.style.transform); } };
      const seen = new Set<string>();
      for (let i = 0; i < 25; i++) {
        for (const a of document.getAnimations()) {
          const effect = a.effect as KeyframeEffect | null;
          const duration = Number(effect?.getComputedTiming().duration ?? 0);
          if (duration > 50 && effect?.getKeyframes().some((k) => "transform" in k || "translate" in k || "scale" in k)) seen.add(name(effect.target as Element));
        }
        sample();
        await new Promise((r) => setTimeout(r, 30));
      }
      for (const [el, seenValues] of values) if (seenValues.size >= 3 && /translate|scale/.test([...seenValues].join())) seen.add(name(el));
      return [...seen];
    });
    const moving: string[] = [];
    for (const [link, tab] of [["Tasks", "Upcoming"], ["Analytics", "12 months"]]) {
      const watching = watch();
      await page.getByRole("link", { name: link, exact: true }).first().click();
      moving.push(...(await watching).map((m) => `${link}: ${m}`));
      await settle(page);
      const again = watch();
      await page.getByRole("tab", { name: tab }).click();
      moving.push(...(await again).map((m) => `${tab}: ${m}`));
    }
    expect(moving).toEqual([]);
  });
});
