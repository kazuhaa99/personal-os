// Accent colour from the wallpaper (macOS / Material You style).
// pickVivid finds the photo's most vivid recurring colour — not its average, which for most
// photos is a muddy brown; accentFor then moves only its lightness until it reads well in the
// current theme (WCAG AA 4.5:1 as text on the page and with its own ink on buttons).

export type RGB = [number, number, number];

// ------------------------------------------------------------------ colour maths

function toHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function luminance([r, g, b]: RGB): number {
  const ch = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrast(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ------------------------------------------------------------------ extraction

const BINS = 24; // 15° hue buckets

/** Most vivid recurring colour of RGBA pixel data, or null when the image has hardly any colour. */
export function pickVivid(data: Uint8ClampedArray): RGB | null {
  const weight = new Float64Array(BINS), sumR = new Float64Array(BINS), sumG = new Float64Array(BINS), sumB = new Float64Array(BINS);
  let counted = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    counted++;
    const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
    const [h, s, l] = toHsl(rgb);
    if (s < 0.3 || l < 0.15 || l > 0.88) continue;
    // Saturated, mid-lightness pixels count most.
    const w = s * s * (1 - Math.abs(l - 0.5) * 1.4);
    const bin = Math.floor(h / (360 / BINS)) % BINS;
    weight[bin] += w; sumR[bin] += rgb[0] * w; sumG[bin] += rgb[1] * w; sumB[bin] += rgb[2] * w;
  }
  if (!counted) return null;
  // Pick the strongest hue, letting neighbours vote so a colour split across two bins still wins.
  let best = -1, bestScore = 0;
  for (let b = 0; b < BINS; b++) {
    const score = weight[b] + 0.5 * (weight[(b + 1) % BINS] + weight[(b + BINS - 1) % BINS]);
    if (score > bestScore) { bestScore = score; best = b; }
  }
  // Too little colour overall (b/w photo, fog): keep the default accent.
  if (best < 0 || weight[best] / counted < 0.04) return null;
  const w = weight[best];
  return [Math.round(sumR[best] / w), Math.round(sumG[best] / w), Math.round(sumB[best] / w)];
}

/**
 * Decode an image small and read its pixels. Same-origin or blob: URLs only.
 * fetch + createImageBitmap rather than new Image().decode(): a detached <img> that is also
 * being loaded by the page could leave decode() pending forever.
 */
export async function vividFromImage(src: string, size = 48): Promise<RGB | null> {
  const blob = await (await fetch(src)).blob();
  const bitmap = await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: "low" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    return pickVivid(ctx.getImageData(0, 0, size, size).data);
  } finally {
    bitmap.close();
  }
}

// ------------------------------------------------------------------ theming

const WHITE: RGB = [255, 255, 255];
const NEAR_BLACK: RGB = [10, 10, 14];
const PAGE = { light: WHITE, dark: NEAR_BLACK } as const;

export interface Accent { accent: RGB; ink: RGB }

/**
 * Same hue, lightness moved until the colour is readable as text on the page (4.5:1),
 * with white or near-black ink on accent buttons — whichever reads better.
 */
export function accentFor(source: RGB, theme: "light" | "dark"): Accent {
  const [h, s0] = toHsl(source);
  const s = Math.min(0.95, Math.max(0.6, s0));
  const page = PAGE[theme];
  // Start where the default accents sit (light ≈ 50%, dark ≈ 60% lightness) and only move
  // further — darker on light pages, lighter on dark ones — while contrast is short.
  const steps = theme === "light" ? [0.5, -0.01, 0.15] : [0.6, 0.01, 0.92];
  let accent = fromHsl(h, s, steps[0]);
  for (let l = steps[0]; theme === "light" ? l >= steps[2] : l <= steps[2]; l += steps[1]) {
    accent = fromHsl(h, s, l);
    if (contrast(accent, page) >= 4.5) break;
  }
  const ink = contrast(WHITE, accent) >= contrast(NEAR_BLACK, accent) ? WHITE : NEAR_BLACK;
  return { accent, ink };
}

export const triplet = ([r, g, b]: RGB) => `${r} ${g} ${b}`;
