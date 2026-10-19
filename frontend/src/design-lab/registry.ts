import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { ConceptProps } from "./shared/hooks";
import type { ImageKey } from "./data";

export type ConceptId = "glass" | "editorial" | "ambient" | "native";

export interface ConceptMeta {
  id: ConceptId;
  letter: "A" | "B" | "C" | "D";
  name: string;
  short: string;
  tagline: string;
  description: string;
  keywords: string[];
  type: { display: string; text: string; sample: string; family: string };
  swatches: string[];
  defaultTheme: "dark" | "light";
  cover: ImageKey;
  Component: LazyExoticComponent<ComponentType<ConceptProps>>;
}

export const CONCEPTS: ConceptMeta[] = [
  {
    id: "glass",
    short: "Glass",
    letter: "A",
    name: "Liquid Glass OS",
    tagline: "Spatial glass floating over a living landscape.",
    description:
      "visionOS-style windows and ornaments. Thick, specular glass for the hero balance; calmer regular glass for content; near-opaque material wherever numbers and forms live. A pointer-following light makes surfaces feel physical.",
    keywords: ["Layered translucency", "Ornament navigation", "Shared-element morphs"],
    type: { display: "Inter Tight", text: "Inter Tight", sample: "2 438 750 ₸", family: "'Inter Tight Variable', sans-serif" },
    swatches: ["#0b1418", "#50747a", "#8fd0ff", "#7ee2b0", "#f5f8fb"],
    defaultTheme: "dark",
    cover: "peaks",
    Component: lazy(() => import("./concepts/glass/GlassConcept")),
  },
  {
    id: "editorial",
    short: "Editorial",
    letter: "B",
    name: "Editorial Lifestyle",
    tagline: "Your life as a beautifully set magazine.",
    description:
      "A daily issue with a masthead, serif display type and asymmetrical photo-led spreads. Money is set like a feature column with hairline rules instead of boxes; goals become cover stories you can open.",
    keywords: ["Serif display type", "Photo-led spreads", "Curtain page transitions"],
    type: { display: "Fraunces", text: "Inter", sample: "The October Issue", family: "'Fraunces Variable', serif" },
    swatches: ["#f3efe7", "#1b1a17", "#b4532a", "#4a6b5a", "#d9cfbf"],
    defaultTheme: "light",
    cover: "walker",
    Component: lazy(() => import("./concepts/editorial/EditorialConcept")),
  },
  {
    id: "ambient",
    short: "Ambient",
    letter: "C",
    name: "Ambient Spatial OS",
    tagline: "Step into a calm, cinematic environment.",
    description:
      "A full-bleed night scene with drifting light. Widgets float at different depths and respond to the pointer with parallax; the interface emphasises what matters now and dims the rest. Navigation lives in a magnifying dock.",
    keywords: ["Depth & parallax", "Focus emphasis", "Fly-through transitions"],
    type: { display: "Sora", text: "Sora", sample: "Now · 10:00", family: "'Sora Variable', sans-serif" },
    swatches: ["#070a17", "#1b2550", "#9db4ff", "#ffb38a", "#e9ecff"],
    defaultTheme: "dark",
    cover: "earth",
    Component: lazy(() => import("./concepts/ambient/AmbientConcept")),
  },
  {
    id: "native",
    short: "Native",
    letter: "D",
    name: "Premium Native",
    tagline: "Restrained, dense, impeccably crafted.",
    description:
      "A refined macOS-style app: vibrant sidebar, unified toolbar, a ⌘K command palette and an inspector. High information density with precise tables, small-multiples and sober color — luxury through polish, not effects.",
    keywords: ["Information density", "Command palette", "Inspector panel"],
    type: { display: "SF Pro / Inter", text: "SF Pro / Inter", sample: "⌘K  Search everything", family: "-apple-system, 'Inter Variable', sans-serif" },
    swatches: ["#f6f6f7", "#1d1d1f", "#0a84ff", "#30d158", "#e5e5ea"],
    defaultTheme: "light",
    cover: "arches",
    Component: lazy(() => import("./concepts/native/NativeConcept")),
  },
];

export const conceptById = (id: string | undefined) => CONCEPTS.find((c) => c.id === id);
