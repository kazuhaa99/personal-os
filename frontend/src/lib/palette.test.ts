import { describe, expect, it } from "vitest";
import { accentFor, contrast, pickVivid, type RGB } from "./palette";

/** Build RGBA pixel data from [colour, count] runs. */
function pixels(...runs: [RGB, number][]): Uint8ClampedArray {
  const out: number[] = [];
  for (const [[r, g, b], n] of runs) for (let i = 0; i < n; i++) out.push(r, g, b, 255);
  return new Uint8ClampedArray(out);
}

const hue = ([r, g, b]: RGB) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe("pickVivid", () => {
  it("prefers a vivid colour over a larger dull area", () => {
    // mostly grey-brown, with a clear magenta-pink accent (like a stage photo)
    const c = pickVivid(pixels([[110, 100, 95], 700], [[225, 30, 110], 250], [[20, 20, 20], 50]));
    expect(c).not.toBeNull();
    expect(hue(c!)).toBeGreaterThan(315); // pink/magenta, not the brown average
  });

  it("returns null for images without colour (b/w, fog)", () => {
    expect(pickVivid(pixels([[128, 128, 128], 500], [[240, 240, 240], 300], [[15, 15, 15], 200]))).toBeNull();
  });

  it("ignores transparent pixels", () => {
    const data = pixels([[0, 120, 255], 100]);
    for (let i = 3; i < data.length; i += 4) data[i] = 0;
    expect(pickVivid(data)).toBeNull();
  });
});

describe("accentFor", () => {
  const WHITE: RGB = [255, 255, 255];
  const DARK_BG: RGB = [10, 10, 14];
  const samples: RGB[] = [[225, 30, 110], [255, 230, 0], [0, 200, 120], [120, 200, 255], [90, 20, 160]];

  it.each(samples)("light theme: readable on white and as a button (%s,%s,%s)", (...c) => {
    const a = accentFor(c as RGB, "light");
    expect(contrast(a.accent, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(a.ink, a.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(samples)("dark theme: readable on the dark background (%s,%s,%s)", (...c) => {
    const a = accentFor(c as RGB, "dark");
    expect(contrast(a.accent, DARK_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(a.ink, a.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the hue of the source colour", () => {
    const src: RGB = [225, 30, 110];
    expect(Math.abs(hue(accentFor(src, "light").accent) - hue(src))).toBeLessThan(6);
    expect(Math.abs(hue(accentFor(src, "dark").accent) - hue(src))).toBeLessThan(6);
  });
});

describe("contrast", () => {
  it("matches WCAG reference values", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(contrast([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
  });
});
