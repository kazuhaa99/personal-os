import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import type { Screen } from "./data";
import type { ConceptMeta } from "./registry";

/**
 * Renders a live concept at a virtual desktop size (default 1440×900) and scales
 * it to fit the container, so previews are pixel-faithful and still interactive.
 * Mounts lazily when near the viewport to keep the gallery light.
 */
export function ScaledFrame({ concept, theme, screen, onScreen, width = 1440, height = 900, eager, className, overlay, fill }: {
  concept: ConceptMeta; theme: "dark" | "light"; screen: Screen; onScreen: (s: Screen) => void;
  width?: number; height?: number; eager?: boolean; className?: string; overlay?: ReactNode;
  /** Fill the parent's height: virtual height adapts so the preview uses all available space. */
  fill?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [boxH, setBoxH] = useState(0);
  const [visible, setVisible] = useState(!!eager);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { setScale(e.contentRect.width / width); setBoxH(e.contentRect.height); });
    ro.observe(el);
    let io: IntersectionObserver | undefined;
    if (!eager) {
      io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "400px" });
      io.observe(el);
    }
    return () => { ro.disconnect(); io?.disconnect(); };
  }, [width, eager]);

  const { Component } = concept;
  const virtualH = fill && boxH ? boxH / scale : height;
  return (
    <div ref={box} className={className} style={{ position: "relative", width: "100%", ...(fill ? { height: "100%" } : { aspectRatio: `${width} / ${height}` }), overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width, height: virtualH, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        {visible ? (
          <Suspense fallback={<FrameLoading />}>
            <Component theme={theme} screen={screen} onScreen={onScreen} preview />
          </Suspense>
        ) : <FrameLoading />}
      </div>
      {overlay}
    </div>
  );
}

export function FrameLoading() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#0d0d10", color: "#8a8a94", fontSize: 14 }}>
      Loading concept…
    </div>
  );
}
