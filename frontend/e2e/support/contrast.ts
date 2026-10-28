import type { Page } from "@playwright/test";

// WCAG contrast measured on the pixels actually behind each piece of text: the app's glass lets the
// wallpaper through, so CSS colours alone can't tell whether text is readable.

export interface ContrastFailure { text: string; ratio: number; need: number; where: string }
interface TextBox { x: number; y: number; w: number; h: number; rgba: number[]; large: boolean; text: string; where: string }

/** Visible text in the viewport with its colour (opacity included); disabled controls are exempt (WCAG 1.4.3). */
function collect(): TextBox[] {
  const out: TextBox[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent?.trim()) continue;
    seen.add(el);
    if (el.closest("[disabled],[aria-disabled='true'],[aria-hidden='true']")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 4 || r.height < 6 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    // Skip text that is covered (the phone tab bar) or cut off by a scroll area: it isn't what people read.
    const visible = (x: number, y: number) => { const hit = document.elementFromPoint(x, y); return !!hit && (hit === el || el.contains(hit)); };
    if (!visible(r.left + 1, r.top + 1) || !visible(r.right - 1, r.bottom - 1)) continue;
    let opacity = 1;
    for (let e: Element | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    if (opacity === 0) continue;
    const rgba = (cs.color.match(/[\d.]+/g) ?? []).map(Number);
    if (rgba.length === 3) rgba.push(1);
    rgba[3] *= opacity;
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const where = [el.parentElement, el].filter(Boolean).map((e) => `${e!.tagName.toLowerCase()}.${String(e!.className).split(" ").slice(0, 3).join(".")}`).join(" > ");
    out.push({ x: r.left, y: r.top, w: r.width, h: r.height, rgba, large: size >= 24 || (size >= 18.66 && weight >= 700), text: n.textContent.trim().slice(0, 50), where });
  }
  return out;
}

async function measure([png, boxes]: [string, TextBox[]]): Promise<ContrastFailure[]> {
  const img = new Image();
  img.src = `data:image/png;base64,${png}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const scale = img.width / innerWidth;
  const lum = (r: number, g: number, b: number) => {
    const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const failures: ContrastFailure[] = [];
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x * scale)), y0 = Math.max(0, Math.floor(b.y * scale));
    const w = Math.min(img.width - x0, Math.ceil(b.w * scale)), h = Math.min(img.height - y0, Math.ceil(b.h * scale));
    if (w <= 0 || h <= 0) continue;
    const data = ctx.getImageData(x0, y0, w, h).data;
    const [tr, tg, tb, ta] = b.rgba;
    const ratios: number[] = [];
    for (let i = 0; i < data.length; i += 16) {
      const [br, bg, bb] = [data[i], data[i + 1], data[i + 2]];
      const lt = lum(tr * ta + br * (1 - ta), tg * ta + bg * (1 - ta), tb * ta + bb * (1 - ta));
      const lb = lum(br, bg, bb);
      ratios.push((Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05));
    }
    ratios.sort((p, q) => p - q);
    const worst = ratios[Math.floor(ratios.length * 0.05)];
    const need = b.large ? 3 : 4.5;
    if (worst < need) failures.push({ text: b.text, ratio: Math.round(worst * 100) / 100, need, where: b.where });
  }
  return failures;
}

/** Text in the viewport whose worst-case contrast (5th percentile of its background) is below WCAG AA. */
export async function contrastFailures(page: Page): Promise<ContrastFailure[]> {
  const boxes = await page.evaluate(collect);
  if (!boxes.length) throw new Error(`no text found to measure on ${page.url()}`); // never pass by measuring nothing
  const hide = await page.addStyleTag({ content: "*{transition:none!important;animation:none!important;color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}::placeholder{color:transparent!important}svg{visibility:hidden!important}" });
  await page.waitForTimeout(50);
  const png = (await page.screenshot()).toString("base64");
  await hide.evaluate((s) => s.remove());
  return page.evaluate(measure, [png, boxes] as [string, TextBox[]]);
}

/** A test wallpaper drawn in the page: "white", "black", or "stripes" (black and white bands, the hardest case). */
export async function syntheticWallpaper(page: Page, kind: "white" | "black" | "stripes"): Promise<Buffer> {
  const url = await page.evaluate((k) => {
    const c = document.createElement("canvas");
    c.width = 1600; c.height = 1000;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = k === "black" ? "#000" : "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    if (k === "stripes") { ctx.fillStyle = "#000"; for (let x = 0; x < c.width; x += 160) ctx.fillRect(x, 0, 80, c.height); }
    return c.toDataURL("image/png");
  }, kind);
  return Buffer.from(url.split(",")[1], "base64");
}
