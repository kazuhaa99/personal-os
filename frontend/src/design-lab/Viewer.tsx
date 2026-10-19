import { AnimatePresence, motion } from "framer-motion";
import { Suspense, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { SCREENS, type Screen } from "./data";
import { FrameLoading } from "./Frame";
import { CompareLink, LabBar, ScreenTabs, ThemeButton } from "./LabBar";
import { CONCEPTS, conceptById, type ConceptId } from "./registry";

type Rect = { top: number; left: number; right: number; bottom: number };

export function Viewer() {
  const { conceptId } = useParams();
  const concept = conceptById(conceptId);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Rect } | null)?.from;
  const switcherRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [focusMode, setFocusMode] = useState(false);

  const screen = (SCREENS.some((s) => s.id === params.get("screen")) ? params.get("screen") : "dashboard") as Screen;
  const theme = (params.get("theme") === "light" || params.get("theme") === "dark" ? params.get("theme") : concept?.defaultTheme ?? "dark") as "dark" | "light";
  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => next.set(k, v));
    setParams(next, { replace: true, state: null });
  };

  function switchTo(id: ConceptId, el?: HTMLElement | null) {
    if (!concept || id === concept.id) return;
    const r = el?.getBoundingClientRect();
    setOrigin(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: 0 });
    const next = conceptById(id)!;
    navigate(`/design-lab/${id}?screen=${screen}&theme=${next.defaultTheme}`, { replace: true });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 4) switchTo(CONCEPTS[n - 1].id, switcherRef.current?.querySelectorAll("button")[n - 1] as HTMLElement);
      if (e.key.toLowerCase() === "t") update({ theme: theme === "dark" ? "light" : "dark" });
      if (e.key.toLowerCase() === "f") setFocusMode((f) => !f);
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) navigate("/design-lab", { state: { focus: concept?.id } });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!concept) return <Navigate to="/design-lab" replace />;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { Component } = concept;

  return (
    <div className={`lab-viewer ${focusMode ? "is-focus" : ""}`}>
      {!focusMode && (
        <LabBar right={<><ThemeButton theme={theme} onToggle={() => update({ theme: theme === "dark" ? "light" : "dark" })} /><CompareLink a={concept.id} b={CONCEPTS[(CONCEPTS.indexOf(concept) + 1) % 4].id} /><button className="lab-theme" onClick={() => setFocusMode(true)} title="Hide lab controls (F)">Focus</button></>}>
          <div className="lab-switch" ref={switcherRef} role="tablist" aria-label="Concepts">
            {CONCEPTS.map((c) => (
              <button key={c.id} role="tab" aria-selected={c.id === concept.id} onClick={(e) => switchTo(c.id, e.currentTarget)} title={`${c.name} (${c.letter === "A" ? 1 : c.letter === "B" ? 2 : c.letter === "C" ? 3 : 4})`}>
                {c.id === concept.id && <motion.span layoutId="lab-switch-pill" className="lab-tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <span><b>{c.letter}</b> {c.short}</span>
              </button>
            ))}
          </div>
          <ScreenTabs id="viewer" value={screen} onChange={(s) => update({ screen: s })} />
        </LabBar>
      )}
      {focusMode && <button className="lab-unfocus" onClick={() => setFocusMode(false)}>Show lab controls (F)</button>}

      <div className="lab-viewport">
        <AnimatePresence initial={!!from}>
          <motion.div
            key={concept.id}
            className="lab-layer"
            initial={from
              ? { clipPath: `inset(${from.top - 52}px ${vw - from.right}px ${vh - from.bottom}px ${from.left}px round 22px)` }
              : origin ? { clipPath: `circle(0px at ${origin.x}px ${origin.y - 52}px)` } : false}
            animate={{ clipPath: from ? `inset(0px 0px 0px 0px round 0px)` : `circle(${Math.hypot(vw, vh)}px at ${origin?.x ?? vw / 2}px ${(origin?.y ?? 0) - 52}px)` }}
            exit={{ scale: 0.94, filter: "brightness(0.45)", transition: { duration: 0.85, ease: [0.65, 0, 0.35, 1] } }}
            transition={{ duration: from ? 0.75 : 0.85, ease: [0.65, 0, 0.35, 1] }}
            style={{ zIndex: 1 }}
          >
            <Suspense fallback={<FrameLoading />}>
              <Component theme={theme} screen={screen} onScreen={(s) => update({ screen: s })} />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
