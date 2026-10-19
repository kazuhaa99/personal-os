import { motion } from "framer-motion";
import { ArrowLeft, Columns2, Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DEMO_LABEL, SCREENS, type Screen } from "./data";

export function LabBar({ children, right }: { children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="lab-bar" role="toolbar" aria-label="Design lab controls">
      <Link to="/design-lab" className="lab-bar-back"><ArrowLeft size={16} /> <span>Gallery</span></Link>
      <div className="lab-bar-mid">{children}</div>
      <div className="lab-bar-right">
        <span className="lab-demo lab-demo--sm">{DEMO_LABEL}</span>
        {right}
      </div>
    </div>
  );
}

export function ScreenTabs({ value, onChange, id }: { value: Screen; onChange: (s: Screen) => void; id: string }) {
  return (
    <div className="lab-tabs lab-tabs--bar" role="tablist" aria-label="Screens">
      {SCREENS.map((s) => (
        <button key={s.id} role="tab" aria-selected={value === s.id} onClick={() => onChange(s.id)}>
          {value === s.id && <motion.span layoutId={`lab-bar-tab-${id}`} className="lab-tab-pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          <span>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ThemeButton({ theme, onToggle }: { theme: "dark" | "light"; onToggle: () => void }) {
  return (
    <button className="lab-theme" onClick={onToggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} variant`} title="Toggle light/dark (T)">
      <motion.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} style={{ display: "inline-flex" }}>
        {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
      </motion.span>
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

export function CompareLink({ a, b }: { a: string; b: string }) {
  return <Link className="lab-theme" to={`/design-lab/compare?a=${a}&b=${b}`}><Columns2 size={15} /> Compare</Link>;
}
