// Fails if a t("…") / tp("…") key used in src/ has no Russian or Korean entry.
// Usage: npm run i18n:check
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) return f === "design-lab" || f === "locales" ? [] : walk(p);
  return /\.(tsx?)$/.test(f) && !/\.test\./.test(f) && f !== "i18n.tsx" ? [p] : [];
});

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;
const used = new Map();
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(new RegExp(String.raw`\bt[p]?\(\s*` + STR, "g"))) {
    const key = JSON.parse(`"${m[1]}"`);
    if (!used.has(key)) used.set(key, file.replace(SRC, ""));
  }
}

const keysOf = (lang) => {
  const dir = join(SRC, "lib/locales", lang);
  const keys = new Set();
  for (const f of readdirSync(dir)) {
    for (const m of readFileSync(join(dir, f), "utf8").matchAll(new RegExp(String.raw`^\s*` + STR + String.raw`\s*:`, "gm"))) keys.add(JSON.parse(`"${m[1]}"`));
  }
  return keys;
};

let missing = 0;
for (const lang of ["ru", "ko"]) {
  const keys = keysOf(lang);
  for (const [key, file] of used) {
    if (!keys.has(key)) { missing++; console.log(`[${lang}] missing: ${JSON.stringify(key)}  (${file})`); }
  }
}
console.log(`${used.size} keys used, ${missing} missing translations`);
process.exit(missing ? 1 : 0);
