import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, Clock, Eye, EyeOff, LayoutGrid, ListTodo, Plus, Search, Target, Wallet, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  ACCOUNTS, DEMO_LABEL, GOALS, LIABILITIES, MONTH, SPENDING, TOTAL_BALANCE, UPCOMING, UPCOMING_TOTAL,
  type Goal, type Screen,
} from "../../data";
import { FlowChart, Ring, Sparkline, type ChartTheme } from "../../shared/charts";
import { dayLabel, fm, splitMoney, txSigned } from "../../shared/fmt";
import { groupByDay, useParallax, type ConceptProps } from "../../shared/hooks";
import { ease, rise, shakeX, spring, stagger } from "../../shared/motion";
import { Photo } from "../../shared/Photo";
import { useLab, type Lab } from "../../shared/useLab";
import "./ambient.css";

const ORDER: Screen[] = ["dashboard", "finance", "transactions", "goals", "tasks"];
const DOCK: { id: Screen; label: string; icon: typeof Wallet }[] = [
  { id: "dashboard", label: "Now", icon: LayoutGrid },
  { id: "finance", label: "Money", icon: Wallet },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "goals", label: "Goals", icon: Target },
  { id: "tasks", label: "Tasks", icon: ListTodo },
];

const fly = {
  initial: { opacity: 0, scale: 0.9, filter: "blur(14px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.8, ease } },
  exit: { opacity: 0, scale: 1.08, filter: "blur(10px)", transition: { duration: 0.35, ease: [0.4, 0, 1, 1] } },
};

export default function AmbientConcept({ theme, screen, onScreen, preview }: ConceptProps) {
  const lab = useLab();
  const [focus, setFocus] = useState(true);
  const [goal, setGoal] = useState<Goal | null>(null);
  const { ref, p } = useParallax<HTMLDivElement>(!preview);
  const idx = ORDER.indexOf(screen);

  return (
    <div ref={ref} className={`ac-root ac-${theme} ${focus ? "is-focus" : ""}`}>
      {/* Environment: the camera pans across it as you move between spaces */}
      <motion.div className="ac-env" animate={{ x: `${-idx * 3}%` }} transition={{ type: "spring", stiffness: 40, damping: 18 }}>
        {theme === "dark" ? (
          <>
            <div className="ac-sky" style={{ transform: `translate3d(${p.x * -6}px, ${p.y * -4}px, 0)` }} />
            <div className="ac-stars" style={{ transform: `translate3d(${p.x * -12}px, ${p.y * -8}px, 0)` }} />
            <div className="ac-planet" style={{ transform: `translate3d(calc(-50% + ${p.x * -22}px), ${p.y * -10}px, 0)` }}>
              <div className="ac-planet-surface" />
            </div>
          </>
        ) : (
          <Photo name="ocean" className="ac-dawn" eager style={{ transform: `translate3d(${p.x * -10}px, ${p.y * -6}px, 0) scale(1.08)` }}
            grade="linear-gradient(180deg, rgba(255,240,230,.15), rgba(240,232,255,.35) 60%, rgba(220,226,255,.6))" />
        )}
      </motion.div>
      <div className="ac-aurora" aria-hidden />

      <TopBar lab={lab} focus={focus} setFocus={setFocus} />

      <div className="ac-stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={screen} className="ac-space" {...fly}>
            {screen === "dashboard" && <Now lab={lab} p={p} onScreen={onScreen} />}
            {screen === "finance" && <Money lab={lab} theme={theme} />}
            {screen === "transactions" && <Stream lab={lab} />}
            {screen === "goals" && <Horizons onOpen={setGoal} />}
            {screen === "tasks" && <Focus lab={lab} />}
          </motion.div>
        </AnimatePresence>
      </div>

      <Dock screen={screen} onScreen={onScreen} onAdd={() => lab.quick.setOpen(true)} />
      <TxPanel lab={lab} />
      <GoalPortal goal={goal} onClose={() => setGoal(null)} />
      <QuickAdd lab={lab} />
      <AnimatePresence>
        {lab.toast && (
          <motion.div className="ac-toast" role="status" initial={{ opacity: 0, y: 20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={spring}>
            <Check size={15} /> {lab.toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- chrome

function TopBar({ lab, focus, setFocus }: { lab: Lab; focus: boolean; setFocus: (f: boolean) => void }) {
  return (
    <header className="ac-top">
      <div>
        <p className="ac-greet">Good morning</p>
        <p className="ac-date">Monday · 19 October · 09:41</p>
      </div>
      <div className="ac-top-right">
        <span className="ac-demo">{DEMO_LABEL}</span>
        <button className="ac-chip" aria-pressed={focus} onClick={() => setFocus(!focus)} title="Dim everything except what matters now">
          {focus ? <Eye size={15} /> : <EyeOff size={15} />} Focus {focus ? "on" : "off"}
        </button>
        <button className="ac-chip" onClick={lab.refresh}><Clock size={15} /> {lab.loading ? "Syncing…" : "Synced"}</button>
      </div>
    </header>
  );
}

function DockItem({ mouseX, active, label, onClick, children }: { mouseX: MotionValue<number>; active?: boolean; label: string; onClick: () => void; children: ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const distance = useTransform(mouseX, (x) => {
    const b = ref.current?.getBoundingClientRect();
    if (!b || x === Infinity) return 999;
    const scale = b.width / (ref.current!.offsetWidth || 1);
    return (x - (b.left + b.width / 2)) / scale;
  });
  const size = useSpring(useTransform(distance, [-140, 0, 140], [52, 74, 52], { clamp: true }), { stiffness: 320, damping: 22 });
  return (
    <motion.button ref={ref} style={{ width: size, height: size }} className={`ac-dock-item ${active ? "is-active" : ""}`} onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined} whileTap={{ scale: 0.9 }}>
      {children}
      <span className="ac-dock-tip">{label}</span>
      {active && <motion.span layoutId="ac-dock-dot" className="ac-dock-dot" transition={spring} />}
    </motion.button>
  );
}

function Dock({ screen, onScreen, onAdd }: { screen: Screen; onScreen: (s: Screen) => void; onAdd: () => void }) {
  const mouseX = useMotionValue(Infinity);
  return (
    <nav className="ac-dock" aria-label="Spaces" onMouseMove={(e) => mouseX.set(e.clientX)} onMouseLeave={() => mouseX.set(Infinity)}>
      {DOCK.map(({ id, label, icon: Icon }) => (
        <DockItem key={id} mouseX={mouseX} active={screen === id} label={label} onClick={() => onScreen(id)}><Icon size={22} strokeWidth={1.7} /></DockItem>
      ))}
      <span className="ac-dock-sep" />
      <DockItem mouseX={mouseX} label="Add transaction" onClick={onAdd}><Plus size={24} strokeWidth={2} /></DockItem>
    </nav>
  );
}

function Widget({ children, className = "", depth = 1, p, primary }: { children: ReactNode; className?: string; depth?: number; p?: { x: number; y: number }; primary?: boolean }) {
  return (
    <motion.section variants={rise} className={`ac-widget ${primary ? "is-primary" : ""} ${className}`}
      style={p ? { translate: `${p.x * depth * 10}px ${p.y * depth * 8}px` } : undefined}>
      <motion.div className="ac-float" animate={{ y: [0, -4 * depth, 0] }} transition={{ duration: 6 + depth * 1.5, repeat: Infinity, ease: "easeInOut" }}>
        {children}
      </motion.div>
    </motion.section>
  );
}

// ---------------------------------------------------------------- now (dashboard)

function Now({ lab, p, onScreen }: { lab: Lab; p: { x: number; y: number }; onScreen: (s: Screen) => void }) {
  const next = lab.tasks.find((t) => t.when === "today" && !t.done && t.time) ?? lab.tasks.find((t) => !t.done);
  const bal = splitMoney(TOTAL_BALANCE);
  const doneToday = lab.habits.filter((h) => h.week[6]).length;
  return (
    <motion.div className="ac-now" variants={stagger(0.08, 0.15)} initial="hidden" animate="show">
      <Widget className="ac-w-balance" depth={2} p={p}>
        <p className="ac-label">Available</p>
        <p className="ac-num">{lab.loading ? "—" : bal.main}<span>{bal.rest}</span></p>
        <Sparkline values={[1.9, 2.0, 1.95, 2.15, 2.2, 2.31, 2.44]} color="var(--ac-accent)" width={220} height={46} />
        <button className="ac-link" onClick={() => onScreen("finance")}>Money space <ArrowUpRight size={14} /></button>
      </Widget>

      <Widget className="ac-w-flow" depth={1.4} p={p}>
        <p className="ac-label">October so far</p>
        <div className="ac-flow-rows">
          <p><ArrowDownLeft size={15} className="ac-in" /> In <b>{fm(MONTH.income)}</b></p>
          <p><ArrowUpRight size={15} className="ac-out" /> Out <b>{fm(MONTH.expense)}</b></p>
          <p className="ac-kept">Kept <b>{fm(MONTH.net, { sign: true })}</b></p>
        </div>
        <div className="ac-meter"><motion.span initial={{ width: 0 }} animate={{ width: `${MONTH.budgetPct}%` }} transition={{ duration: 1.2, delay: 0.6, ease }} /></div>
        <p className="ac-small">Budget {MONTH.budgetPct}% used · {MONTH.daysLeft} days left</p>
      </Widget>

      <motion.section variants={rise} className="ac-orb-wrap" style={{ translate: `${p.x * 4}px ${p.y * 3}px` }}>
        <div className="ac-orb-glow" aria-hidden />
        <div className="ac-orb">
          <p className="ac-label">Now · next up</p>
          <AnimatePresence mode="wait">
            {next ? (
              <motion.div key={next.id} initial={{ opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -14, filter: "blur(6px)" }} transition={{ duration: 0.45, ease }}>
                <p className="ac-orb-time">{next.time ?? "Today"}</p>
                <p className="ac-orb-task">{next.title}</p>
                <p className="ac-small">{next.project} · {next.priority} priority</p>
                <div className="ac-orb-actions">
                  <button className="ac-btn ac-btn--primary" onClick={() => { lab.toggleTask(next.id); lab.notify("Nice. Moving to the next thing."); }}><Check size={16} /> Done</button>
                  <button className="ac-btn" onClick={() => onScreen("tasks")}>All tasks</button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="clear" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="ac-orb-task">Nothing waiting.</p>
                <p className="ac-small">Your day is clear — enjoy it.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>

      <Widget className="ac-w-habits" depth={1.7} p={p}>
        <p className="ac-label">Rituals · {doneToday}/4 today</p>
        <div className="ac-habits">
          {lab.habits.map((h) => (
            <button key={h.id} className="ac-habit" onClick={() => lab.toggleHabit(h.id)} aria-pressed={h.week[6]}>
              <Ring value={h.week[6] ? 100 : 0} size={40} stroke={4} color={h.color} track="var(--ac-track)">
                {h.week[6] ? <Check size={14} strokeWidth={3} /> : null}
              </Ring>
              <span>{h.name}</span>
            </button>
          ))}
        </div>
      </Widget>

      <Widget className="ac-w-up" depth={1.2} p={p}>
        <p className="ac-label">Coming up · expected</p>
        <ul className="ac-up">
          {UPCOMING.slice(0, 3).map((u) => <li key={u.id}><span>{u.when}</span><span>{u.name}</span><b>{fm(u.amount)}</b></li>)}
        </ul>
        <p className="ac-small">{fm(UPCOMING_TOTAL)} expected in 30 days</p>
      </Widget>

      <Widget className="ac-w-goal" depth={2.4} p={p}>
        <button className="ac-goal-bubble" onClick={() => onScreen("goals")}>
          <Photo name={GOALS[1].image} className="ac-goal-bubble-img" />
          <span className="ac-goal-bubble-cap"><b>{GOALS[1].title}</b><small>{GOALS[1].progress}% · {GOALS[1].due}</small></span>
        </button>
      </Widget>
    </motion.div>
  );
}

// ---------------------------------------------------------------- money

function Money({ lab, theme }: { lab: Lab; theme: "dark" | "light" }) {
  const ct: ChartTheme = theme === "dark"
    ? { income: "#9db4ff", expense: "#ffb38a", grid: "rgba(255,255,255,.08)", axis: "rgba(233,236,255,.62)", tooltipClass: "ac-tooltip" }
    : { income: "#3552b8", expense: "#c4572a", grid: "rgba(20,24,60,.08)", axis: "rgba(20,24,60,.6)", tooltipClass: "ac-tooltip" };
  const bal = splitMoney(TOTAL_BALANCE);
  return (
    <motion.div className="ac-money" variants={stagger(0.08, 0.1)} initial="hidden" animate="show">
      <motion.div variants={rise} className="ac-money-hero">
        <p className="ac-label">Everything you hold</p>
        <p className="ac-hero-num">{lab.loading ? <span className="ac-skel" /> : <>{bal.main}<span>{bal.rest}</span></>}</p>
        <p className="ac-small">Account balances · not net worth · owed separately: {fm(LIABILITIES.outstanding)}</p>
      </motion.div>
      <motion.div variants={rise} className="ac-panel ac-money-chart">
        <div className="ac-panel-head"><h2>Flow of the last six months</h2><p className="ac-legend"><span><i style={{ background: ct.income }} />In</span><span><i style={{ background: ct.expense }} />Out</span></p></div>
        <FlowChart theme={ct} height={230} />
      </motion.div>
      <motion.div variants={rise} className="ac-panel ac-money-spend">
        <div className="ac-panel-head"><h2>Where October went</h2></div>
        <ul className="ac-spend">
          {SPENDING.map((s, i) => (
            <li key={s.name}>
              <span>{s.name}</span>
              <span className="ac-spend-track"><motion.i style={{ background: s.color, boxShadow: `0 0 16px ${s.color}` }} initial={{ width: 0 }} animate={{ width: `${(s.value / 180) * 100}%` }} transition={{ duration: 1, delay: 0.3 + i * 0.07, ease }} /></span>
              <b>{fm(s.amount)}</b>
            </li>
          ))}
        </ul>
      </motion.div>
      <motion.div variants={rise} className="ac-accounts">
        {ACCOUNTS.map((a, i) => (
          <motion.div key={a.id} className="ac-panel ac-account" whileHover={{ y: -6, scale: 1.02 }} transition={spring} style={{ zIndex: 3 - i }}>
            <p className="ac-label">{a.kind}</p>
            <p className="ac-acc-name">{a.name}</p>
            <p className="ac-acc-num">{fm(a.balance)}</p>
            <Sparkline values={a.trend} color="var(--ac-accent)" width={180} height={34} />
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ---------------------------------------------------------------- transactions

function Stream({ lab }: { lab: Lab }) {
  const groups = groupByDay(lab.visibleTxs);
  return (
    <motion.div className="ac-stream" variants={stagger(0.05)} initial="hidden" animate="show">
      <motion.div variants={rise} className="ac-stream-bar">
        <div className="ac-seg" role="tablist">
          {(["all", "expense", "income", "transfer"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={lab.txFilter === f} onClick={() => lab.setTxFilter(f)}>
              {lab.txFilter === f && <motion.span layoutId="ac-seg" className="ac-seg-pill" transition={spring} />}
              <span>{f === "all" ? "All" : f === "expense" ? "Out" : f === "income" ? "In" : "Moves"}</span>
            </button>
          ))}
        </div>
        <label className="ac-search"><Search size={16} /><input placeholder="Search your stream" value={lab.query} onChange={(e) => lab.setQuery(e.target.value)} /></label>
      </motion.div>
      <motion.div variants={rise} className="ac-panel ac-stream-panel">
        {groups.length === 0 ? (
          <div className="ac-empty">
            <div className="ac-empty-planet" />
            <p>Nothing drifting by</p>
            <span>No transactions match “{lab.query}”.</span>
            <button className="ac-btn" onClick={() => { lab.setQuery(""); lab.setTxFilter("all"); }}>Clear search</button>
          </div>
        ) : groups.map(([day, items]) => (
          <div key={day} className="ac-day">
            <p className="ac-day-label">{dayLabel(day)}</p>
            {items.map((t) => (
              <motion.button layout key={t.id} className={`ac-tx ${t.session ? "is-new" : ""} ${lab.selectedTx?.id === t.id ? "is-selected" : ""}`} onClick={() => lab.setSelectedTx(t)} whileHover={{ x: 4 }} transition={spring}>
                <span className={`ac-tx-dot ac-tx-dot--${t.type}`} />
                <span className="ac-tx-main"><b>{t.title}</b><small>{t.category} · {t.account}</small></span>
                <span className={`ac-tx-amt ac-tx-amt--${t.type}`}>{t.type === "transfer" ? fm(t.amount) : fm(txSigned(t), { sign: true })}</span>
              </motion.button>
            ))}
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

function TxPanel({ lab }: { lab: Lab }) {
  const t = lab.selectedTx;
  return (
    <AnimatePresence>
      {t && (
        <motion.aside className="ac-panel ac-txpanel" role="dialog" aria-label="Transaction"
          initial={{ opacity: 0, x: 60, scale: 0.92, rotateY: -12 }} animate={{ opacity: 1, x: 0, scale: 1, rotateY: 0 }} exit={{ opacity: 0, x: 40, scale: 0.95 }} transition={{ type: "spring", stiffness: 220, damping: 24 }}>
          <button className="ac-close" aria-label="Close" onClick={() => lab.setSelectedTx(null)}><X size={16} /></button>
          <p className="ac-label">{dayLabel(t.date)}</p>
          <p className="ac-txpanel-amt">{t.type === "transfer" ? fm(t.amount) : fm(txSigned(t), { sign: true })}</p>
          <p className="ac-txpanel-title">{t.title}</p>
          <dl className="ac-dl">
            <div><dt>Category</dt><dd>{t.category}</dd></div>
            <div><dt>Account</dt><dd>{t.account}</dd></div>
            <div><dt>Type</dt><dd style={{ textTransform: "capitalize" }}>{t.type}</dd></div>
            {t.note && <div><dt>Note</dt><dd>{t.note}</dd></div>}
          </dl>
          <p className="ac-small">{DEMO_LABEL} · read-only preview</p>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- goals (coverflow)

function Horizons({ onOpen }: { onOpen: (g: Goal) => void }) {
  const [active, setActive] = useState(0);
  return (
    <div className="ac-horizons">
      <p className="ac-label ac-center">Horizons · {GOALS.length} goals in motion</p>
      <div className="ac-flow-stage">
        {GOALS.map((g, i) => {
          const off = i - active;
          return (
            <motion.button key={g.id} className="ac-cover" onClick={() => (off === 0 ? onOpen(g) : setActive(i))}
              animate={{ x: `${off * 62}%`, rotateY: off * -28, scale: off === 0 ? 1 : 0.8, opacity: Math.abs(off) > 2 ? 0 : off === 0 ? 1 : 0.55, zIndex: 10 - Math.abs(off) }}
              transition={{ type: "spring", stiffness: 160, damping: 22 }} aria-label={`${g.title}${off === 0 ? " — open" : ""}`}>
              <Photo name={g.image} layoutId={`ac-goal-${g.id}`} className="ac-cover-img" />
              <span className="ac-cover-cap">
                <small>{g.category}</small>
                <b>{g.title}</b>
                <span className="ac-meter"><span style={{ width: `${g.progress}%` }} /></span>
                <small>{g.progress}% · {g.detail}</small>
              </span>
            </motion.button>
          );
        })}
      </div>
      <div className="ac-flow-dots" role="tablist">
        {GOALS.map((g, i) => <button key={g.id} role="tab" aria-selected={i === active} aria-label={g.title} onClick={() => setActive(i)} />)}
      </div>
    </div>
  );
}

function GoalPortal({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {goal && (
        <motion.div className="ac-portal" role="dialog" aria-label={goal.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Photo name={goal.image} layoutId={`ac-goal-${goal.id}`} className="ac-portal-img" grade="linear-gradient(90deg, rgba(5,8,20,.85) 0%, rgba(5,8,20,.45) 50%, rgba(5,8,20,.1) 100%)" />
          <motion.div className="ac-portal-text" variants={stagger(0.08, 0.35)} initial="hidden" animate="show">
            <motion.p variants={rise} className="ac-label">{goal.category} · by {goal.due}</motion.p>
            <motion.h2 variants={rise}>{goal.title}</motion.h2>
            <motion.div variants={rise} className="ac-portal-ring">
              <Ring value={goal.progress} size={120} stroke={8} color="#e9ecff" track="rgba(255,255,255,.18)"><b>{goal.progress}%</b></Ring>
              <p>{goal.detail}</p>
            </motion.div>
            <motion.ul variants={rise} className="ac-ms">
              {goal.milestones.map((m) => <li key={m.title} className={m.done ? "is-done" : ""}><span>{m.done && <Check size={12} strokeWidth={3} />}</span>{m.title}</li>)}
            </motion.ul>
          </motion.div>
          <button className="ac-close ac-close--portal" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- tasks (focus list)

function Focus({ lab }: { lab: Lab }) {
  const [title, setTitle] = useState("");
  const [first, ...rest] = lab.visibleTasks;
  return (
    <motion.div className="ac-focus" variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.div variants={rise} className="ac-stream-bar">
        <div className="ac-seg" role="tablist">
          {(["today", "upcoming", "done"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={lab.taskView === v} onClick={() => lab.setTaskView(v)}>
              {lab.taskView === v && <motion.span layoutId="ac-seg-t" className="ac-seg-pill" transition={spring} />}
              <span style={{ textTransform: "capitalize" }}>{v}</span>
            </button>
          ))}
        </div>
        <form className="ac-search" onSubmit={(e) => { e.preventDefault(); if (lab.addTask(title)) { setTitle(""); lab.notify("Added to today · preview only"); } }}>
          <Plus size={16} /><input placeholder="Add something to today" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New task" />
        </form>
      </motion.div>
      <AnimatePresence mode="popLayout" initial={false}>
        {!first ? (
          <motion.div key="empty" className="ac-panel ac-empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div className="ac-empty-planet" />
            <p>{lab.taskView === "done" ? "Nothing completed yet" : "Clear skies"}</p>
            <span>{lab.taskView === "done" ? "Finished tasks drift here." : "Nothing in this space. Breathe."}</span>
          </motion.div>
        ) : (
          <motion.div key="list" className="ac-focus-list" layout>
            <motion.div layout key={first.id} className="ac-panel ac-focus-hero" initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05, filter: "blur(8px)" }} transition={spring}>
              <p className="ac-label">{first.done ? "Completed" : "Focus"}{first.time ? ` · ${first.time}` : ""}{first.overdue && !first.done ? " · overdue" : ""}</p>
              <p className="ac-focus-title">{first.title}</p>
              <p className="ac-small">{first.project ?? "No project"} · {first.priority} priority</p>
              <button className="ac-btn ac-btn--primary" onClick={() => lab.toggleTask(first.id)}>{first.done ? "Reopen" : <><Check size={16} /> Complete</>}</button>
            </motion.div>
            {rest.map((t) => (
              <motion.button layout key={t.id} className="ac-focus-row" onClick={() => lab.toggleTask(t.id)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={spring} aria-label={`${t.done ? "Reopen" : "Complete"} ${t.title}`}>
                <span className={`ac-focus-check ${t.done ? "is-done" : ""}`}>{t.done && <Check size={13} strokeWidth={3} />}</span>
                <span className="ac-focus-row-title">{t.title}</span>
                <small>{[t.project, t.time].filter(Boolean).join(" · ")}</small>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------- quick add

function QuickAdd({ lab }: { lab: Lab }) {
  const q = lab.quick;
  return (
    <AnimatePresence>
      {q.open && (
        <motion.div className="ac-qa-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => q.setOpen(false)}>
          <motion.form className="ac-panel ac-qa" role="dialog" aria-label="Add transaction" noValidate onClick={(e) => e.stopPropagation()}
            initial={{ y: 120, scale: 0.6, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 80, scale: 0.7, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 24 }}
            style={{ transformOrigin: "50% 100%" }}
            onSubmit={(e) => { e.preventDefault(); q.submit(); }} onKeyDown={(e) => e.key === "Escape" && q.setOpen(false)}>
            <motion.div key={q.shake} animate={q.shake ? shakeX : undefined}>
              <div className="ac-qa-head">
                <div className="ac-seg" role="tablist">
                  {(["expense", "income"] as const).map((t) => (
                    <button type="button" key={t} role="tab" aria-selected={q.form.type === t} onClick={() => q.set("type", t)}>
                      {q.form.type === t && <motion.span layoutId="ac-q-seg" className="ac-seg-pill" transition={spring} />}
                      <span>{t === "expense" ? "Out" : "In"}</span>
                    </button>
                  ))}
                </div>
                <button type="button" className="ac-close" aria-label="Close" onClick={() => q.setOpen(false)}><X size={16} /></button>
              </div>
              <label className={`ac-qa-amount ${q.errors.amount ? "has-error" : ""}`}>
                <input autoFocus inputMode="decimal" placeholder="0" value={q.form.amount} onChange={(e) => q.set("amount", e.target.value)} aria-label="Amount" aria-invalid={!!q.errors.amount} />
                <span>₸</span>
              </label>
              {q.errors.amount && <p className="ac-err">{q.errors.amount}</p>}
              <div className={`ac-qa-cats ${q.errors.category ? "has-error" : ""}`}>
                {q.categories.map((c) => <button type="button" key={c} aria-pressed={q.form.category === c} onClick={() => q.set("category", c)}>{c}</button>)}
              </div>
              {q.errors.category && <p className="ac-err">{q.errors.category}</p>}
              <div className="ac-qa-row">
                <select aria-label="Account" value={q.form.account} onChange={(e) => q.set("account", e.target.value)}>{ACCOUNTS.map((a) => <option key={a.id}>{a.name}</option>)}</select>
                <input aria-label="Date" type="date" value={q.form.date} onChange={(e) => q.set("date", e.target.value)} />
              </div>
              <input className="ac-qa-note" placeholder="Note (optional)" value={q.form.title} onChange={(e) => q.set("title", e.target.value)} aria-label="Note" />
              <button type="submit" className="ac-btn ac-btn--primary ac-btn--wide">Add to stream</button>
              <p className="ac-small ac-center">Preview only — nothing is saved.</p>
            </motion.div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
