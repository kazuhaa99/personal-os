# Personal OS — Design Lab

An isolated, interactive exploration of four visual directions for Personal OS.
Route: **`/design-lab`** (gallery) · `/design-lab/:concept` (full screen) · `/design-lab/compare?a=…&b=…`.

The lab is lazy-loaded and fully separated from the production app:

- It **never calls the API** and never touches real records (verified: zero `/api` requests while clicking through every concept, screen and theme).
- All figures come from one shared, clearly labelled sample dataset (`data.ts`) — every concept shows a "Demo data" badge.
- Concept styles are scoped under a root class (`.ga-`, `.eb-`, `.ac-`, `.nd-`) with low-specificity resets (`:where()`), so nothing leaks into the app or other concepts.
- Fonts (Inter, Inter Tight, Fraunces, Sora) are self-hosted via `@fontsource-variable` and only load with the lab.
- Photos are bundled under `public/design-lab/img` (see `public/design-lab/CREDITS.md`); each has a sampled fallback colour so nothing breaks if an image fails.

## Structure

```
design-lab/
  DesignLab.tsx      routes + MotionConfig (respects prefers-reduced-motion)
  Gallery.tsx        landing: four large live previews (scaled 1440×900 frames), per-preview screen tabs + light/dark
  Viewer.tsx         full-screen concept with lab bar: switch concept (1–4), screen, theme (T), focus mode (F), Esc → gallery
  Compare.tsx        two concepts side by side, screens synced or independent
  Frame.tsx          ScaledFrame — renders a concept at a virtual desktop size and scales it (lazy-mounted)
  registry.ts        concept metadata (name, palette, type, description)
  data.ts            shared sample data (demo)
  shared/            useLab (in-memory state + quick-add validation), charts (SVG with animated reveals + tooltips),
                     Photo (image with fallback), motion presets, hooks (pointer sheen, parallax, dismiss)
  concepts/<name>/   one component + one scoped stylesheet per concept
```

## Concepts

| | Concept | Identity | Signature interactions |
|---|---|---|---|
| A | **Liquid Glass OS** | visionOS-style window + floating ornaments over a dark alpine photo (light: lake). Three material tiers: thick specular glass for the hero balance, regular glass for content, near-opaque glass under lists, forms and popovers. Inter Tight. | Pointer-following specular light; ornament tab pill morphs between items; quick-add **morphs out of the dock button** (shared element); goal photo cards **expand into a detail view** (shared element); transaction sheet slides in; blur-crossfade page transitions. |
| B | **Editorial Lifestyle** | A daily "issue": masthead, Fraunces display serif, paper & ink, hairline rules instead of boxes, asymmetric photo-led spreads. Light paper by default, ink-dark variant. | **Curtain-wipe** page transitions; masked line-by-line headline reveals; animated strike-through on tasks; goal covers **expand into a full-bleed spread**; margin-note drawer for transactions; quick entry slides up like a sheet of paper. |
| C | **Ambient Spatial OS** | A cinematic environment: night planet horizon (NASA city lights) with drifting aurora (light: dawn ocean). Floating widgets at different depths around a central "Now" orb. Sora. | **Parallax** on pointer; the camera **pans across the scene** between spaces; **fly-through** (zoom + blur) transitions; **magnifying dock**; Focus mode dims everything but what matters now; **3D coverflow** of goals → portal detail; quick add springs out of the dock. |
| D | **Premium Native** | Refined macOS app: vibrant sidebar over wallpaper, unified toolbar, dense tables, sober colour, system typography. Light by default, true dark variant. | **⌘K command palette** (arrow keys + Enter); split "New" button with menu; **sortable** transactions table with **↑/↓ keyboard selection** and an **inspector** pane; collapsible sidebar; quick add as a **sheet that drops from the toolbar**; crisp micro-transitions. |

Every concept implements: dashboard, money overview, transaction list + detail, goals + detail, tasks (views, add, complete,
empty states), quick-add transaction with validation (empty amount, >2 decimals, missing category → inline errors + shake),
popover/dropdown, modal/drawer, loading skeletons (refresh), hover/press states, active navigation, chart tooltips, light & dark.

## Implemented vs simulated

- **Implemented (real, in the browser):** all navigation, screen/theme switching, task completion/reopening and adding,
  habit check-ins, transaction filtering/search/sorting, detail drawers, goal detail, command palette, quick-add validation,
  all animations and transitions, responsive layouts (container queries; checked at 1440×900 and 390×844).
- **Simulated:** data is a static sample; anything you add or toggle lives only in memory for that preview and resets on reload.
  "Refresh" shows a loading state without a network call. No concept persists anything or talks to the backend.
- **Not yet built:** the chosen concept is not applied to the production app — that happens after you pick a direction.

## Keyboard

Viewer: `1`–`4` switch concept (circle-wipe from the switcher) · `T` light/dark · `F` focus mode · `Esc` back to gallery.
Concept D: `⌘/Ctrl + K` palette · `⌘/Ctrl + N` new transaction · `↑/↓` in the transactions table.
