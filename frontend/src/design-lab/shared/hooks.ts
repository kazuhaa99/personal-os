import { useEffect, useRef, useState, type RefObject } from "react";
import type { Screen } from "../data";

export interface ConceptProps {
  theme: "dark" | "light";
  screen: Screen;
  onScreen: (s: Screen) => void;
  /** Rendered inside a scaled gallery/compare frame (lighter effects). */
  preview?: boolean;
}

/** Sets --mx/--my (px) on the element so CSS can paint a pointer-following light. */
export function useSheen<T extends HTMLElement>(): RefObject<T> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        // getBoundingClientRect is in screen px; divide by the scale so it also works inside scaled frames
        const sx = r.width / el.offsetWidth || 1;
        el.style.setProperty("--mx", `${(e.clientX - r.left) / sx}px`);
        el.style.setProperty("--my", `${(e.clientY - r.top) / sx}px`);
      });
    };
    el.addEventListener("pointermove", onMove);
    return () => { el.removeEventListener("pointermove", onMove); cancelAnimationFrame(raf); };
  }, []);
  return ref;
}

/** Normalised pointer position (-1..1) over an element, for parallax. */
export function useParallax<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  const [p, setP] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setP({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 });
      });
    };
    const reset = () => setP({ x: 0, y: 0 });
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", reset);
    return () => { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerleave", reset); cancelAnimationFrame(raf); };
  }, [enabled]);
  return { ref, p };
}

/** Closes a popover on outside click / Escape. */
export function useDismiss(open: boolean, close: () => void, ref: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open, close, ref]);
}

export function groupByDay<T extends { date: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) map.set(it.date, [...(map.get(it.date) ?? []), it]);
  return [...map.entries()];
}
