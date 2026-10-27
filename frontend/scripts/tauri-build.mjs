// `tauri build` with the release CSP limited to VITE_API_BASE (see native-csp.mjs).
// Usage: VITE_API_BASE=https://pos.example.com/api node scripts/tauri-build.mjs --bundles app
import { spawnSync } from "node:child_process";
import { nativeCsp } from "./native-csp.mjs";

const config = JSON.stringify({ app: { security: { csp: nativeCsp(process.env.VITE_API_BASE) } } });
const tauri = spawnSync("npx", ["tauri", "build", "--config", config, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(tauri.status ?? 1);
