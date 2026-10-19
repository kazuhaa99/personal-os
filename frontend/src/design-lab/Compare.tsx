import { motion } from "framer-motion";
import { Link2, Link2Off, Maximize2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SCREENS, type Screen } from "./data";
import { ScaledFrame } from "./Frame";
import { LabBar, ScreenTabs, ThemeButton } from "./LabBar";
import { CONCEPTS, conceptById, type ConceptMeta } from "./registry";

export function Compare() {
  const [params, setParams] = useSearchParams();
  const a = conceptById(params.get("a") ?? "") ?? CONCEPTS[0];
  const b = conceptById(params.get("b") ?? "") ?? CONCEPTS[3];
  const [sync, setSync] = useState(true);
  const [shared, setShared] = useState<Screen>((SCREENS.find((s) => s.id === params.get("screen"))?.id) ?? "dashboard");
  const set = (k: "a" | "b", v: string) => { const n = new URLSearchParams(params); n.set(k, v); setParams(n, { replace: true }); };

  return (
    <div className="lab-viewer lab-compare">
      <LabBar right={
        <button className="lab-theme" aria-pressed={sync} onClick={() => setSync((s) => !s)} title="Keep both previews on the same screen">
          {sync ? <Link2 size={15} /> : <Link2Off size={15} />} {sync ? "Screens synced" : "Independent"}
        </button>
      }>
        {sync && <ScreenTabs id="compare" value={shared} onChange={setShared} />}
        {!sync && <span className="lab-hint">Navigate each preview independently</span>}
      </LabBar>
      <div className="lab-compare-grid">
        <Pane concept={a} other={b} onPick={(v) => set("a", v)} sync={sync} shared={shared} setShared={setShared} />
        <Pane concept={b} other={a} onPick={(v) => set("b", v)} sync={sync} shared={shared} setShared={setShared} />
      </div>
    </div>
  );
}

function Pane({ concept, other, onPick, sync, shared, setShared }: {
  concept: ConceptMeta; other: ConceptMeta; onPick: (id: string) => void; sync: boolean; shared: Screen; setShared: (s: Screen) => void;
}) {
  const [theme, setTheme] = useState<"dark" | "light">(concept.defaultTheme);
  const [own, setOwn] = useState<Screen>("dashboard");
  const screen = sync ? shared : own;
  return (
    <motion.div className="lab-pane" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="lab-pane-bar">
        <select className="lab-select" value={concept.id} onChange={(e) => { onPick(e.target.value); setTheme(conceptById(e.target.value)!.defaultTheme); }} aria-label="Concept">
          {CONCEPTS.map((c) => <option key={c.id} value={c.id} disabled={c.id === other.id}>{c.letter} · {c.name}</option>)}
        </select>
        <ThemeButton theme={theme} onToggle={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} />
        <Link className="lab-theme" to={`/design-lab/${concept.id}?screen=${screen}&theme=${theme}`}><Maximize2 size={14} /> Open</Link>
      </div>
      <div className="lab-frame lab-frame--compare">
        <ScaledFrame key={concept.id} concept={concept} theme={theme} screen={screen} onScreen={sync ? setShared : setOwn} eager fill width={1200} />
      </div>
    </motion.div>
  );
}
