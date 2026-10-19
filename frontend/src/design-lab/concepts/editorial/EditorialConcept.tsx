import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import {
  ACCOUNTS, CASHFLOW, DEMO_LABEL, GOALS, LIABILITIES, MONTH, SPENDING, TOTAL_BALANCE, UPCOMING, UPCOMING_TOTAL, WEEK_LABELS,
  type Goal, type Screen,
} from "../../data";
import { FlowChart, type ChartTheme } from "../../shared/charts";
import { dayLabel, fm, splitMoney, txSigned } from "../../shared/fmt";
import { groupByDay, type ConceptProps } from "../../shared/hooks";
import { ease, lineUp, rise, shakeX, spring, stagger } from "../../shared/motion";
import { Photo } from "../../shared/Photo";
import { useLab, type Lab } from "../../shared/useLab";
import "./editorial.css";

const NAV: { id: Screen; label: string }[] = [
  { id: "dashboard", label: "Today" },
  { id: "finance", label: "Money" },
  { id: "transactions", label: "Ledger" },
  { id: "goals", label: "Goals" },
  { id: "tasks", label: "Agenda" },
];

const curtain = {
  initial: { clipPath: "inset(0 0 100% 0)", opacity: 1 },
  animate: { clipPath: "inset(0 0 0% 0)", transition: { duration: 0.75, ease: [0.76, 0, 0.24, 1] } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.22 } },
};

function Headline({ children, className = "" }: { children: string; className?: string }) {
  // Each line is masked and slides up — classic editorial reveal.
  return (
    <motion.h1 className={`eb-headline ${className}`} variants={stagger(0.08, 0.15)} initial="hidden" animate="show">
      {children.split("\n").map((line) => (
        <span key={line} className="eb-line"><motion.span variants={lineUp} style={{ display: "inline-block" }}>{line}</motion.span></span>
      ))}
    </motion.h1>
  );
}

export default function EditorialConcept({ theme, screen, onScreen }: ConceptProps) {
  const lab = useLab();
  const [goal, setGoal] = useState<Goal | null>(null);
  return (
    <div className={`eb-root eb-${theme}`}>
      <LayoutGroup id="eb">
        <Masthead screen={screen} onScreen={onScreen} lab={lab} />
        <div className="eb-scroll">
          <AnimatePresence mode="wait" initial={false}>
            <motion.main key={screen} className="eb-page" {...curtain}>
              {screen === "dashboard" && <Today lab={lab} onScreen={onScreen} onGoal={setGoal} />}
              {screen === "finance" && <Money lab={lab} theme={theme} />}
              {screen === "transactions" && <Ledger lab={lab} />}
              {screen === "goals" && <Goals onGoal={setGoal} />}
              {screen === "tasks" && <Agenda lab={lab} />}
            </motion.main>
          </AnimatePresence>
        </div>
        <GoalSpread goal={goal} onClose={() => setGoal(null)} />
        <MarginNote lab={lab} />
        <QuickEntry lab={lab} />
      </LayoutGroup>
      <AnimatePresence>
        {lab.toast && (
          <motion.p className="eb-toast" role="status" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={spring}>
            {lab.toast}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- masthead

function Masthead({ screen, onScreen, lab }: { screen: Screen; onScreen: (s: Screen) => void; lab: Lab }) {
  return (
    <header className="eb-mast">
      <div className="eb-mast-top">
        <span>Vol. III · No. 292</span>
        <span className="eb-demo">{DEMO_LABEL} edition</span>
        <span>Monday, 19 October 2026</span>
      </div>
      <div className="eb-mast-main">
        <nav className="eb-nav" aria-label="Sections">
          {NAV.map((n) => (
            <button key={n.id} aria-current={screen === n.id ? "page" : undefined} onClick={() => onScreen(n.id)}>
              {n.label}
              {screen === n.id && <motion.span layoutId="eb-nav-rule" className="eb-nav-rule" transition={spring} />}
            </button>
          ))}
        </nav>
        <p className="eb-logo" aria-label="Personal OS">Personal<em>OS</em></p>
        <div className="eb-mast-actions">
          <button className="eb-pill" onClick={() => lab.quick.setOpen(true)}><Plus size={16} /> New entry</button>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- today

function Today({ lab, onScreen, onGoal }: { lab: Lab; onScreen: (s: Screen) => void; onGoal: (g: Goal) => void }) {
  const bal = splitMoney(TOTAL_BALANCE);
  const today = lab.tasks.filter((t) => t.when === "today");
  return (
    <div className="eb-today">
      <section className="eb-cover">
        <Photo name="walker" className="eb-cover-img" eager position="center 60%" alt="A lone walker crossing a snowfield" />
        <div className="eb-cover-text">
          <p className="eb-kicker">The Monday Edition</p>
          <Headline>{"A quiet week,\na strong month."}</Headline>
          <motion.p className="eb-deck" variants={rise} initial="hidden" animate="show" transition={{ delay: 0.5 }}>
            You've kept <b>47.6%</b> of October's income so far. Three tasks stand between you and an empty desk — the first one is overdue.
          </motion.p>
        </div>
      </section>

      <motion.aside className="eb-ledger-col" variants={stagger(0.07, 0.3)} initial="hidden" animate="show">
        <motion.p variants={rise} className="eb-section-label">The balance sheet</motion.p>
        <motion.p variants={rise} className="eb-big">{bal.main}<span>{bal.rest}</span></motion.p>
        <motion.p variants={rise} className="eb-fine">Across three accounts · not net worth</motion.p>
        <motion.table variants={rise} className="eb-rule-table">
          <tbody>
            <tr><th>Income, October</th><td>{fm(MONTH.income)}</td></tr>
            <tr><th>Expenses</th><td>{fm(MONTH.expense)}</td></tr>
            <tr className="is-total"><th>Kept</th><td>{fm(MONTH.net, { sign: true })}</td></tr>
          </tbody>
        </motion.table>
        <motion.div variants={rise} className="eb-budget">
          <p><span>Budget</span><b>{MONTH.budgetPct}%</b></p>
          <div className="eb-rule-meter"><motion.span initial={{ scaleX: 0 }} animate={{ scaleX: MONTH.budgetPct / 100 }} transition={{ duration: 1.2, delay: 0.6, ease }} /></div>
          <small>{MONTH.daysLeft} days left in the month</small>
        </motion.div>
        <motion.button variants={rise} className="eb-more" onClick={() => onScreen("finance")}>Read the money report <ArrowRight size={15} /></motion.button>
      </motion.aside>

      <section className="eb-agenda-col">
        <h2 className="eb-h2">On today's page</h2>
        <ol className="eb-numbered">
          {today.map((t, i) => <AgendaItem key={t.id} t={t} n={i + 1} onToggle={() => lab.toggleTask(t.id)} />)}
        </ol>
        <button className="eb-more" onClick={() => onScreen("tasks")}>Full agenda <ArrowRight size={15} /></button>
      </section>

      <section className="eb-due-col">
        <h2 className="eb-h2">Due this fortnight</h2>
        <ul className="eb-due">
          {UPCOMING.slice(0, 4).map((p) => (
            <li key={p.id}><span className="eb-due-when">{p.when}</span><span className="eb-due-name">{p.name}<small>{p.kind}</small></span><b>{fm(p.amount)}</b></li>
          ))}
        </ul>
        <p className="eb-fine">Expected, not yet recorded · {fm(UPCOMING_TOTAL)} in 30 days</p>
      </section>

      <section className="eb-habits-col">
        <h2 className="eb-h2">Rituals</h2>
        <table className="eb-habit-table">
          <thead><tr><th />{WEEK_LABELS.map((d, i) => <th key={i} className={i === 6 ? "is-today" : ""}>{d}</th>)}<th>Rate</th></tr></thead>
          <tbody>
            {lab.habits.map((h) => (
              <tr key={h.id}>
                <th>{h.name}</th>
                {h.week.map((v, i) => (
                  <td key={i}>
                    <button className={`eb-dot ${v ? "is-on" : ""} ${i === 6 ? "is-today" : ""}`} aria-pressed={v} aria-label={`${h.name} ${i === 6 ? "today" : WEEK_LABELS[i]}`}
                      onClick={() => i === 6 && lab.toggleHabit(h.id)} disabled={i !== 6}>
                      <motion.span initial={false} animate={{ scale: v ? 1 : 0 }} transition={spring} />
                    </button>
                  </td>
                ))}
                <td className="eb-rate">{h.rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="eb-features">
        <div className="eb-features-head"><h2 className="eb-h2">Features · Goals in progress</h2><button className="eb-more" onClick={() => onScreen("goals")}>All goals <ArrowRight size={15} /></button></div>
        <div className="eb-feature-row">
          {GOALS.slice(0, 3).map((g, i) => (
            <button key={g.id} className="eb-feature" onClick={() => onGoal(g)}>
              <Photo name={g.image} layoutId={`eb-goal-${g.id}`} className="eb-feature-img" />
              <p className="eb-kicker">{String(i + 1).padStart(2, "0")} · {g.category}</p>
              <h3>{g.title}</h3>
              <p className="eb-feature-meta"><b>{g.progress}%</b> complete · by {g.due}</p>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function AgendaItem({ t, n, onToggle }: { t: Lab["tasks"][number]; n: number; onToggle: () => void }) {
  return (
    <motion.li layout className={t.done ? "is-done" : ""} transition={spring}>
      <span className="eb-num">{String(n).padStart(2, "0")}</span>
      <span className="eb-item-text">
        <span className="eb-strike">{t.title}<motion.i initial={false} animate={{ scaleX: t.done ? 1 : 0 }} transition={{ duration: 0.4, ease }} /></span>
        <small>{[t.project, t.time, t.overdue && !t.done ? "overdue" : null].filter(Boolean).join(" · ")}</small>
      </span>
      <button className="eb-tick" aria-pressed={t.done} aria-label={t.done ? `Reopen ${t.title}` : `Complete ${t.title}`} onClick={onToggle}>
        {t.done ? "Done" : "Mark done"}
      </button>
    </motion.li>
  );
}

// ---------------------------------------------------------------- money

function Money({ lab, theme }: { lab: Lab; theme: "dark" | "light" }) {
  const ct: ChartTheme = theme === "light"
    ? { income: "#2f5d8a", expense: "#b4532a", grid: "rgba(27,26,23,.1)", axis: "#6e685e", tooltipClass: "eb-tooltip" }
    : { income: "#8fb4dc", expense: "#e08a62", grid: "rgba(236,230,218,.1)", axis: "#a39c8f", tooltipClass: "eb-tooltip" };
  return (
    <div className="eb-money">
      <header className="eb-money-head">
        <p className="eb-kicker">The money report · October</p>
        <Headline>{"October,\nin numbers."}</Headline>
        <button className="eb-more" onClick={lab.refresh}>{lab.loading ? "Updating…" : "Refresh figures"}</button>
      </header>
      <motion.div className="eb-trio" variants={stagger(0.1, 0.3)} initial="hidden" animate="show">
        {[
          { l: "Came in", v: MONTH.income, n: "Salary, one payer" },
          { l: "Went out", v: MONTH.expense, n: "Transfers excluded" },
          { l: "Kept", v: MONTH.net, n: "47.6% of income", accent: true },
        ].map((x) => (
          <motion.div key={x.l} variants={rise} className={`eb-trio-item ${x.accent ? "is-accent" : ""}`}>
            <p className="eb-section-label">{x.l}</p>
            {lab.loading ? <div className="eb-skel" /> : <p className="eb-trio-num">{fm(x.v)}</p>}
            <p className="eb-fine">{x.n}</p>
          </motion.div>
        ))}
      </motion.div>
      <div className="eb-money-grid">
        <section>
          <div className="eb-chart-head">
            <h2 className="eb-h2">Six months of cash flow</h2>
            <p className="eb-legend"><span><i style={{ background: ct.income }} />Income</span><span><i style={{ background: ct.expense }} />Expenses</span></p>
          </div>
          <FlowChart theme={ct} variant="bars" height={250} />
          <p className="eb-fine">Hover a month for exact figures. September was the leanest month of the half-year: {fm(CASHFLOW[4].expenseS)} spent.</p>
        </section>
        <section>
          <h2 className="eb-h2">Where it went</h2>
          <ul className="eb-spend">
            {SPENDING.map((s, i) => (
              <li key={s.name}>
                <span className="eb-spend-name">{s.name}</span>
                <span className="eb-spend-bar"><motion.i style={{ background: i === 0 ? "var(--eb-accent)" : "var(--eb-ink)" }} initial={{ scaleX: 0 }} animate={{ scaleX: s.pct / 53 }} transition={{ duration: 0.9, delay: 0.3 + i * 0.06, ease }} /></span>
                <b>{fm(s.amount)}</b><small>{s.pct}%</small>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="eb-h2">Holdings</h2>
          <table className="eb-rule-table eb-rule-table--lg">
            <tbody>
              {ACCOUNTS.map((a) => <tr key={a.id}><th>{a.name}<small>{a.kind}</small></th><td>{fm(a.balance)}</td></tr>)}
              <tr className="is-total"><th>Total</th><td>{fm(TOTAL_BALANCE)}</td></tr>
              <tr className="is-liab"><th>Owed · {LIABILITIES.name}<small>outstanding, tracked separately</small></th><td>{fm(LIABILITIES.outstanding)}</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- ledger

function Ledger({ lab }: { lab: Lab }) {
  const groups = groupByDay(lab.visibleTxs);
  return (
    <div className="eb-ledger">
      <header className="eb-ledger-head">
        <div>
          <p className="eb-kicker">The ledger</p>
          <Headline>{"Every entry,\nin order."}</Headline>
        </div>
        <div className="eb-ledger-tools">
          <div className="eb-text-tabs" role="tablist">
            {(["all", "expense", "income", "transfer"] as const).map((f) => (
              <button key={f} role="tab" aria-selected={lab.txFilter === f} onClick={() => lab.setTxFilter(f)}>
                {f === "all" ? "All" : f === "expense" ? "Expenses" : f === "income" ? "Income" : "Transfers"}
                {lab.txFilter === f && <motion.span layoutId="eb-tab-rule" className="eb-nav-rule" transition={spring} />}
              </button>
            ))}
          </div>
          <label className="eb-search"><Search size={16} /><input placeholder="Search the ledger" value={lab.query} onChange={(e) => lab.setQuery(e.target.value)} /></label>
        </div>
      </header>
      {groups.length === 0 ? (
        <div className="eb-empty">
          <p className="eb-empty-title">No entries match “{lab.query}”.</p>
          <p className="eb-fine">The ledger is quiet on that one. Try a different word, or <button className="eb-inline" onClick={() => { lab.setQuery(""); lab.setTxFilter("all"); }}>clear the filters</button>.</p>
        </div>
      ) : (
        <table className="eb-ledger-table">
          <thead><tr><th>Date</th><th>Entry</th><th>Category</th><th>Account</th><th className="num">Amount</th></tr></thead>
          {groups.map(([day, items]) => (
            <tbody key={day}>
              {items.map((t, i) => (
                <motion.tr key={t.id} layout className={t.session ? "is-new" : ""} onClick={() => lab.setSelectedTx(t)} tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && lab.setSelectedTx(t)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + i * 0.03 }}>
                  <td className="eb-date">{i === 0 ? dayLabel(day) : ""}</td>
                  <td className="eb-entry">{t.title}{t.note && <small>{t.note}</small>}</td>
                  <td className="eb-cat">{t.category}</td>
                  <td className="eb-acct">{t.account}</td>
                  <td className={`num eb-amt eb-amt--${t.type}`}>{t.type === "transfer" ? fm(t.amount) : fm(txSigned(t), { sign: true })}</td>
                </motion.tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </div>
  );
}

function MarginNote({ lab }: { lab: Lab }) {
  const t = lab.selectedTx;
  return (
    <AnimatePresence>
      {t && (
        <>
          <motion.div className="eb-scrim" onClick={() => lab.setSelectedTx(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="eb-note" role="dialog" aria-label="Entry details" initial={{ x: "100%", rotate: 1.5 }} animate={{ x: 0, rotate: 0 }} exit={{ x: "100%", rotate: 1 }} transition={{ type: "spring", stiffness: 260, damping: 30 }}>
            <button className="eb-close" aria-label="Close" onClick={() => lab.setSelectedTx(null)}><X size={18} /></button>
            <p className="eb-kicker">Entry · {dayLabel(t.date)}</p>
            <p className="eb-note-amt">{t.type === "transfer" ? fm(t.amount) : fm(txSigned(t), { sign: true })}</p>
            <h3 className="eb-note-title">{t.title}</h3>
            <table className="eb-rule-table">
              <tbody>
                <tr><th>Category</th><td>{t.category}</td></tr>
                <tr><th>Account</th><td>{t.account}</td></tr>
                <tr><th>Kind</th><td style={{ textTransform: "capitalize" }}>{t.type}</td></tr>
                {t.note && <tr><th>Note</th><td>{t.note}</td></tr>}
              </tbody>
            </table>
            <p className="eb-fine" style={{ marginTop: 18 }}>{DEMO_LABEL}. Editing is disabled in the design lab.</p>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- goals

function Goals({ onGoal }: { onGoal: (g: Goal) => void }) {
  const [lead, ...rest] = GOALS;
  return (
    <div className="eb-goals">
      <header className="eb-money-head">
        <p className="eb-kicker">Cover stories</p>
        <Headline>{"The long game."}</Headline>
      </header>
      <button className="eb-lead" onClick={() => onGoal(lead)}>
        <Photo name={lead.image} layoutId={`eb-goal-${lead.id}`} className="eb-lead-img" eager />
        <div className="eb-lead-text">
          <p className="eb-kicker">{lead.category}</p>
          <h2>{lead.title}</h2>
          <p className="eb-deck">Halfway there. Another {fm("1000000.00")} by June closes the gap — about {fm("125000.00")} a month.</p>
          <div className="eb-rule-meter eb-rule-meter--lg"><motion.span initial={{ scaleX: 0 }} animate={{ scaleX: lead.progress / 100 }} transition={{ duration: 1.2, delay: 0.4, ease }} /></div>
          <p className="eb-feature-meta"><b>{lead.progress}%</b> · {lead.detail} · by {lead.due}</p>
          <span className="eb-more">Open the story <ArrowUpRight size={15} /></span>
        </div>
      </button>
      <div className="eb-goal-cols">
        {rest.map((g, i) => (
          <motion.button key={g.id} className={`eb-feature eb-feature--tall ${i === 1 ? "is-offset" : ""}`} onClick={() => onGoal(g)} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1, duration: 0.7, ease }}>
            <Photo name={g.image} layoutId={`eb-goal-${g.id}`} className="eb-feature-img" />
            <p className="eb-kicker">{g.category}</p>
            <h3>{g.title}</h3>
            <p className="eb-feature-meta"><b>{g.progress}%</b> · {g.detail}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function GoalSpread({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {goal && (
        <motion.div className="eb-spread" role="dialog" aria-label={goal.title} initial={{ backgroundColor: "rgba(0,0,0,0)" }} animate={{ backgroundColor: "var(--eb-paper)" }} exit={{ opacity: 0, transition: { duration: 0.3 } }}>
          <Photo name={goal.image} layoutId={`eb-goal-${goal.id}`} className="eb-spread-img" />
          <motion.div className="eb-spread-text" variants={stagger(0.07, 0.35)} initial="hidden" animate="show">
            <motion.p variants={rise} className="eb-kicker">{goal.category} · by {goal.due}</motion.p>
            <motion.h2 variants={rise}>{goal.title}</motion.h2>
            <motion.p variants={rise} className="eb-spread-pct">{goal.progress}<span>%</span></motion.p>
            <motion.div variants={rise} className="eb-rule-meter eb-rule-meter--lg"><span style={{ transform: `scaleX(${goal.progress / 100})` }} /></motion.div>
            <motion.p variants={rise} className="eb-deck">{goal.detail}</motion.p>
            <motion.ol variants={rise} className="eb-ms">
              {goal.milestones.map((m) => <li key={m.title} className={m.done ? "is-done" : ""}>{m.title}<span>{m.done ? "complete" : "ahead"}</span></li>)}
            </motion.ol>
          </motion.div>
          <button className="eb-close eb-close--spread" aria-label="Close" onClick={onClose}><X size={20} /></button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------- agenda

function Agenda({ lab }: { lab: Lab }) {
  const [title, setTitle] = useState("");
  return (
    <div className="eb-agenda">
      <header className="eb-money-head">
        <p className="eb-kicker">The agenda</p>
        <Headline>{"What deserves\nyour attention."}</Headline>
      </header>
      <div className="eb-agenda-tools">
        <div className="eb-text-tabs" role="tablist">
          {(["today", "upcoming", "done"] as const).map((v) => (
            <button key={v} role="tab" aria-selected={lab.taskView === v} onClick={() => lab.setTaskView(v)} style={{ textTransform: "capitalize" }}>
              {v}{lab.taskView === v && <motion.span layoutId="eb-agenda-rule" className="eb-nav-rule" transition={spring} />}
            </button>
          ))}
        </div>
        <form className="eb-search" onSubmit={(e) => { e.preventDefault(); if (lab.addTask(title)) { setTitle(""); lab.notify("Added to today's page — preview only"); } }}>
          <Plus size={16} /><input placeholder="Write a new task and press Enter" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New task" />
        </form>
      </div>
      <AnimatePresence mode="popLayout" initial={false}>
        {lab.visibleTasks.length === 0 ? (
          <motion.div key="empty" className="eb-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="eb-empty-title">{lab.taskView === "done" ? "Nothing crossed off yet." : "The page is clear."}</p>
            <p className="eb-fine">{lab.taskView === "done" ? "Finished tasks are filed here." : "Nothing else is asking for you here. Take the afternoon."}</p>
          </motion.div>
        ) : (
          <ol key="list" className="eb-numbered eb-numbered--lg">
            {lab.visibleTasks.map((t, i) => (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.35 }}>
                <AgendaItem t={t} n={i + 1} onToggle={() => lab.toggleTask(t.id)} />
              </motion.div>
            ))}
          </ol>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------- quick entry

function QuickEntry({ lab }: { lab: Lab }) {
  const q = lab.quick;
  return (
    <AnimatePresence>
      {q.open && (
        <>
          <motion.div className="eb-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => q.setOpen(false)} />
          <motion.form className="eb-entry-sheet" role="dialog" aria-label="New entry" noValidate
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 260, damping: 32 }}
            onSubmit={(e) => { e.preventDefault(); q.submit(); }} onKeyDown={(e) => e.key === "Escape" && q.setOpen(false)}>
            <motion.div key={q.shake} animate={q.shake ? shakeX : undefined} className="eb-entry-inner">
              <div className="eb-entry-head">
                <p className="eb-kicker">New entry · {DEMO_LABEL.toLowerCase()}</p>
                <button type="button" className="eb-close" aria-label="Close" onClick={() => q.setOpen(false)}><X size={18} /></button>
              </div>
              <div className="eb-entry-grid">
                <div>
                  <div className="eb-text-tabs" role="tablist">
                    {(["expense", "income"] as const).map((t) => (
                      <button type="button" key={t} role="tab" aria-selected={q.form.type === t} onClick={() => q.set("type", t)} style={{ textTransform: "capitalize" }}>
                        {t}{q.form.type === t && <motion.span layoutId="eb-q-rule" className="eb-nav-rule" transition={spring} />}
                      </button>
                    ))}
                  </div>
                  <label className={`eb-amount ${q.errors.amount ? "has-error" : ""}`}>
                    <input autoFocus inputMode="decimal" placeholder="0" value={q.form.amount} onChange={(e) => q.set("amount", e.target.value)} aria-label="Amount" aria-invalid={!!q.errors.amount} />
                    <span>₸</span>
                  </label>
                  {q.errors.amount && <p className="eb-err">{q.errors.amount}</p>}
                </div>
                <div>
                  <p className="eb-section-label">Filed under</p>
                  <div className={`eb-cats ${q.errors.category ? "has-error" : ""}`}>
                    {q.categories.map((c) => <button type="button" key={c} aria-pressed={q.form.category === c} onClick={() => q.set("category", c)}>{c}</button>)}
                  </div>
                  {q.errors.category && <p className="eb-err">{q.errors.category}</p>}
                  <div className="eb-entry-fields">
                    <label><span className="eb-section-label">From</span><select value={q.form.account} onChange={(e) => q.set("account", e.target.value)}>{ACCOUNTS.map((a) => <option key={a.id}>{a.name}</option>)}</select></label>
                    <label><span className="eb-section-label">On</span><input type="date" value={q.form.date} onChange={(e) => q.set("date", e.target.value)} /></label>
                    <label className="is-wide"><span className="eb-section-label">Note</span><input placeholder="What was it for?" value={q.form.title} onChange={(e) => q.set("title", e.target.value)} /></label>
                  </div>
                  <button type="submit" className="eb-pill eb-pill--lg">File the entry <ArrowRight size={16} /></button>
                </div>
              </div>
            </motion.div>
          </motion.form>
        </>
      )}
    </AnimatePresence>
  );
}
