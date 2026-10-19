import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownUp, ArrowLeftRight, Calendar, Check, ChevronDown, CircleDollarSign, Command, Flag, Inbox, LayoutDashboard, ListTodo, Plus,
  Search, SidebarClose, SidebarOpen, Target, Wallet, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ACCOUNTS, CASHFLOW, DEMO_LABEL, GOALS, LIABILITIES, MONTH, SPENDING, TOTAL_BALANCE, UPCOMING, UPCOMING_TOTAL, WEEK_LABELS,
  type Goal, type Screen, type Tx,
} from "../../data";
import { FlowChart, type ChartTheme } from "../../shared/charts";
import { dayLabel, fm, txSigned } from "../../shared/fmt";
import { useDismiss, type ConceptProps } from "../../shared/hooks";
import { shakeX, spring } from "../../shared/motion";
import { Photo } from "../../shared/Photo";
import { useLab, type Lab } from "../../shared/useLab";
import "./native.css";

const TITLES: Record<Screen, [string, string]> = {
  dashboard: ["Today", "Monday, 19 October 2026"],
  finance: ["Money", "October 2026 · all accounts"],
  transactions: ["Transactions", "12 entries · October"],
  goals: ["Goals", "4 active"],
  tasks: ["Tasks", "Today and upcoming"],
};
const page = {
  initial: { opacity: 0, x: 10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.24, ease: [0.25, 0.8, 0.25, 1] } },
  exit: { opacity: 0, x: -6, transition: { duration: 0.12 } },
};

export default function NativeConcept({ theme, screen, onScreen, preview }: ConceptProps) {
  const lab = useLab();
  const [palette, setPalette] = useState(false);
  const [sidebar, setSidebar] = useState(true);

  useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") { e.preventDefault(); lab.quick.setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview, lab.quick]);

  return (
    <div className={`nd-root nd-${theme}`}>
      <Photo name={theme === "light" ? "arches" : "earth"} className="nd-wallpaper" eager />
      <div className={`nd-window ${sidebar ? "" : "is-collapsed"}`}>
        <AnimatePresence initial={false}>
          {sidebar && (
            <motion.aside className="nd-sidebar" initial={{ width: 0, opacity: 0 }} animate={{ width: 248, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.25, ease: [0.25, 0.8, 0.25, 1] }}>
              <Sidebar screen={screen} onScreen={onScreen} lab={lab} />
            </motion.aside>
          )}
        </AnimatePresence>
        <section className="nd-main">
          <Toolbar screen={screen} lab={lab} sidebar={sidebar} onSidebar={() => setSidebar((s) => !s)} onPalette={() => setPalette(true)} />
          <div className="nd-content">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={screen} className="nd-page" {...page}>
                {screen === "dashboard" && <Dashboard lab={lab} onScreen={onScreen} theme={theme} />}
                {screen === "finance" && <Money lab={lab} theme={theme} />}
                {screen === "transactions" && <Transactions lab={lab} />}
                {screen === "goals" && <Goals />}
                {screen === "tasks" && <Tasks lab={lab} />}
              </motion.div>
            </AnimatePresence>
          </div>
          <QuickSheet lab={lab} />
        </section>
      </div>
      <Palette open={palette} onClose={() => setPalette(false)} onScreen={onScreen} lab={lab} />
      <AnimatePresence>
        {lab.toast && (
          <motion.div className="nd-toast" role="status" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2 }}>
            <Check size={14} /> {lab.toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- chrome

function SideItem({ active, icon: Icon, label, badge, onClick }: { active: boolean; icon: typeof Inbox; label: string; badge?: ReactNode; onClick: () => void }) {
  return (
    <button className={`nd-side-item ${active ? "is-active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      {active && <motion.span layoutId="nd-side-sel" className="nd-side-sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
      <Icon size={16} strokeWidth={1.8} /><span>{label}</span>{badge !== undefined && <em>{badge}</em>}
    </button>
  );
}

function Sidebar({ screen, onScreen, lab }: { screen: Screen; onScreen: (s: Screen) => void; lab: Lab }) {
  const open = lab.tasks.filter((t) => t.when === "today" && !t.done).length;
  return (
    <div className="nd-side-inner">
      <div className="nd-traffic" aria-hidden><i /><i /><i /></div>
      <p className="nd-side-h">Personal</p>
      <SideItem active={screen === "dashboard"} icon={LayoutDashboard} label="Today" onClick={() => onScreen("dashboard")} />
      <SideItem active={screen === "tasks"} icon={ListTodo} label="Tasks" badge={open} onClick={() => onScreen("tasks")} />
      <SideItem active={screen === "goals"} icon={Target} label="Goals" badge={GOALS.length} onClick={() => onScreen("goals")} />
      <p className="nd-side-h">Money</p>
      <SideItem active={screen === "finance"} icon={Wallet} label="Overview" onClick={() => onScreen("finance")} />
      <SideItem active={screen === "transactions"} icon={ArrowLeftRight} label="Transactions" badge={lab.txs.length} onClick={() => onScreen("transactions")} />
      <p className="nd-side-h">Accounts</p>
      {ACCOUNTS.map((a) => (
        <div key={a.id} className="nd-side-acc"><span><CircleDollarSign size={14} /> {a.name}</span><b>{fm(a.balance)}</b></div>
      ))}
      <div className="nd-side-foot"><span className="nd-demo">{DEMO_LABEL}</span><span>Not your finances</span></div>
    </div>
  );
}

function Toolbar({ screen, lab, sidebar, onSidebar, onPalette }: { screen: Screen; lab: Lab; sidebar: boolean; onSidebar: () => void; onPalette: () => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(menu, () => setMenu(false), ref);
  return (
    <header className="nd-toolbar">
      {!sidebar && <div className="nd-traffic nd-traffic--bar" aria-hidden><i /><i /><i /></div>}
      <button className="nd-tool" aria-label={sidebar ? "Hide sidebar" : "Show sidebar"} onClick={onSidebar}>{sidebar ? <SidebarClose size={17} /> : <SidebarOpen size={17} />}</button>
      <div className="nd-title">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={screen} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15 }}>
            <h1>{TITLES[screen][0]}</h1><p>{TITLES[screen][1]}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <button className="nd-search-btn" onClick={onPalette}><Search size={14} /> <span>Search or run a command</span><kbd><Command size={11} />K</kbd></button>
      <div className="nd-split" ref={ref}>
        <button className="nd-split-main" onClick={() => lab.quick.setOpen(true)}><Plus size={15} /> New Transaction</button>
        <button className="nd-split-more" aria-label="More create options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><ChevronDown size={14} /></button>
        <AnimatePresence>
          {menu && (
            <motion.div className="nd-menu" role="menu" initial={{ opacity: 0, scale: 0.97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.14 }} style={{ transformOrigin: "top right" }}>
              <button role="menuitem" onClick={() => { setMenu(false); lab.quick.setOpen(true); }}><ArrowLeftRight size={14} /> New Transaction <kbd>⌘N</kbd></button>
              <button role="menuitem" onClick={() => { setMenu(false); lab.addTask("New task"); lab.notify("Task added · preview only"); }}><ListTodo size={14} /> New Task</button>
              <button role="menuitem" onClick={() => { setMenu(false); lab.notify("Goals editor is part of the real app"); }}><Flag size={14} /> New Goal</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- dashboard

function nativeChart(theme: "dark" | "light"): ChartTheme {
  return theme === "light"
    ? { income: "#0a84ff", expense: "#ff9f0a", grid: "rgba(0,0,0,.07)", axis: "#6e6e73", tooltipClass: "nd-tooltip" }
    : { income: "#409cff", expense: "#ffb340", grid: "rgba(255,255,255,.08)", axis: "#98989d", tooltipClass: "nd-tooltip" };
}

function Dashboard({ lab, onScreen, theme }: { lab: Lab; onScreen: (s: Screen) => void; theme: "dark" | "light" }) {
  const today = lab.tasks.filter((t) => t.when === "today");
  return (
    <div className="nd-dash">
      <div className="nd-kpis">
        {[
          { l: "Available", v: fm(TOTAL_BALANCE), s: "3 accounts · not net worth" },
          { l: "Income · Oct", v: fm(MONTH.income), s: "1 payer" },
          { l: "Expenses · Oct", v: fm(MONTH.expense), s: `Budget ${MONTH.budgetPct}% used` },
          { l: "Net cash flow", v: fm(MONTH.net, { sign: true }), s: "47.6% of income", tone: "good" },
          { l: "Owed", v: fm(LIABILITIES.outstanding), s: LIABILITIES.name },
        ].map((k) => (
          <div key={k.l} className="nd-kpi"><p>{k.l}</p><b className={k.tone === "good" ? "nd-good" : ""}>{lab.loading ? "—" : k.v}</b><small>{k.s}</small></div>
        ))}
      </div>

      <div className="nd-dash-grid">
        <section className="nd-box nd-today">
          <header className="nd-box-h"><h2>Today</h2><button className="nd-link" onClick={() => onScreen("tasks")}>Show all</button></header>
          <ul className="nd-tasks">{today.map((t) => <TaskRow key={t.id} t={t} onToggle={() => lab.toggleTask(t.id)} />)}</ul>
        </section>

        <section className="nd-box nd-flow">
          <header className="nd-box-h"><h2>Cash flow</h2><span className="nd-legend"><i style={{ background: nativeChart(theme).income }} />Income <i style={{ background: nativeChart(theme).expense }} />Expenses</span></header>
          <FlowChart theme={nativeChart(theme)} variant="bars" height={190} />
        </section>

        <section className="nd-box nd-upcoming">
          <header className="nd-box-h"><h2>Upcoming</h2><span className="nd-muted">Expected · {fm(UPCOMING_TOTAL)} in 30 days</span></header>
          <table className="nd-table nd-table--compact">
            <tbody>
              {UPCOMING.map((p) => (
                <tr key={p.id}><td className="nd-when">{p.when}</td><td>{p.name}</td><td className="nd-muted">{p.kind}</td><td className="num">{fm(p.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="nd-box nd-budget">
          <header className="nd-box-h"><h2>Budgets</h2><span className="nd-muted">{MONTH.daysLeft} days left</span></header>
          <table className="nd-table nd-table--compact">
            <tbody>
              {SPENDING.slice(0, 5).map((s, i) => {
                const pct = [72, 97, 76, 55, 71][i];
                return (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td className="nd-barcell"><span className="nd-inline-bar"><motion.i className={pct > 90 ? "is-warn" : ""} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, delay: 0.1 + i * 0.04 }} /></span></td>
                    <td className="num nd-muted">{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="nd-box nd-habits">
          <header className="nd-box-h"><h2>Habits</h2><span className="nd-muted">Last 7 days</span></header>
          <table className="nd-habit-grid">
            <thead><tr><th />{WEEK_LABELS.map((d, i) => <th key={i}>{d}</th>)}<th className="num">Rate</th></tr></thead>
            <tbody>
              {lab.habits.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  {h.week.map((v, i) => (
                    <td key={i}>
                      <button className={`nd-cell ${v ? "is-on" : ""} ${i === 6 ? "is-today" : ""}`} style={{ "--c": h.color } as React.CSSProperties}
                        disabled={i !== 6} onClick={() => lab.toggleHabit(h.id)} aria-pressed={v} aria-label={`${h.name} ${i === 6 ? "today" : WEEK_LABELS[i]}`} />
                    </td>
                  ))}
                  <td className="num nd-muted">{h.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="nd-box nd-goals-mini">
          <header className="nd-box-h"><h2>Goals</h2><button className="nd-link" onClick={() => onScreen("goals")}>Open</button></header>
          {GOALS.map((g) => (
            <button key={g.id} className="nd-goal-line" onClick={() => onScreen("goals")}>
              <Photo name={g.image} className="nd-thumb" />
              <span className="nd-goal-line-main"><b>{g.title}</b><span className="nd-inline-bar"><i style={{ width: `${g.progress}%` }} /></span></span>
              <span className="nd-muted num">{g.progress}%</span>
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}

function TaskRow({ t, onToggle }: { t: Lab["tasks"][number]; onToggle: () => void }) {
  return (
    <motion.li layout className={`nd-task ${t.done ? "is-done" : ""}`} transition={{ duration: 0.2 }}>
      <button className="nd-check" role="checkbox" aria-checked={t.done} aria-label={t.title} onClick={onToggle}>
        <AnimatePresence>{t.done && <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.15 }}><Check size={11} strokeWidth={3.5} /></motion.span>}</AnimatePresence>
      </button>
      <span className="nd-task-title">{t.title}</span>
      {t.overdue && !t.done && <span className="nd-tag nd-tag--red">Overdue</span>}
      {t.project && <span className="nd-tag">{t.project}</span>}
      <span className="nd-task-time">{t.time ?? ""}</span>
      <Flag size={13} className={`nd-flag nd-flag--${t.priority}`} aria-label={`${t.priority} priority`} />
    </motion.li>
  );
}

// ---------------------------------------------------------------- money

function Money({ lab, theme }: { lab: Lab; theme: "dark" | "light" }) {
  const [range, setRange] = useState<"1M" | "6M" | "YTD">("6M");
  return (
    <div className="nd-money">
      <div className="nd-money-top">
        <div className="nd-seg" role="tablist" aria-label="Range">
          {(["1M", "6M", "YTD"] as const).map((r) => (
            <button key={r} role="tab" aria-selected={range === r} onClick={() => { setRange(r); lab.refresh(); }}>
              {range === r && <motion.span layoutId="nd-seg" className="nd-seg-sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}<span>{r}</span>
            </button>
          ))}
        </div>
        <span className="nd-muted">Actual transactions · transfers excluded</span>
      </div>
      <div className="nd-kpis nd-kpis--money">
        {[{ l: "Income", v: MONTH.income }, { l: "Expenses", v: MONTH.expense }, { l: "Net cash flow", v: MONTH.net, good: true }, { l: "Expected · 30 days", v: UPCOMING_TOTAL }].map((k) => (
          <div key={k.l} className="nd-kpi"><p>{k.l}</p>{lab.loading ? <span className="nd-skel" /> : <b className={k.good ? "nd-good" : ""}>{fm(k.v, { sign: k.good })}</b>}</div>
        ))}
      </div>
      <div className="nd-money-grid">
        <section className="nd-box">
          <header className="nd-box-h"><h2>Income and expenses</h2><span className="nd-legend"><i style={{ background: nativeChart(theme).income }} />Income <i style={{ background: nativeChart(theme).expense }} />Expenses</span></header>
          {lab.loading ? <div className="nd-skel nd-skel--chart" /> : <FlowChart theme={nativeChart(theme)} height={240} />}
        </section>
        <section className="nd-box">
          <header className="nd-box-h"><h2>By category</h2><span className="nd-muted">October</span></header>
          <table className="nd-table">
            <thead><tr><th>Category</th><th className="num">Share</th><th className="num">Amount</th></tr></thead>
            <tbody>{SPENDING.map((s) => (
              <tr key={s.name}><td><i className="nd-dot" style={{ background: s.color }} />{s.name}</td><td className="num nd-muted">{s.pct}%</td><td className="num">{fm(s.amount)}</td></tr>
            ))}</tbody>
            <tfoot><tr><td>Total</td><td /><td className="num">{fm(MONTH.expense)}</td></tr></tfoot>
          </table>
        </section>
        <section className="nd-box nd-span">
          <header className="nd-box-h"><h2>Accounts</h2></header>
          <table className="nd-table">
            <thead><tr><th>Account</th><th>Type</th>{CASHFLOW.map((c) => <th key={c.month} className="num">{c.month}</th>)}<th className="num">Balance</th></tr></thead>
            <tbody>{ACCOUNTS.map((a) => (
              <tr key={a.id}><td>{a.name}</td><td className="nd-muted">{a.kind}</td>{a.trend.slice(1).map((v, i) => <td key={i} className="num nd-muted">{(v * 1000).toFixed(0)}k</td>)}<td className="num"><b>{fm(a.balance)}</b></td></tr>
            ))}</tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- transactions

type SortKey = "date" | "title" | "category" | "amount";

function Transactions({ lab }: { lab: Lab }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const rows = useMemo(() => {
    const val = (t: Tx) => (sort.key === "amount" ? Number(txSigned(t)) : t[sort.key]);
    return [...lab.visibleTxs].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [lab.visibleTxs, sort]);
  const sel = lab.selectedTx;

  function onKey(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const i = sel ? rows.findIndex((r) => r.id === sel.id) : -1;
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
    if (next) lab.setSelectedTx(next);
  }
  const Th = ({ k, children, num }: { k: SortKey; children: ReactNode; num?: boolean }) => (
    <th className={num ? "num" : ""} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button className="nd-sort" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {children}{sort.key === k && <ArrowDownUp size={11} />}
      </button>
    </th>
  );

  return (
    <div className={`nd-tx ${sel ? "has-inspector" : ""}`}>
      <div className="nd-tx-main">
        <div className="nd-filterbar">
          <div className="nd-seg" role="tablist">
            {(["all", "expense", "income", "transfer"] as const).map((f) => (
              <button key={f} role="tab" aria-selected={lab.txFilter === f} onClick={() => lab.setTxFilter(f)}>
                {lab.txFilter === f && <motion.span layoutId="nd-seg-tx" className="nd-seg-sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <span>{f === "all" ? "All" : f === "expense" ? "Expenses" : f === "income" ? "Income" : "Transfers"}</span>
              </button>
            ))}
          </div>
          <label className="nd-field"><Search size={13} /><input placeholder="Filter" value={lab.query} onChange={(e) => lab.setQuery(e.target.value)} /></label>
          <span className="nd-muted nd-count">{rows.length} of {lab.txs.length}</span>
        </div>
        {rows.length === 0 ? (
          <div className="nd-empty"><Inbox size={28} strokeWidth={1.4} /><p>No Results</p><span>No transactions match “{lab.query}”.</span><button className="nd-btn" onClick={() => { lab.setQuery(""); lab.setTxFilter("all"); }}>Clear Filter</button></div>
        ) : (
          <div className="nd-table-wrap" tabIndex={0} onKeyDown={onKey} aria-label="Transactions (use arrow keys to move)">
            <table className="nd-table nd-table--rows">
              <thead><tr><Th k="date">Date</Th><Th k="title">Payee</Th><Th k="category">Category</Th><th>Account</th><Th k="amount" num>Amount</Th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className={`${sel?.id === t.id ? "is-selected" : ""} ${t.session ? "is-new" : ""}`} onClick={() => lab.setSelectedTx(sel?.id === t.id ? null : t)}>
                    <td className="nd-muted">{dayLabel(t.date).replace(/^(\w+), /, "")}</td>
                    <td>{t.title}</td>
                    <td><span className="nd-tag">{t.category}</span></td>
                    <td className="nd-muted">{t.account}</td>
                    <td className={`num nd-amt--${t.type}`}>{t.type === "transfer" ? fm(t.amount) : fm(txSigned(t), { sign: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <AnimatePresence>
        {sel && (
          <motion.aside className="nd-inspector" role="complementary" aria-label="Inspector" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 36 }}>
            <header><span className="nd-muted">Inspector</span><button className="nd-tool" aria-label="Close inspector" onClick={() => lab.setSelectedTx(null)}><X size={14} /></button></header>
            <motion.div key={sel.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
              <p className={`nd-insp-amt nd-amt--${sel.type}`}>{sel.type === "transfer" ? fm(sel.amount) : fm(txSigned(sel), { sign: true })}</p>
              <p className="nd-insp-title">{sel.title}</p>
              <dl className="nd-form-dl">
                <dt>Date</dt><dd>{dayLabel(sel.date)}</dd>
                <dt>Category</dt><dd>{sel.category}</dd>
                <dt>Account</dt><dd>{sel.account}</dd>
                <dt>Type</dt><dd style={{ textTransform: "capitalize" }}>{sel.type}</dd>
                {sel.note && <><dt>Note</dt><dd>{sel.note}</dd></>}
              </dl>
              <p className="nd-muted nd-fine">↑ ↓ to move between rows. {DEMO_LABEL} — read-only.</p>
            </motion.div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- goals

function Goals() {
  const [sel, setSel] = useState<Goal>(GOALS[0]);
  return (
    <div className="nd-goals">
      <ul className="nd-goal-list" role="listbox" aria-label="Goals">
        {GOALS.map((g) => (
          <li key={g.id}>
            <button role="option" aria-selected={sel.id === g.id} className={`nd-goal-item ${sel.id === g.id ? "is-active" : ""}`} onClick={() => setSel(g)}>
              {sel.id === g.id && <motion.span layoutId="nd-goal-sel" className="nd-side-sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <Photo name={g.image} className="nd-thumb nd-thumb--lg" />
              <span className="nd-goal-item-main"><b>{g.title}</b><small>{g.category} · {g.due}</small><span className="nd-inline-bar"><i style={{ width: `${g.progress}%` }} /></span></span>
              <span className="num">{g.progress}%</span>
            </button>
          </li>
        ))}
      </ul>
      <AnimatePresence mode="wait">
        <motion.article key={sel.id} className="nd-goal-detail" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <Photo name={sel.image} className="nd-goal-hero" grade="linear-gradient(180deg, transparent 40%, rgba(0,0,0,.55))" />
          <div className="nd-goal-body">
            <p className="nd-muted">{sel.category}</p>
            <h2>{sel.title}</h2>
            <div className="nd-goal-stats">
              <div><p>Progress</p><b>{sel.progress}%</b></div>
              <div><p>Target date</p><b>{sel.due}</b></div>
              <div><p>Status</p><b>{sel.detail}</b></div>
            </div>
            <h3>Milestones</h3>
            <ul className="nd-tasks">
              {sel.milestones.map((m) => (
                <li key={m.title} className={`nd-task ${m.done ? "is-done" : ""}`}><span className="nd-check" aria-hidden>{m.done && <Check size={11} strokeWidth={3.5} />}</span><span className="nd-task-title">{m.title}</span></li>
              ))}
            </ul>
          </div>
        </motion.article>
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- tasks

function Tasks({ lab }: { lab: Lab }) {
  const [title, setTitle] = useState("");
  const groups: [string, Lab["tasks"]][] = lab.taskView === "done"
    ? [["Completed", lab.visibleTasks]]
    : lab.taskView === "today"
      ? [["Overdue", lab.visibleTasks.filter((t) => t.overdue)], ["Today", lab.visibleTasks.filter((t) => !t.overdue)]]
      : [["Upcoming", lab.visibleTasks]];
  const empty = lab.visibleTasks.length === 0;
  return (
    <div className="nd-tasks-page">
      <div className="nd-filterbar">
        <div className="nd-seg" role="tablist">
          {(["today", "upcoming", "done"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={lab.taskView === v} onClick={() => lab.setTaskView(v)}>
              {lab.taskView === v && <motion.span layoutId="nd-seg-t" className="nd-seg-sel" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <span style={{ textTransform: "capitalize" }}>{v === "done" ? "Completed" : v}</span>
            </button>
          ))}
        </div>
        <span className="nd-muted"><Calendar size={13} style={{ verticalAlign: -2 }} /> Monday, 19 October</span>
      </div>
      <form className="nd-new-task" onSubmit={(e) => { e.preventDefault(); if (lab.addTask(title)) { setTitle(""); lab.notify("Task added · preview only"); } }}>
        <Plus size={15} /><input placeholder="New Task" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New task" /><kbd>↵</kbd>
      </form>
      {empty ? (
        <div className="nd-empty"><Check size={28} strokeWidth={1.4} /><p>{lab.taskView === "done" ? "No Completed Tasks" : "All Done"}</p><span>{lab.taskView === "done" ? "Completed tasks appear here." : "Nothing left in this list."}</span></div>
      ) : groups.filter(([, items]) => items.length).map(([label, items]) => (
        <section key={label} className="nd-task-group">
          <h3 className={label === "Overdue" ? "nd-red" : ""}>{label} <span className="nd-muted">{items.length}</span></h3>
          <ul className="nd-tasks nd-tasks--lg">
            <AnimatePresence initial={false}>
              {items.map((t) => (
                <motion.div key={t.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                  <TaskRow t={t} onToggle={() => lab.toggleTask(t.id)} />
                </motion.div>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- quick sheet (drops from toolbar like a macOS sheet)

function QuickSheet({ lab }: { lab: Lab }) {
  const q = lab.quick;
  return (
    <AnimatePresence>
      {q.open && (
        <>
          <motion.div className="nd-sheet-dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => q.setOpen(false)} />
          <motion.form className="nd-sheet" role="dialog" aria-label="New transaction" noValidate
            initial={{ y: "-105%" }} animate={{ y: 0 }} exit={{ y: "-105%" }} transition={{ type: "spring", stiffness: 420, damping: 38 }}
            onSubmit={(e) => { e.preventDefault(); q.submit(); }} onKeyDown={(e) => e.key === "Escape" && q.setOpen(false)}>
            <motion.div key={q.shake} animate={q.shake ? shakeX : undefined}>
              <h2>New Transaction</h2>
              <div className="nd-form">
                <label>Type</label>
                <div className="nd-seg" role="tablist">
                  {(["expense", "income"] as const).map((t) => (
                    <button type="button" key={t} role="tab" aria-selected={q.form.type === t} onClick={() => q.set("type", t)}>
                      {q.form.type === t && <motion.span layoutId="nd-q-seg" className="nd-seg-sel" transition={spring} />}<span style={{ textTransform: "capitalize" }}>{t}</span>
                    </button>
                  ))}
                </div>
                <label htmlFor="nd-amt">Amount</label>
                <div>
                  <div className={`nd-input nd-input--amt ${q.errors.amount ? "has-error" : ""}`}><input id="nd-amt" autoFocus inputMode="decimal" placeholder="0.00" value={q.form.amount} onChange={(e) => q.set("amount", e.target.value)} aria-invalid={!!q.errors.amount} /><span>₸</span></div>
                  {q.errors.amount && <p className="nd-err">{q.errors.amount}</p>}
                </div>
                <label htmlFor="nd-cat">Category</label>
                <div>
                  <select id="nd-cat" className={`nd-input ${q.errors.category ? "has-error" : ""}`} value={q.form.category} onChange={(e) => q.set("category", e.target.value)} aria-invalid={!!q.errors.category}>
                    <option value="">Choose…</option>
                    {q.categories.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  {q.errors.category && <p className="nd-err">{q.errors.category}</p>}
                </div>
                <label htmlFor="nd-acc">Account</label>
                <select id="nd-acc" className="nd-input" value={q.form.account} onChange={(e) => q.set("account", e.target.value)}>{ACCOUNTS.map((a) => <option key={a.id}>{a.name}</option>)}</select>
                <label htmlFor="nd-date">Date</label>
                <input id="nd-date" className="nd-input" type="date" value={q.form.date} onChange={(e) => q.set("date", e.target.value)} />
                <label htmlFor="nd-note">Note</label>
                <input id="nd-note" className="nd-input" placeholder="Optional" value={q.form.title} onChange={(e) => q.set("title", e.target.value)} />
              </div>
              <footer>
                <span className="nd-muted">Preview only · nothing is saved</span>
                <button type="button" className="nd-btn" onClick={() => q.setOpen(false)}>Cancel</button>
                <button type="submit" className="nd-btn nd-btn--primary">Add</button>
              </footer>
            </motion.div>
          </motion.form>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- command palette

function Palette({ open, onClose, onScreen, lab }: { open: boolean; onClose: () => void; onScreen: (s: Screen) => void; lab: Lab }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const items = useMemo(() => {
    const cmds = [
      { label: "New Transaction", hint: "⌘N", run: () => lab.quick.setOpen(true) },
      { label: "Go to Today", hint: "Navigation", run: () => onScreen("dashboard") },
      { label: "Go to Money", hint: "Navigation", run: () => onScreen("finance") },
      { label: "Go to Transactions", hint: "Navigation", run: () => onScreen("transactions") },
      { label: "Go to Goals", hint: "Navigation", run: () => onScreen("goals") },
      { label: "Go to Tasks", hint: "Navigation", run: () => onScreen("tasks") },
      ...lab.txs.slice(0, 8).map((t) => ({ label: t.title, hint: fm(txSigned(t), { sign: t.type !== "transfer" }), run: () => { onScreen("transactions"); lab.setSelectedTx(t); } })),
    ];
    const s = q.trim().toLowerCase();
    return s ? cmds.filter((c) => c.label.toLowerCase().includes(s)) : cmds;
  }, [q, lab, onScreen]);
  useEffect(() => { if (open) { setQ(""); setI(0); } }, [open]);
  useEffect(() => setI(0), [q]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="nd-pal-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} onClick={onClose}>
          <motion.div className="nd-pal" role="dialog" aria-label="Command palette" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.96, y: -8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.98 }} transition={{ duration: 0.16 }}>
            <label className="nd-pal-input"><Search size={18} />
              <input autoFocus placeholder="Search transactions or type a command" value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
                  if (e.key === "Enter" && items[i]) { items[i].run(); onClose(); }
                  if (e.key === "Escape") onClose();
                }} />
              <kbd>esc</kbd>
            </label>
            <ul className="nd-pal-list" role="listbox">
              {items.length === 0 && <li className="nd-pal-empty">No matches for “{q}”</li>}
              {items.map((c, idx) => (
                <li key={c.label + idx} role="option" aria-selected={idx === i}>
                  <button className={idx === i ? "is-active" : ""} onMouseEnter={() => setI(idx)} onClick={() => { c.run(); onClose(); }}>
                    <span>{c.label}</span><small>{c.hint}</small>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
