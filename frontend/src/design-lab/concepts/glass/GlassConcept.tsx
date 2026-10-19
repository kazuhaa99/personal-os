import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Dumbbell, Home, Laptop, ListTodo, Music,
  Plus, RefreshCw, Search, Sparkles, Target, Wallet, Wifi, X,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  ACCOUNTS, DEMO_LABEL, GOALS, LIABILITIES, MONTH, SPENDING, TOTAL_BALANCE, UPCOMING, UPCOMING_TOTAL,
  type Goal, type Screen,
} from "../../data";
import { Donut, FlowChart, Ring, Sparkline, type ChartTheme } from "../../shared/charts";
import { dayLabel, fm, splitMoney, txSigned } from "../../shared/fmt";
import { groupByDay, useDismiss, useSheen, type ConceptProps } from "../../shared/hooks";
import { rise, shakeX, spring, stagger } from "../../shared/motion";
import { Photo } from "../../shared/Photo";
import { useLab, type Lab } from "../../shared/useLab";
import "./glass.css";

const NAV: { id: Screen; label: string; icon: typeof Home }[] = [
  { id: "dashboard", label: "Today", icon: Sparkles },
  { id: "finance", label: "Money", icon: Wallet },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "goals", label: "Goals", icon: Target },
  { id: "tasks", label: "Tasks", icon: ListTodo },
];
const TITLES: Record<Screen, string> = { dashboard: "Good morning", finance: "Money", transactions: "Transactions", goals: "Goals", tasks: "Tasks" };
const PAY_ICON: Record<string, typeof Home> = { dumbbell: Dumbbell, wifi: Wifi, home: Home, music: Music, laptop: Laptop };

const page = {
  initial: { opacity: 0, scale: 1.015, filter: "blur(12px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
  exit: { opacity: 0, scale: 0.985, filter: "blur(10px)", transition: { duration: 0.22 } },
};

function Glass({ children, className = "", strong, as: As = "section", sheen }: { children: ReactNode; className?: string; strong?: boolean; as?: "section" | "div"; sheen?: boolean }) {
  const ref = useSheen<HTMLDivElement>();
  return (
    <motion.div variants={rise} ref={sheen ? ref : undefined} className={`ga-glass ${strong ? "ga-glass--strong" : ""} ${sheen ? "ga-sheen" : ""} ${className}`} role={As === "section" ? "region" : undefined}>
      {children}
    </motion.div>
  );
}

export default function GlassConcept({ theme, screen, onScreen, preview }: ConceptProps) {
  const lab = useLab();
  const [goal, setGoal] = useState<Goal | null>(null);
  return (
    <div className={`ga-root ga-${theme} ${preview ? "ga-preview" : ""}`}>
      <Photo name={theme === "dark" ? "peaks" : "moraine"} className="ga-bg" eager position="center 35%"
        grade={theme === "dark"
          ? "linear-gradient(180deg, rgba(4,9,14,.35) 0%, rgba(4,9,14,.55) 45%, rgba(4,9,14,.85) 100%)"
          : "linear-gradient(180deg, rgba(240,246,250,.25) 0%, rgba(240,246,250,.55) 60%, rgba(240,246,250,.8) 100%)"} />
      <div className="ga-aurora" aria-hidden />

      <LayoutGroup id="ga">
        <Ornament screen={screen} onScreen={onScreen} />
        <main className="ga-window">
          <Header screen={screen} lab={lab} />
          <div className="ga-scroll">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={screen} {...page} className="ga-page">
                {screen === "dashboard" && <Dashboard lab={lab} onScreen={onScreen} />}
                {screen === "finance" && <Finance lab={lab} light={theme === "light"} />}
                {screen === "transactions" && <Transactions lab={lab} />}
                {screen === "goals" && <Goals onOpen={setGoal} />}
                {screen === "tasks" && <Tasks lab={lab} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
        <Dock lab={lab} />
        <QuickAdd lab={lab} />
        <TxSheet lab={lab} />
        <GoalDetail goal={goal} onClose={() => setGoal(null)} />
      </LayoutGroup>

      <AnimatePresence>
        {lab.toast && (
          <motion.div className="ga-toast" role="status" initial={{ y: -30, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0 }} transition={spring}>
            <CheckCircle2 size={16} /> {lab.toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- chrome

function Ornament({ screen, onScreen }: { screen: Screen; onScreen: (s: Screen) => void }) {
  return (
    <nav className="ga-ornament" aria-label="Sections">
      {NAV.map(({ id, label, icon: Icon }) => (
        <button key={id} className="ga-orn-btn" aria-current={screen === id ? "page" : undefined} onClick={() => onScreen(id)}>
          {screen === id && <motion.span layoutId="ga-orn-pill" className="ga-orn-pill" transition={spring} />}
          <Icon size={20} strokeWidth={1.8} />
          <span className="ga-orn-tip">{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Header({ screen, lab }: { screen: Screen; lab: Lab }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  return (
    <header className="ga-header">
      <div>
        <p className="ga-eyebrow">Monday, 19 October</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.h1 key={screen} className="ga-title" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
            {TITLES[screen]}
          </motion.h1>
        </AnimatePresence>
      </div>
      <div className="ga-header-right">
        <span className="ga-demo">{DEMO_LABEL}</span>
        {(screen === "finance" || screen === "dashboard") && (
          <button className="ga-icon-btn" aria-label="Refresh" onClick={lab.refresh}>
            <RefreshCw size={16} className={lab.loading ? "ga-spin" : ""} />
          </button>
        )}
        <div className="ga-pop-anchor" ref={ref}>
          <button className="ga-account-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="ga-avatar">A</span> All accounts <ChevronDown size={14} />
          </button>
          <AnimatePresence>
            {open && (
              <motion.div className="ga-popover" role="menu" initial={{ opacity: 0, y: -6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={spring} style={{ transformOrigin: "top right" }}>
                <p className="ga-pop-label">Accounts · demo</p>
                {ACCOUNTS.map((a) => (
                  <button key={a.id} role="menuitem" className="ga-pop-item" onClick={() => setOpen(false)}>
                    <span>{a.name}<small>{a.kind}</small></span><b>{fm(a.balance)}</b>
                  </button>
                ))}
                <div className="ga-pop-sep" />
                <button role="menuitem" className="ga-pop-item" onClick={() => setOpen(false)}><span>Show archived</span></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

function Dock({ lab }: { lab: Lab }) {
  return (
    <div className="ga-dock" role="toolbar" aria-label="Quick actions">
      {!lab.quick.open && (
        <motion.button layoutId="ga-quick" className="ga-dock-primary" onClick={() => lab.quick.setOpen(true)} transition={spring} whileTap={{ scale: 0.94 }}>
          <motion.span layout="position" className="ga-dock-primary-inner"><Plus size={18} /> Transaction</motion.span>
        </motion.button>
      )}
      {lab.quick.open && <span className="ga-dock-primary ga-dock-ghost" aria-hidden><Plus size={18} /> Transaction</span>}
      <button className="ga-dock-btn" onClick={() => lab.addTask("New task from quick action") && lab.notify("Task added for today · preview only")}><ListTodo size={17} /> Task</button>
      <button className="ga-dock-btn" aria-label="Search"><Search size={17} /></button>
    </div>
  );
}

// ---------------------------------------------------------------- dashboard

function Dashboard({ lab, onScreen }: { lab: Lab; onScreen: (s: Screen) => void }) {
  const big = splitMoney(TOTAL_BALANCE);
  const today = lab.tasks.filter((t) => t.when === "today");
  return (
    <motion.div className="ga-grid" variants={stagger(0.06)} initial="hidden" animate="show">
      <Glass strong sheen className="ga-hero">
        <div className="ga-hero-top">
          <p className="ga-label">Available across accounts</p>
          <button className="ga-link" onClick={() => onScreen("finance")}>Details <ArrowUpRight size={14} /></button>
        </div>
        {lab.loading ? <div className="ga-skel" style={{ height: 64, width: "70%", marginTop: 12 }} /> : (
          <p className="ga-balance">{big.main}<span>{big.rest}</span></p>
        )}
        <p className="ga-sub">Sum of balances · not net worth</p>
        <div className="ga-hero-row">
          <div className="ga-flow">
            <span className="ga-flow-in"><ArrowDownLeft size={14} /> {fm(MONTH.income)}</span>
            <span className="ga-flow-out"><ArrowUpRight size={14} /> {fm(MONTH.expense)}</span>
            <span className="ga-flow-net">Net {fm(MONTH.net, { sign: true })}</span>
          </div>
          <Sparkline values={[1.9, 2.0, 1.95, 2.15, 2.2, 2.31, 2.44]} color="var(--ga-accent)" width={180} height={44} />
        </div>
        <div className="ga-accounts">
          {ACCOUNTS.map((a) => (
            <div key={a.id} className="ga-acc"><span>{a.name}</span><b>{fm(a.balance)}</b></div>
          ))}
        </div>
      </Glass>

      <Glass className="ga-today">
        <div className="ga-card-head"><h2>Today</h2><button className="ga-link" onClick={() => onScreen("tasks")}>All tasks <ArrowUpRight size={14} /></button></div>
        <ul className="ga-tasklist">
          {today.map((t) => <TaskItem key={t.id} t={t} onToggle={() => lab.toggleTask(t.id)} />)}
        </ul>
        <div className="ga-budget">
          <div className="ga-budget-top"><span>Budget used</span><b>{MONTH.budgetPct}%</b></div>
          <div className="ga-meter"><motion.span initial={{ width: 0 }} animate={{ width: `${MONTH.budgetPct}%` }} transition={{ duration: 1.1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }} /></div>
          <p>{fm(MONTH.budgetSpent)} of {fm(MONTH.budgetLimit)} · {MONTH.daysLeft} days left</p>
        </div>
      </Glass>

      <Glass className="ga-goals-strip">
        <div className="ga-card-head"><h2>Goals</h2><button className="ga-link" onClick={() => onScreen("goals")}>Open <ArrowUpRight size={14} /></button></div>
        <div className="ga-goal-row">
          {GOALS.slice(0, 3).map((g) => (
            <button key={g.id} className="ga-goal-mini" onClick={() => onScreen("goals")}>
              <Photo name={g.image} className="ga-goal-mini-img" />
              <div className="ga-goal-mini-cap">
                <span>{g.title}</span>
                <div className="ga-meter ga-meter--thin"><motion.span initial={{ width: 0 }} animate={{ width: `${g.progress}%` }} transition={{ duration: 1, delay: 0.5 }} /></div>
                <small>{g.progress}% · {g.due}</small>
              </div>
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="ga-habits">
        <div className="ga-card-head"><h2>Habits</h2><span className="ga-muted">tap today to check in</span></div>
        <div className="ga-habit-rings">
          {lab.habits.map((h) => (
            <button key={h.id} className="ga-habit" onClick={() => lab.toggleHabit(h.id)} aria-pressed={h.week[6]} aria-label={`${h.name}${h.week[6] ? ", done today" : ""}`}>
              <Ring value={h.week[6] ? 100 : (h.week.filter(Boolean).length / 7) * 100} size={58} stroke={5} color={h.color} track="var(--ga-track)">
                <AnimatePresence mode="wait">
                  {h.week[6]
                    ? <motion.span key="y" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={spring}><Check size={18} strokeWidth={3} /></motion.span>
                    : <motion.b key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>{h.streak}</motion.b>}
                </AnimatePresence>
              </Ring>
              <span>{h.name}</span>
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="ga-upcoming">
        <div className="ga-card-head"><h2>Upcoming</h2><span className="ga-muted">expected · 30 days</span></div>
        <ul>
          {UPCOMING.slice(0, 4).map((p) => {
            const Icon = PAY_ICON[p.icon];
            return (
              <li key={p.id}><span className="ga-pay-icon"><Icon size={15} /></span><span className="ga-pay-name">{p.name}<small>{p.when} · {p.kind}</small></span><b>{fm(`-${p.amount}`)}</b></li>
            );
          })}
        </ul>
        <p className="ga-foot">Total expected {fm(UPCOMING_TOTAL)} · projection</p>
      </Glass>
    </motion.div>
  );
}

function TaskItem({ t, onToggle }: { t: Lab["tasks"][number]; onToggle: () => void }) {
  return (
    <motion.li layout className={`ga-task ${t.done ? "is-done" : ""}`} transition={spring}>
      <button className="ga-check" onClick={onToggle} aria-pressed={t.done} aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`}>
        <svg viewBox="0 0 20 20" width="20" height="20"><motion.path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          initial={false} animate={{ pathLength: t.done ? 1 : 0, opacity: t.done ? 1 : 0 }} transition={{ duration: 0.3 }} /></svg>
      </button>
      <span className="ga-task-title">{t.title}</span>
      {t.overdue && !t.done && <span className="ga-chip ga-chip--warn">overdue</span>}
      {t.time && <span className="ga-task-time">{t.time}</span>}
      <span className={`ga-prio ga-prio--${t.priority}`} aria-label={`${t.priority} priority`} />
    </motion.li>
  );
}

// ---------------------------------------------------------------- finance

const chartTheme: ChartTheme = { income: "#6fb6ff", expense: "#ff9d6b", grid: "rgba(255,255,255,.08)", axis: "rgba(235,242,248,.6)", tooltipClass: "ga-tooltip" };
const chartThemeLight: ChartTheme = { income: "#2a78d6", expense: "#d95926", grid: "rgba(10,30,50,.08)", axis: "rgba(20,35,50,.6)", tooltipClass: "ga-tooltip" };

function Finance({ lab, light }: { lab: Lab; light: boolean }) {
  return (
    <motion.div className="ga-grid" variants={stagger(0.06)} initial="hidden" animate="show">
      <Glass strong className="ga-equation">
        {[{ l: "Income", v: fm(MONTH.income), c: "in" }, { l: "Expenses", v: fm(MONTH.expense), c: "out" }, { l: "Net cash flow", v: fm(MONTH.net, { sign: true }), c: "net" }].map((x, i) => (
          <div key={x.l} className={`ga-eq ga-eq--${x.c}`}>
            {i > 0 && <span className="ga-eq-op">{i === 1 ? "−" : "="}</span>}
            <div><p className="ga-label">{x.l}</p>{lab.loading ? <div className="ga-skel" style={{ height: 34, width: 180 }} /> : <p className="ga-eq-v">{x.v}</p>}</div>
          </div>
        ))}
        <div className="ga-eq-budget">
          <Ring value={MONTH.budgetPct} size={84} stroke={7} color="var(--ga-accent)" track="var(--ga-track)"><b>{MONTH.budgetPct}%</b></Ring>
          <div><p className="ga-label">Budget used</p><p className="ga-sub" style={{ marginTop: 2 }}>{fm(MONTH.budgetSpent)} of {fm(MONTH.budgetLimit)}<br />{MONTH.daysLeft} days left</p></div>
        </div>
        <p className="ga-sub ga-eq-note">October 2026 · actual transactions · transfers excluded</p>
      </Glass>
      <Glass className="ga-chart">
        <div className="ga-card-head"><h2>Cash flow</h2>
          <div className="ga-legend"><span><i style={{ background: (light ? chartThemeLight : chartTheme).income }} />Income</span><span><i style={{ background: (light ? chartThemeLight : chartTheme).expense }} />Expenses</span></div>
        </div>
        {lab.loading ? <div className="ga-skel" style={{ height: 230 }} /> : <FlowChart theme={light ? chartThemeLight : chartTheme} height={230} />}
      </Glass>
      <Glass className="ga-spend">
        <div className="ga-card-head"><h2>Where it went</h2><span className="ga-muted">hover the ring</span></div>
        <div className="ga-spend-body">
          <Donut size={176} thickness={16} track="var(--ga-track)" text="var(--ga-ink)" sub={fm(MONTH.expense)} />
          <ul className="ga-spend-list">
            {SPENDING.map((s) => <li key={s.name}><i style={{ background: s.color }} /><span>{s.name}</span><b>{fm(s.amount)}</b></li>)}
          </ul>
        </div>
      </Glass>
      <Glass className="ga-acc-cards">
        <div className="ga-card-head"><h2>Accounts</h2></div>
        {ACCOUNTS.map((a) => (
          <div key={a.id} className="ga-acc-card">
            <div><p>{a.name}</p><small>{a.kind}</small></div>
            <Sparkline values={a.trend} color="var(--ga-accent)" width={90} height={30} />
            <b>{fm(a.balance)}</b>
          </div>
        ))}
        <div className="ga-liab"><span>Outstanding · {LIABILITIES.name}</span><b>{fm(LIABILITIES.outstanding)}</b></div>
      </Glass>
    </motion.div>
  );
}

// ---------------------------------------------------------------- transactions

function Transactions({ lab }: { lab: Lab }) {
  const groups = groupByDay(lab.visibleTxs);
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="ga-tx">
      <motion.div variants={rise} className="ga-tx-bar">
        <div className="ga-seg" role="tablist">
          {(["all", "expense", "income", "transfer"] as const).map((f) => (
            <button key={f} role="tab" aria-selected={lab.txFilter === f} onClick={() => lab.setTxFilter(f)}>
              {lab.txFilter === f && <motion.span layoutId="ga-seg" className="ga-seg-pill" transition={spring} />}
              <span>{f === "all" ? "All" : f === "expense" ? "Expenses" : f === "income" ? "Income" : "Transfers"}</span>
            </button>
          ))}
        </div>
        <label className="ga-search"><Search size={15} /><input placeholder="Search merchant, category…" value={lab.query} onChange={(e) => lab.setQuery(e.target.value)} /></label>
      </motion.div>
      <Glass className="ga-tx-list">
        {groups.length === 0 ? (
          <div className="ga-empty">
            <div className="ga-empty-orb"><Search size={22} /></div>
            <p>Nothing matches “{lab.query}”</p>
            <span>Try another merchant or clear the filter.</span>
            <button className="ga-btn" onClick={() => { lab.setQuery(""); lab.setTxFilter("all"); }}>Clear filters</button>
          </div>
        ) : groups.map(([day, items]) => (
          <div key={day} className="ga-tx-group">
            <p className="ga-tx-day">{dayLabel(day)}</p>
            {items.map((t) => (
              <motion.button layout key={t.id} className={`ga-tx-row ${t.session ? "is-new" : ""}`} onClick={() => lab.setSelectedTx(t)} whileTap={{ scale: 0.99 }}>
                <span className={`ga-tx-icon ga-tx-icon--${t.type}`}>{t.type === "income" ? <ArrowDownLeft size={16} /> : t.type === "transfer" ? <ArrowLeftRight size={16} /> : <ArrowUpRight size={16} />}</span>
                <span className="ga-tx-main"><b>{t.title}</b><small>{t.category} · {t.account}</small></span>
                <span className={`ga-tx-amt ga-tx-amt--${t.type}`}>{t.type === "transfer" ? fm(t.amount) : fm(txSigned(t), { sign: true })}</span>
              </motion.button>
            ))}
          </div>
        ))}
      </Glass>
    </motion.div>
  );
}

function TxSheet({ lab }: { lab: Lab }) {
  const t = lab.selectedTx;
  return (
    <AnimatePresence>
      {t && (
        <>
          <motion.div className="ga-scrim" onClick={() => lab.setSelectedTx(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="ga-sheet" role="dialog" aria-label="Transaction details" initial={{ x: "105%" }} animate={{ x: 0 }} exit={{ x: "105%" }} transition={{ type: "spring", stiffness: 300, damping: 34 }}>
            <button className="ga-icon-btn ga-sheet-close" aria-label="Close" onClick={() => lab.setSelectedTx(null)}><X size={16} /></button>
            <span className={`ga-tx-icon ga-tx-icon--${t.type} ga-tx-icon--lg`}>{t.type === "income" ? <ArrowDownLeft size={22} /> : t.type === "transfer" ? <ArrowLeftRight size={22} /> : <ArrowUpRight size={22} />}</span>
            <p className="ga-sheet-amt">{t.type === "transfer" ? fm(t.amount) : fm(txSigned(t), { sign: true })}</p>
            <p className="ga-sheet-title">{t.title}</p>
            <dl className="ga-dl">
              <div><dt>Date</dt><dd>{dayLabel(t.date)}</dd></div>
              <div><dt>Category</dt><dd>{t.category}</dd></div>
              <div><dt>Account</dt><dd>{t.account}</dd></div>
              <div><dt>Type</dt><dd style={{ textTransform: "capitalize" }}>{t.type}</dd></div>
              {t.note && <div><dt>Note</dt><dd>{t.note}</dd></div>}
            </dl>
            <p className="ga-sub">{DEMO_LABEL} — editing is disabled in the design lab.</p>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- goals

function Goals({ onOpen }: { onOpen: (g: Goal) => void }) {
  return (
    <motion.div className="ga-goal-grid" variants={stagger(0.08)} initial="hidden" animate="show">
        {GOALS.map((g, i) => (
          <motion.button key={g.id} variants={rise} className={`ga-goal-card ${i === 0 ? "is-wide" : ""}`} onClick={() => onOpen(g)} whileHover={{ y: -4 }} transition={spring}>
            <Photo name={g.image} layoutId={`ga-goal-img-${g.id}`} className="ga-goal-img" />
            <motion.div layoutId={`ga-goal-cap-${g.id}`} className="ga-goal-cap">
              <small>{g.category}</small>
              <h3>{g.title}</h3>
              <div className="ga-meter"><motion.span initial={{ width: 0 }} animate={{ width: `${g.progress}%` }} transition={{ duration: 1.1, delay: 0.3 + i * 0.1 }} /></div>
              <p><b>{g.progress}%</b> · {g.detail} · by {g.due}</p>
            </motion.div>
          </motion.button>
        ))}
    </motion.div>
  );
}

function GoalDetail({ goal: open, onClose }: { goal: Goal | null; onClose: () => void }) {
  return (
      <AnimatePresence>
        {open && (
          <motion.div className="ga-goal-detail-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
            <motion.div className="ga-goal-detail" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={open.title}>
              <Photo name={open.image} layoutId={`ga-goal-img-${open.id}`} className="ga-goal-detail-img" />
              <motion.div layoutId={`ga-goal-cap-${open.id}`} className="ga-goal-cap ga-goal-cap--detail">
                <small>{open.category}</small>
                <h3>{open.title}</h3>
                <div className="ga-meter"><span style={{ width: `${open.progress}%` }} /></div>
                <p><b>{open.progress}%</b> · {open.detail} · by {open.due}</p>
                <ul className="ga-ms">
                  {open.milestones.map((m) => <li key={m.title} className={m.done ? "is-done" : ""}><span>{m.done ? <Check size={13} strokeWidth={3} /> : null}</span>{m.title}</li>)}
                </ul>
              </motion.div>
              <button className="ga-icon-btn ga-sheet-close" aria-label="Close" onClick={onClose}><X size={16} /></button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
  );
}

// ---------------------------------------------------------------- tasks

function Tasks({ lab }: { lab: Lab }) {
  const [title, setTitle] = useState("");
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" animate="show" className="ga-tasks">
      <motion.div variants={rise} className="ga-tx-bar">
        <div className="ga-seg" role="tablist">
          {(["today", "upcoming", "done"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={lab.taskView === v} onClick={() => lab.setTaskView(v)}>
              {lab.taskView === v && <motion.span layoutId="ga-seg-t" className="ga-seg-pill" transition={spring} />}
              <span style={{ textTransform: "capitalize" }}>{v}</span>
            </button>
          ))}
        </div>
        <form className="ga-search ga-add" onSubmit={(e) => { e.preventDefault(); if (lab.addTask(title)) { setTitle(""); lab.notify("Task added · preview only"); } }}>
          <Plus size={15} /><input placeholder="Add a task for today…" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New task" />
        </form>
      </motion.div>
      <Glass className="ga-task-panel">
        <AnimatePresence mode="popLayout" initial={false}>
          {lab.visibleTasks.length === 0 ? (
            <motion.div key="empty" className="ga-empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <div className="ga-empty-orb"><Sparkles size={22} /></div>
              <p>{lab.taskView === "done" ? "Nothing completed yet" : "All clear"}</p>
              <span>{lab.taskView === "done" ? "Check something off — it lands here." : "Nothing left in this view. Enjoy the space."}</span>
            </motion.div>
          ) : (
            <ul className="ga-tasklist ga-tasklist--lg">
              {lab.visibleTasks.map((t) => (
                <motion.div key={t.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30, transition: { duration: 0.25 } }}>
                  <TaskItem t={t} onToggle={() => lab.toggleTask(t.id)} />
                </motion.div>
              ))}
            </ul>
          )}
        </AnimatePresence>
      </Glass>
    </motion.div>
  );
}

// ---------------------------------------------------------------- quick add

function QuickAdd({ lab }: { lab: Lab }) {
  const q = lab.quick;
  return (
    <AnimatePresence>
      {q.open && (
        <>
          <motion.div className="ga-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => q.setOpen(false)} />
          <motion.form layoutId="ga-quick" className="ga-quick" role="dialog" aria-label="Quick add transaction" transition={spring} noValidate
            onSubmit={(e) => { e.preventDefault(); q.submit(); }}
            onKeyDown={(e) => e.key === "Escape" && q.setOpen(false)}>
            <motion.div key={q.shake} animate={q.shake ? shakeX : undefined} className="ga-quick-inner">
              <div className="ga-quick-head">
                <h2>New transaction</h2>
                <button type="button" className="ga-icon-btn" aria-label="Close" onClick={() => q.setOpen(false)}><X size={16} /></button>
              </div>
              <div className="ga-seg ga-seg--full" role="tablist">
                {(["expense", "income"] as const).map((t) => (
                  <button type="button" key={t} role="tab" aria-selected={q.form.type === t} onClick={() => q.set("type", t)}>
                    {q.form.type === t && <motion.span layoutId="ga-q-seg" className="ga-seg-pill" transition={spring} />}
                    <span style={{ textTransform: "capitalize" }}>{t}</span>
                  </button>
                ))}
              </div>
              <label className={`ga-amount ${q.errors.amount ? "has-error" : ""}`}>
                <span className="sr-only">Amount</span>
                <input autoFocus inputMode="decimal" placeholder="0" value={q.form.amount} onChange={(e) => q.set("amount", e.target.value)} aria-invalid={!!q.errors.amount} />
                <span>₸</span>
              </label>
              <AnimatePresence>{q.errors.amount && <motion.p className="ga-err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{q.errors.amount}</motion.p>}</AnimatePresence>
              <p className="ga-field-label">Category</p>
              <div className={`ga-cats ${q.errors.category ? "has-error" : ""}`}>
                {q.categories.map((c) => (
                  <button type="button" key={c} aria-pressed={q.form.category === c} onClick={() => q.set("category", c)}>{c}</button>
                ))}
              </div>
              <AnimatePresence>{q.errors.category && <motion.p className="ga-err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>{q.errors.category}</motion.p>}</AnimatePresence>
              <div className="ga-quick-row">
                <label><span className="ga-field-label">Account</span>
                  <select value={q.form.account} onChange={(e) => q.set("account", e.target.value)}>{ACCOUNTS.map((a) => <option key={a.id}>{a.name}</option>)}</select>
                </label>
                <label><span className="ga-field-label">Date</span><input type="date" value={q.form.date} onChange={(e) => q.set("date", e.target.value)} /></label>
              </div>
              <label><span className="ga-field-label">Note</span><input placeholder="What was it for?" value={q.form.title} onChange={(e) => q.set("title", e.target.value)} /></label>
              <button type="submit" className="ga-btn ga-btn--primary">Add transaction</button>
              <p className="ga-sub" style={{ textAlign: "center" }}>Preview only — nothing is saved.</p>
            </motion.div>
          </motion.form>
        </>
      )}
    </AnimatePresence>
  );
}

