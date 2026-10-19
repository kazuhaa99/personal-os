import { motion } from "framer-motion";
import { ArrowRight, Columns2, Maximize2, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { DEMO_LABEL, SCREENS, type Screen } from "./data";
import { ScaledFrame } from "./Frame";
import { CONCEPTS, type ConceptMeta } from "./registry";
import { ease, rise, stagger } from "./shared/motion";

export function Gallery() {
  const location = useLocation();
  const focus = (location.state as { focus?: string } | null)?.focus;
  useEffect(() => {
    if (focus) document.getElementById(`concept-${focus}`)?.scrollIntoView({ block: "center" });
    else window.scrollTo(0, 0);
  }, [focus]);

  return (
    <div className="lab-root">
      <header className="lab-hero">
        <motion.div variants={stagger(0.08)} initial="hidden" animate="show">
          <motion.p variants={rise} className="lab-kicker">Personal OS · Design Lab</motion.p>
          <motion.h1 variants={rise} className="lab-h1">Four directions.<br /><span>Pick the one that feels like yours.</span></motion.h1>
          <motion.p variants={rise} className="lab-lede">
            Each concept is a live, interactive prototype built on the same sample data, so you're judging the design, not the content.
            Click around inside any preview, open it full-screen, or put two side by side.
          </motion.p>
          <motion.div variants={rise} className="lab-hero-actions">
            <Link to="/design-lab/compare?a=glass&b=native" className="lab-btn lab-btn--ghost"><Columns2 size={16} /> Compare side by side</Link>
            <span className="lab-demo">All figures are {DEMO_LABEL.toLowerCase()} — not your finances. Nothing here is saved.</span>
          </motion.div>
        </motion.div>
        <motion.nav className="lab-jump" aria-label="Concepts" variants={stagger(0.06, 0.3)} initial="hidden" animate="show">
          {CONCEPTS.map((c) => (
            <motion.a key={c.id} variants={rise} href={`#concept-${c.id}`} className="lab-jump-item"
              onClick={(e) => { e.preventDefault(); document.getElementById(`concept-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              <span className="lab-jump-letter">{c.letter}</span>
              <span><b>{c.name}</b><small>{c.tagline}</small></span>
            </motion.a>
          ))}
        </motion.nav>
      </header>

      {CONCEPTS.map((c, i) => <ConceptSection key={c.id} concept={c} index={i} />)}

      <footer className="lab-footer">
        Design lab is isolated from the real app: <Link to="/">return to Personal OS</Link>. Photo credits: <a href="/design-lab/CREDITS.md">CREDITS.md</a>.
      </footer>
    </div>
  );
}

function ConceptSection({ concept: c, index }: { concept: ConceptMeta; index: number }) {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<"dark" | "light">(c.defaultTheme);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const frameRef = useRef<HTMLDivElement>(null);

  function open() {
    const r = frameRef.current?.getBoundingClientRect();
    navigate(`/design-lab/${c.id}?screen=${screen}&theme=${theme}`, {
      state: r ? { from: { top: r.top, left: r.left, right: r.right, bottom: r.bottom } } : undefined,
    });
  }

  return (
    <motion.section id={`concept-${c.id}`} className={`lab-concept ${index % 2 ? "is-flipped" : ""}`}
      initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.8, ease }}>
      <div className="lab-concept-info">
        <p className="lab-letter">{c.letter}</p>
        <h2 className="lab-h2">{c.name}</h2>
        <p className="lab-tagline">{c.tagline}</p>
        <p className="lab-desc">{c.description}</p>
        <ul className="lab-keys">{c.keywords.map((k) => <li key={k}>{k}</li>)}</ul>
        <div className="lab-specimen">
          <span style={{ fontFamily: c.type.family }}>{c.type.sample}</span>
          <small>{c.type.display}{c.type.text !== c.type.display ? ` + ${c.type.text}` : ""}</small>
        </div>
        <div className="lab-swatches" aria-label="Palette">{c.swatches.map((s) => <i key={s} style={{ background: s }} title={s} />)}</div>
        <div className="lab-actions">
          <button className="lab-btn lab-btn--primary" onClick={open}><Maximize2 size={16} /> Open full screen</button>
          <Link className="lab-btn lab-btn--ghost" to={`/design-lab/compare?a=${c.id}&b=${CONCEPTS[(index + 1) % 4].id}`}><Columns2 size={16} /> Compare</Link>
        </div>
      </div>

      <div className="lab-stage">
        <div className="lab-stage-bar">
          <div className="lab-tabs" role="tablist" aria-label={`${c.name} screens`}>
            {SCREENS.map((s) => (
              <button key={s.id} role="tab" aria-selected={screen === s.id} onClick={() => setScreen(s.id)}>
                {screen === s.id && <motion.span layoutId={`lab-tab-${c.id}`} className="lab-tab-pill" transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
                <span>{s.label}</span>
              </button>
            ))}
          </div>
          <button className="lab-theme" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} variant`}>
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />} {theme === "dark" ? "Light" : "Dark"}
          </button>
        </div>
        <div ref={frameRef} className="lab-frame">
          <ScaledFrame concept={c} theme={theme} screen={screen} onScreen={setScreen} />
        </div>
        <button className="lab-open-hint" onClick={open}>Open {c.name} <ArrowRight size={14} /></button>
      </div>
    </motion.section>
  );
}
