import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, FlaskConical, Presentation, XCircle } from "lucide-react";
import { useApp } from "@/state/AppState";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { CoverageRing } from "@/components/CoverageRing";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { StatusChip } from "@/components/StatusChip";
import { EmptyState } from "@/components/EmptyState";
import { planDates } from "@/lib/availability";
import { cn, DAY_SHORT, firstName, fmt12, fmtDate, GAP_META } from "@/lib/utils";

function Stat({ label, value, icon: Icon, tone, sub, to }: { label: string; value: number; icon: typeof CheckCircle2; tone: "ink" | "green" | "red"; sub: string; to?: string }) {
  const body = (
    <Card className={cn("h-full p-5 transition", to && "hover:-translate-y-0.5 hover:shadow-lift")}>
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-slate-500">{label}</span>
        <span className={cn("rounded-lg p-1.5", tone === "green" ? "bg-covered-soft text-covered" : tone === "red" ? "bg-gap-soft text-gap" : "bg-slate-100 text-slate-600")}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <AnimatedNumber value={value} className={cn("mt-3 block text-[40px] font-semibold leading-none tracking-tight tabular-nums", tone === "green" ? "text-covered" : tone === "red" ? "text-gap" : "text-ink")} />
      <div className="mt-2 text-xs text-slate-500">{sub}</div>
    </Card>
  );
  return to ? <Link to={to} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded-2xl">{body}</Link> : body;
}

const STATUS_FILL = { covered: "#16a34a", tentative: "#d97706", uncovered: "#dc2626" };

function DayTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lift">
      <div className="mb-1 font-semibold text-ink">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
          <span className="capitalize">{p.name}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-ink">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const { data, taskById, openTask, launchDemo, setTourStep } = useApp();
  const navigate = useNavigate();

  const byDay = useMemo(() => {
    if (!data) return [];
    return planDates(data.workspace).map((d) => {
      const as = data.schedule.assignments.filter((a) => taskById[a.task_id]?.date === d);
      const wd = (new Date(d + "T12:00:00").getDay() + 6) % 7;
      return {
        day: `${DAY_SHORT[wd]} ${fmtDate(d, { day: "numeric" })}`,
        covered: as.filter((a) => a.status === "covered").length,
        tentative: as.filter((a) => a.status === "tentative").length,
        uncovered: as.filter((a) => a.status === "uncovered" || a.status === "professional_review").length,
      };
    });
  }, [data, taskById]);

  if (!data) return null;
  const s = data.schedule.summary;
  const ws = data.workspace;

  if (!ws.tasks.length) {
    return (
      <>
        <PageHeader eyebrow="Overview" title="No care plan yet" />
        <EmptyState
          icon={ClipboardList}
          title="Start with a discharge plan"
          body="Upload discharge instructions to extract care tasks, or load the fictional demo family to explore Invisible Shift."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate("/app/discharge")}>Upload discharge plan</Button>
              <Button variant="outline" onClick={launchDemo}>Load demo</Button>
            </div>
          }
        />
      </>
    );
  }

  const uncovered = data.schedule.assignments.filter((a) => a.status === "uncovered" || a.status === "professional_review");
  const taskGaps = data.gaps.filter((g) => g.task_id && g.type !== "needs_confirmation");
  const firstUncovered = [...uncovered].sort((a, b) => (taskById[a.task_id].date + (a.start_time || "")).localeCompare(taskById[b.task_id].date + (b.start_time || "")));
  const upcoming = [...data.schedule.assignments]
    .sort((a, b) => (taskById[a.task_id].date + (a.start_time || "99")).localeCompare(taskById[b.task_id].date + (b.start_time || "99")))
    .slice(0, 6);

  // group alerts by pattern
  const patterns = new Map<string, { title: string; time: string | null; days: string[]; type: string; ids: string[] }>();
  for (const a of firstUncovered) {
    const t = taskById[a.task_id];
    const key = `${t.template_id}|${a.gap_type}`;
    const p = patterns.get(key) || { title: t.title, time: t.scheduled_time, days: [], type: a.gap_type || "professional", ids: [] };
    p.days.push(DAY_SHORT[t.weekday]);
    p.ids.push(t.task_id);
    patterns.set(key, p);
  }

  async function startTour() {
    if (ws.is_demo) await launchDemo();
    setTourStep(0);
  }

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Care coverage this week"
        description={
          <>
            {ws.patient.name}
            {ws.patient.synthetic && " (fictional)"} · {fmtDate(ws.plan.start_date, { month: "long", day: "numeric" })} –{" "}
            {fmtDate(planDates(ws).slice(-1)[0], { month: "long", day: "numeric", year: "numeric" })}. All figures are calculated live from tasks, availability and assignments.
          </>
        }
        actions={
          <>
            {ws.is_demo && (
              <Button variant="accent" onClick={startTour}>
                <Presentation /> Show How Invisible Shift Works
              </Button>
            )}
            <Button variant="outline" onClick={() => navigate("/app/simulator")}>
              <FlaskConical /> What-if
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total care tasks" value={s.total} icon={ClipboardList} tone="ink" sub={`${ws.plan.templates.length} instructions × ${ws.plan.days} days`} to="/app/schedule" />
        <Stat label="Covered tasks" value={s.covered} icon={CheckCircle2} tone="green" sub={s.tentative ? `+ ${s.tentative} tentative, awaiting confirmation` : "Confirmed caregiver + availability"} to="/app/schedule" />
        <Stat label="Uncovered tasks" value={s.uncovered + s.professional_review} icon={XCircle} tone="red" sub={s.professional_review ? `incl. ${s.professional_review} needing a professional` : "No eligible caregiver available"} to="/app/gaps" />
        <Card className="flex items-center gap-4 p-5">
          <CoverageRing percent={s.coverage_percent} size={116} stroke={11} />
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-slate-500">Care coverage</div>
            <div className="mt-1 text-sm text-slate-700">
              {s.covered} of {s.total - s.self_managed} caregiver tasks have a confirmed helper.
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Coverage by day</CardTitle>
              <CardDescription>Tasks per day by assignment status</CardDescription>
            </div>
            <div className="flex gap-3 text-xs text-slate-600">
              {(["covered", "tentative", "uncovered"] as const).map((k) => (
                <span key={k} className="inline-flex items-center gap-1.5 capitalize">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_FILL[k] }} /> {k}
                </span>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]" role="img" aria-label={`Coverage by day: ${byDay.map((d) => `${d.day} ${d.covered} covered, ${d.uncovered} uncovered`).join("; ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byDay} barCategoryGap="38%" maxBarSize={36} margin={{ top: 6, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip content={<DayTooltip />} cursor={{ fill: "rgba(15,23,42,0.04)" }} />
                  <Bar dataKey="covered" stackId="a" fill={STATUS_FILL.covered} stroke="#fff" strokeWidth={2} />
                  <Bar dataKey="tentative" stackId="a" fill={STATUS_FILL.tentative} stroke="#fff" strokeWidth={2} />
                  <Bar dataKey="uncovered" stackId="a" fill={STATUS_FILL.uncovered} stroke="#fff" strokeWidth={2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Uncovered task alerts</CardTitle>
              <CardDescription>Scheduling urgency only — not clinical risk</CardDescription>
            </div>
            <Badge tone={taskGaps.length ? "red" : "green"}>{taskGaps.length} open</Badge>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {patterns.size === 0 && (
              <div className="flex items-center gap-2 rounded-xl bg-covered-soft p-4 text-sm text-covered-ink">
                <CheckCircle2 className="h-4 w-4" /> Every caregiver task has an eligible helper.
              </div>
            )}
            {[...patterns.values()].map((p, i) => (
              <motion.button
                key={i}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => openTask(p.ids[0])}
                className="flex w-full gap-3 rounded-xl border border-red-100 bg-red-50/50 p-3 text-left transition hover:border-red-200 hover:bg-red-50"
              >
                <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", p.type === "professional" ? "text-warn" : "text-gap")} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">
                    {p.title} · {fmt12(p.time)}
                  </div>
                  <div className="text-xs text-slate-600">
                    {p.days.join(", ")} · {GAP_META[p.type as keyof typeof GAP_META]?.label ?? p.type}
                  </div>
                </div>
                <span className="self-center rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-gap ring-1 ring-red-200">{p.ids.length}</span>
              </motion.button>
            ))}
            {patterns.size > 0 && (
              <Button variant="link" size="sm" onClick={() => navigate("/app/gaps")}>
                Review all gaps & next actions <ArrowRight />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Caregiver workload</CardTitle>
              <CardDescription>Assigned minutes vs. each person's stated weekly limit</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.schedule.workload.map((w) => {
              const cg = ws.caregivers.find((c) => c.id === w.caregiver_id);
              return (
                <div key={w.caregiver_id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: w.color }} />
                      {w.name}
                      <span className="text-xs font-normal text-slate-500">{cg?.relationship}</span>
                      {cg && !cg.active && <Badge>inactive</Badge>}
                    </span>
                    <span className="text-xs tabular-nums text-slate-600">
                      {w.tasks} tasks · {w.minutes} / {w.max_minutes} min
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuenow={w.utilization_percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${w.name} workload`}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: w.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, w.utilization_percent)}%` }}
                      transition={{ duration: 0.8 }}
                    />
                  </div>
                </div>
              );
            })}
            {data.schedule.workload.length === 0 && <p className="text-sm text-slate-500">No caregivers yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Upcoming tasks</CardTitle>
              <CardDescription>First tasks of the plan period</CardDescription>
            </div>
            <CalendarClock className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent className="space-y-1">
            {upcoming.map((a) => {
              const t = taskById[a.task_id];
              return (
                <button key={a.task_id} onClick={() => openTask(a.task_id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                  <div className="w-[84px] shrink-0 text-xs tabular-nums text-slate-500">
                    <div className="font-semibold text-ink">{fmt12(a.start_time)}</div>
                    {fmtDate(t.date)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink">{t.title}</div>
                    <div className="truncate text-xs text-slate-500">{a.caregiver_name ? `with ${firstName(a.caregiver_name)}` : "No caregiver assigned"}</div>
                  </div>
                  <StatusChip status={a.status} />
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
