import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertOctagon,
  CalendarDays,
  CheckCircle2,
  FileHeart,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Loader2,
  Menu,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useApp } from "@/state/AppState";
import { Logo } from "./Logo";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { CareNavigator } from "./CareNavigator";
import { GuidedTour } from "./GuidedTour";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/app/discharge", label: "Discharge Plan", icon: FileHeart },
  { to: "/app/team", label: "Care Team", icon: Users },
  { to: "/app/schedule", label: "Care Schedule", icon: CalendarDays },
  { to: "/app/gaps", label: "Coverage Gaps", icon: AlertOctagon, badge: "gaps" as const },
  { to: "/app/simulator", label: "What-If Simulator", icon: FlaskConical, tag: "Live" },
  { to: "/app/report", label: "Care Report", icon: FileText },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useApp();
  const openGaps = data?.schedule.summary.uncovered ?? 0;
  return (
    <nav className="space-y-0.5" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon, badge, tag }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition",
              isActive ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white",
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon className={cn("h-4 w-4", isActive ? "text-teal-300" : "text-navy-400 group-hover:text-navy-200")} />
              <span className="flex-1">{label}</span>
              {badge === "gaps" && openGaps > 0 && (
                <span className="rounded-full bg-gap px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white tabular-nums">{openGaps}</span>
              )}
              {tag && <span className="rounded bg-teal-400/15 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-teal-300">{tag}</span>}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { data } = useApp();
  const p = data?.workspace.patient;
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-5">
        <NavLink to="/" onClick={onNavigate}>
          <Logo light />
        </NavLink>
      </div>
      {p && (
        <div className="mx-3 mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-navy-300">Patient</div>
          <div className="mt-0.5 text-sm font-semibold text-white">{p.name}{p.age ? `, ${p.age}` : ""}</div>
          {p.synthetic && <div className="mt-1 text-[11px] text-teal-300">Fictional demo patient</div>}
        </div>
      )}
      <div className="px-3">
        <NavItems onNavigate={onNavigate} />
      </div>
      <div className="mt-auto p-4">
        <div className="flex gap-2 rounded-xl bg-white/5 p-3 text-[11px] leading-relaxed text-navy-300">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-400" />
          <span>Logistics support only — not medical advice. Prototype; not HIPAA-compliant. Use fictional data.</span>
        </div>
      </div>
    </div>
  );
}

export function Layout() {
  const { data, loading, error, health, launchDemo, toasts, refresh, setNavigatorOpen } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();
  const isReport = loc.pathname.startsWith("/app/report");

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[260px] bg-navy-950 lg:block">
        <SidebarBody />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-navy-950/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[270px] bg-navy-950 lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
            >
              <button className="absolute right-3 top-5 rounded p-1 text-navy-300 hover:text-white" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
              <SidebarBody onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-[260px]">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-canvas/85 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-1.5 text-slate-700 hover:bg-slate-200/60 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm text-slate-600">
            {data && (
              <>
                <span className="font-medium text-ink">{data.workspace.plan.source_name || "Care plan"}</span>
                <span className="hidden sm:inline"> · week of {new Date(data.workspace.plan.start_date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              </>
            )}
          </div>
          {health && (
            <Badge tone={health.ai_provider ? "teal" : "neutral"} className="hidden sm:inline-flex" title="AI is used only for extraction and explanations. Scheduling is always deterministic.">
              <span className={cn("h-1.5 w-1.5 rounded-full", health.ai_provider ? "bg-teal-500" : "bg-slate-400")} />
              {health.ai_provider ? `Live AI · ${health.ai_label}` : "Demo mode · no AI key"}
            </Badge>
          )}
          {!isReport && (
            <Button size="sm" onClick={() => setNavigatorOpen(true)} title="Ask Care Navigator about coverage">
              <Sparkles className="text-teal-300" /> <span className="hidden sm:inline">Care Navigator</span>
            </Button>
          )}
          {data?.workspace.is_demo && (
            <Button size="sm" variant="outline" onClick={launchDemo} title="Reload the original demo scenario">
              <RotateCcw /> <span className="hidden sm:inline">Reset demo</span>
            </Button>
          )}
        </header>

        <main className={cn("mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8", isReport && "max-w-[980px]")}>
          {loading && !data ? (
            <div className="flex h-[60vh] items-center justify-center text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading care plan…
            </div>
          ) : error && !data ? (
            <div className="mx-auto mt-16 max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-card">
              <XCircle className="mx-auto h-8 w-8 text-gap" />
              <h2 className="mt-3 font-semibold text-ink">Can't reach the backend</h2>
              <p className="mt-1 text-sm text-slate-600">{error}</p>
              <p className="mt-3 rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-700">cd backend && .venv/bin/uvicorn app.main:app --port 8000</p>
              <Button className="mt-4" onClick={refresh}>Try again</Button>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      <TaskDetailSheet />
      {!isReport && <CareNavigator />}
      <GuidedTour />

      <div className="no-print pointer-events-none fixed right-4 top-16 z-[60] flex w-[340px] max-w-[calc(100vw-32px)] flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              className="pointer-events-auto flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lift"
            >
              {t.tone === "error" ? <XCircle className="h-5 w-5 shrink-0 text-gap" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-covered" />}
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">{t.title}</div>
                {t.body && <div className="text-xs text-slate-600">{t.body}</div>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
