import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
  Wand2,
} from "lucide-react";
import { useApp } from "@/state/AppState";
import { api } from "@/lib/api";
import type { Caregiver, CareTask, ScenarioResult, ScheduleResult, TaskStatus } from "@/lib/types";
import { planDates } from "@/lib/availability";
import { cn, DAY_NAMES, DAY_SHORT, firstName, fmt12, fmtRange, fromMin, STATUS_META, toMin, uid } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Switch } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { CaregiverForm, blankCaregiver } from "@/components/CaregiverForm";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

interface Preset {
  key: string;
  title: string;
  body: string;
  icon: typeof Sparkles;
  needs: string[];
  apply: (c: Caregiver[]) => Caregiver[];
}

const PRESETS: Preset[] = [
  {
    key: "maya-wed",
    title: "Maya helps Wednesday evening",
    body: "Maya becomes available Wed 7:45–8:30 PM for the dressing observation.",
    icon: Sparkles,
    needs: ["maya"],
    apply: (cs) =>
      cs.map((c) =>
        c.id === "maya" && !c.availability.some((b) => b.id === "scenario-maya-wed")
          ? { ...c, availability: [...c.availability, { id: "scenario-maya-wed", weekday: 2, start: "19:45", end: "20:30", status: "available" }] }
          : c,
      ),
  },
  {
    key: "sarah-wed",
    title: "Sarah skips Wednesday's volunteer shift",
    body: "Removes the commitment and adds Wed 7:30–8:30 PM availability.",
    icon: Wand2,
    needs: ["sarah"],
    apply: (cs) =>
      cs.map((c) =>
        c.id === "sarah"
          ? {
              ...c,
              commitments: c.commitments.filter((m) => m.id !== "sarah-wed"),
              availability: c.availability.some((b) => b.id === "scenario-sarah-wed")
                ? c.availability
                : [...c.availability, { id: "scenario-sarah-wed", weekday: 2, start: "19:30", end: "20:30", status: "available" }],
            }
          : c,
      ),
  },
  {
    key: "lunch-helper",
    title: "Ask a neighbor about weekday lunches",
    body: "Adds a helper available weekdays 11:30 AM–12:45 PM who hasn't confirmed yet.",
    icon: UserPlus,
    needs: [],
    apply: (cs) =>
      cs.some((c) => c.id === "scenario-neighbor")
        ? cs
        : [
            ...cs,
            {
              ...blankCaregiver(cs),
              id: "scenario-neighbor",
              name: "Neighbor (lunch helper)",
              relationship: "Neighbor",
              color: "#2563eb",
              capabilities: ["meals"],
              consent: "pending",
              max_hours_per_week: 3,
              availability: [0, 1, 2, 3, 4].map((d) => ({ id: `scenario-nb-${d}`, weekday: d, start: "11:30", end: "12:45", status: "available" as const })),
            },
          ],
  },
  {
    key: "daniel-out",
    title: "Daniel is away this week",
    body: "Removes Daniel from the active care team.",
    icon: UserMinus,
    needs: ["daniel"],
    apply: (cs) => cs.map((c) => (c.id === "daniel" ? { ...c, active: false } : c)),
  },
];

function describeChanges(orig: Caregiver[], scen: Caregiver[]): string[] {
  const out: string[] = [];
  const om = Object.fromEntries(orig.map((c) => [c.id, c]));
  const sm = Object.fromEntries(scen.map((c) => [c.id, c]));
  for (const s of scen) {
    const o = om[s.id];
    const n = firstName(s.name);
    if (!o) {
      out.push(`Added ${s.name} (${s.consent === "confirmed" ? "confirmed" : "not yet confirmed"})`);
      continue;
    }
    if (o.active !== s.active) out.push(s.active ? `${n} rejoins the care team` : `${n} removed from the care team`);
    if (o.consent !== s.consent) out.push(`${n}'s agreement: ${o.consent} → ${s.consent}`);
    if (o.max_hours_per_week !== s.max_hours_per_week) out.push(`${n}'s weekly limit: ${o.max_hours_per_week} h → ${s.max_hours_per_week} h`);
    const oIds = new Set(o.availability.map((b) => b.id));
    const sIds = new Set(s.availability.map((b) => b.id));
    for (const b of s.availability) if (!oIds.has(b.id)) out.push(`${n}: ${b.status === "unavailable" ? "unavailable" : b.status === "possible" ? "possibly available" : "available"} ${DAY_SHORT[b.weekday]} ${fmtRange(b.start, b.end)}`);
    for (const b of o.availability) if (!sIds.has(b.id)) out.push(`${n}: no longer available ${DAY_SHORT[b.weekday]} ${fmtRange(b.start, b.end)}`);
    const oc = new Set(o.commitments.map((c) => c.id));
    const sc = new Set(s.commitments.map((c) => c.id));
    for (const c of o.commitments) if (!sc.has(c.id)) out.push(`${n}: '${c.label}' on ${DAY_SHORT[c.weekday]} cancelled`);
    for (const c of s.commitments) if (!oc.has(c.id)) out.push(`${n}: new commitment '${c.label}' ${DAY_SHORT[c.weekday]}`);
    if ([...o.capabilities].sort().join() !== [...s.capabilities].sort().join()) out.push(`${n}'s approved tasks changed`);
    if (o.can_physical_assist !== s.can_physical_assist || o.has_transportation !== s.has_transportation) out.push(`${n}'s assistance/transport changed`);
  }
  for (const o of orig) if (!sm[o.id]) out.push(`Deleted ${o.name}`);
  return out;
}

const CELL_BG: Record<TaskStatus, string> = {
  covered: "#dcfce7",
  tentative: "#fef3c7",
  uncovered: "#fee2e2",
  professional_review: "#fef3c7",
  self_managed: "#f1f5f9",
};
const CELL_FG: Record<TaskStatus, string> = {
  covered: "#166534",
  tentative: "#92400e",
  uncovered: "#991b1b",
  professional_review: "#92400e",
  self_managed: "#475569",
};

function Matrix({ tasks, dates, result, before, changed, onSelect }: { tasks: CareTask[]; dates: string[]; result: ScheduleResult; before: ScheduleResult; changed: Set<string>; onSelect: (id: string) => void }) {
  const rows = useMemo(() => {
    const m = new Map<string, CareTask[]>();
    for (const t of tasks) m.set(t.template_id, [...(m.get(t.template_id) || []), t]);
    return [...m.values()].sort((a, b) => (a[0].scheduled_time || "99").localeCompare(b[0].scheduled_time || "99"));
  }, [tasks]);
  const am = Object.fromEntries(result.assignments.map((a) => [a.task_id, a]));
  const bm = Object.fromEntries(before.assignments.map((a) => [a.task_id, a]));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[560px] gap-1.5" style={{ gridTemplateColumns: `150px repeat(${dates.length}, minmax(0,1fr))` }}>
        <div />
        {dates.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-slate-500">{DAY_SHORT[(new Date(d + "T12:00:00").getDay() + 6) % 7]}</div>
        ))}
        {rows.map((r) => (
          <div key={r[0].template_id} className="contents">
            <div className="truncate pr-2 text-xs">
              <div className="font-semibold text-ink">{fmt12(r[0].scheduled_time)}</div>
              <div className="truncate text-slate-500">{r[0].title}</div>
            </div>
            {dates.map((d) => {
              const t = r.find((x) => x.date === d);
              if (!t) return <div key={d} />;
              const a = am[t.task_id];
              const b = bm[t.task_id];
              const isChanged = changed.has(t.task_id);
              return (
                <motion.button
                  key={d + (isChanged ? "-c" : "")}
                  onClick={() => onSelect(t.task_id)}
                  initial={isChanged ? { backgroundColor: CELL_BG[b.status], color: CELL_FG[b.status], scale: 1 } : false}
                  animate={{ backgroundColor: CELL_BG[a.status], color: CELL_FG[a.status], scale: isChanged ? [1, 1.12, 1] : 1 }}
                  transition={{ duration: 0.9, delay: isChanged ? 0.35 : 0 }}
                  className={cn("relative flex h-11 flex-col items-center justify-center rounded-lg text-[10.5px] font-semibold", isChanged && "ring-2 ring-offset-1", isChanged && (a.status === "covered" || a.status === "tentative") ? "animate-pulsering ring-covered" : isChanged ? "ring-gap" : "")}
                  aria-label={`${t.title} ${d}: ${STATUS_META[a.status].label}${a.caregiver_name ? ` (${a.caregiver_name})` : ""}${isChanged ? `, changed from ${STATUS_META[b.status].label}` : ""}`}
                  title={a.explanation}
                >
                  {a.caregiver_name ? firstName(a.caregiver_name) : a.status === "uncovered" ? "—" : STATUS_META[a.status].label.slice(0, 4)}
                  {isChanged && <span className="absolute -right-1 -top-1 rounded-full bg-navy-900 px-1 text-[8.5px] text-white">NEW</span>}
                </motion.button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryPanel({ label, s, tone, delta }: { label: string; s: ScheduleResult["summary"]; tone: "before" | "after"; delta?: number }) {
  return (
    <div className={cn("flex-1 rounded-2xl border p-5", tone === "before" ? "border-slate-200 bg-white" : "border-teal-200 bg-gradient-to-br from-teal-50 to-white")}>
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-semibold uppercase tracking-[0.14em]", tone === "before" ? "text-slate-500" : "text-teal-700")}>{label}</span>
        {delta !== undefined && delta !== 0 && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", delta > 0 ? "bg-covered text-white" : "bg-gap text-white")}>
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}
            {delta} covered
          </motion.span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          ["Tasks", s.total, "text-ink"],
          ["Covered", s.covered, "text-covered"],
          ["Uncovered", s.uncovered + s.professional_review, "text-gap"],
        ].map(([k, v, c]) => (
          <div key={k as string}>
            <div className="text-[11px] text-slate-500">{k}</div>
            <AnimatedNumber value={v as number} className={cn("text-2xl font-semibold tabular-nums", c as string)} />
          </div>
        ))}
        <div>
          <div className="text-[11px] text-slate-500">Coverage</div>
          <AnimatedNumber value={s.coverage_percent} decimals={1} suffix="%" className="text-2xl font-semibold tabular-nums text-ink" />
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <motion.div className="h-full rounded-full bg-covered" initial={false} animate={{ width: `${s.coverage_percent}%` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
      </div>
      {s.tentative > 0 && <div className="mt-2 text-xs text-warn-ink">+ {s.tentative} tentative (awaiting confirmation)</div>}
    </div>
  );
}

export default function Simulator() {
  const { data, run, openTask, taskById, setLastSim, toast, tourStep } = useApp();
  const [params, setParams] = useSearchParams();
  const [scenario, setScenario] = useState<Caregiver[] | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [editing, setEditing] = useState<Caregiver | null>(null);
  const [applying, setApplying] = useState(false);
  const [quick, setQuick] = useState({ cg: "", day: 2, start: "19:45", end: "20:30" });
  const appliedPreset = useRef<string | null>(null);

  const original = data?.workspace.caregivers;
  const origKey = JSON.stringify(original);

  // (Re)initialise the isolated scenario whenever the saved state changes.
  useEffect(() => {
    if (!original) return;
    setScenario(clone(original));
    setResult(null);
    appliedPreset.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origKey]);

  // Preset via URL (used by the guided demo).
  const presetKey = params.get("preset");
  useEffect(() => {
    if (!scenario || !presetKey || appliedPreset.current === presetKey) return;
    const p = PRESETS.find((x) => x.key === presetKey);
    if (!p) return;
    appliedPreset.current = presetKey;
    setScenario(p.apply(clone(original!)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey, scenario === null, origKey]);

  const dirty = scenario !== null && JSON.stringify(scenario) !== origKey;

  // Re-run the deterministic scheduler on every scenario change.
  useEffect(() => {
    if (!scenario) return;
    if (!dirty) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setSimulating(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.simulate(scenario);
        if (!cancelled) {
          setResult(r);
          setLastSim(r);
        }
      } catch (e) {
        if (!cancelled) toast({ title: "Simulation failed", body: (e as Error).message, tone: "error" });
      } finally {
        if (!cancelled) setSimulating(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scenario)]);

  if (!data || !scenario) return null;
  const ws = data.workspace;
  const before = data.schedule;
  const after = result?.after ?? before;
  const changes = result?.changes ?? [];
  const changedIds = new Set(changes.map((c) => c.task_id));
  const resolved = changes.filter((c) => c.kind === "resolved");
  const regressed = changes.filter((c) => c.kind === "regressed");
  const reassigned = changes.filter((c) => c.kind === "reassigned" || c.kind === "changed");
  const changeLog = describeChanges(original!, scenario);
  const delta = after.summary.covered - before.summary.covered;
  const focusId = params.get("focus");
  const focusTask = focusId ? taskById[focusId] : null;
  const scenarioBlockIds = new Set(scenario.flatMap((c) => c.availability.map((b) => b.id)).filter((id) => !original!.some((o) => o.availability.some((b) => b.id === id))));

  const setCg = (id: string, patch: Partial<Caregiver>) => setScenario((s) => s!.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  function reset() {
    setScenario(clone(original!));
    setResult(null);
    appliedPreset.current = null;
    if (params.get("preset")) setParams({});
  }

  async function apply() {
    if (!dirty) return;
    const msg = `Applied: ${before.summary.covered} → ${after.summary.covered} covered tasks`;
    setApplying(true);
    const res = await run(api.applyScenario(scenario!), msg);
    setApplying(false);
    if (res && params.get("preset")) setParams({});
  }

  function addQuickWindow() {
    if (!quick.cg || quick.start >= quick.end) return;
    setCg(quick.cg, {
      availability: [...scenario!.find((c) => c.id === quick.cg)!.availability, { id: uid("scn"), weekday: quick.day, start: quick.start, end: quick.end, status: "available" }],
    });
  }

  function helpWithFocus(cg: Caregiver, t: CareTask) {
    if (!t.scheduled_time) return;
    const s = toMin(t.scheduled_time) - 15;
    const e = toMin(t.scheduled_time) + t.estimated_duration_minutes + 15;
    setCg(cg.id, { active: true, availability: [...cg.availability, { id: uid("scn"), weekday: t.weekday, start: fromMin(Math.max(0, s)), end: fromMin(Math.min(1440, e)), status: "available" }] });
  }

  return (
    <>
      <PageHeader
        eyebrow="What-if simulator"
        title="What happens if someone changes their availability?"
        description="Experiment safely. Every change re-runs the same deterministic scheduler on an isolated copy — the real schedule is untouched until you press Apply."
        actions={
          <Badge tone={dirty ? "amber" : "neutral"} className="text-xs">
            {simulating ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
            {dirty ? `Scenario · ${changeLog.length} change${changeLog.length === 1 ? "" : "s"} (unsaved)` : "No changes yet"}
          </Badge>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
        <SummaryPanel label="Before · saved schedule" s={before.summary} tone="before" />
        <div className="flex items-center justify-center text-slate-400">
          <ArrowRight className="h-5 w-5 rotate-90 md:rotate-0" />
        </div>
        <SummaryPanel label="After · this scenario" s={after.summary} tone="after" delta={result ? delta : undefined} />
      </div>

      <AnimatePresence>
        {resolved.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6, height: 0 }} animate={{ opacity: 1, y: 0, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 overflow-hidden">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4" /> {resolved.length} gap{resolved.length === 1 ? "" : "s"} resolved
              </div>
              <ul className="space-y-2">
                {resolved.map((c) => (
                  <motion.li key={c.task_id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-1 rounded-xl bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:gap-3">
                    <div className="flex items-center gap-2">
                      <motion.span initial={{ backgroundColor: "#dc2626" }} animate={{ backgroundColor: "#16a34a" }} transition={{ delay: 0.5, duration: 0.8 }} className="flex h-6 w-6 items-center justify-center rounded-full text-white">
                        <Check className="h-3.5 w-3.5" />
                      </motion.span>
                      <span className="text-sm font-semibold text-ink">
                        {DAY_NAMES[c.weekday]}, {fmt12(c.time)} — {c.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs sm:ml-auto">
                      <span className="rounded-full bg-gap-soft px-2 py-0.5 font-medium text-gap-ink line-through decoration-1">{STATUS_META[c.before_status].label}</span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span className="rounded-full bg-covered-soft px-2 py-0.5 font-medium text-covered-ink">
                        {STATUS_META[c.after_status].label} · {firstName(c.after_caregiver)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 sm:hidden">{c.after_explanation}</p>
                  </motion.li>
                ))}
              </ul>
              <p className="mt-2 hidden text-xs text-emerald-900/80 sm:block">{resolved[0].after_explanation}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {regressed.length > 0 && (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <b>{regressed.length} task{regressed.length === 1 ? "" : "s"} would lose coverage:</b>{" "}
          {regressed.slice(0, 6).map((c) => `${DAY_SHORT[c.weekday]} ${fmt12(c.time)} ${c.title}`).join("; ")}
          {regressed.length > 6 && ` and ${regressed.length - 6} more`}.
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[400px_1fr]">
        {/* -------- Controls -------- */}
        <div className="space-y-4">
          {focusTask && (
            <Card className="border-teal-300">
              <CardHeader className="pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2"><Target className="h-4 w-4 text-teal-600" /> Trying to cover</CardTitle>
                  <CardDescription>
                    {DAY_NAMES[focusTask.weekday]} {fmt12(focusTask.scheduled_time)} — {focusTask.title}
                  </CardDescription>
                </div>
                <button className="text-xs text-slate-500 hover:text-ink" onClick={() => setParams({})}>Clear</button>
              </CardHeader>
              <CardContent className="space-y-2">
                {scenario.filter((c) => c.capabilities.includes(focusTask.category)).map((c) => (
                  <Button key={c.id} variant="outline" size="sm" className="w-full justify-start" onClick={() => helpWithFocus(c, focusTask)} disabled={!focusTask.scheduled_time}>
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    What if {firstName(c.name)} is available then?
                  </Button>
                ))}
                {!scenario.some((c) => c.capabilities.includes(focusTask.category)) && <p className="text-xs text-slate-500">No one on the team is approved for this kind of task. Try adding a helper.</p>}
                <p className="text-[11px] text-slate-500">This is a hypothetical — confirm with the person before applying.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <div>
                <CardTitle>Quick scenarios</CardTitle>
                <CardDescription>One click to explore a change</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {PRESETS.filter((p) => p.needs.every((id) => scenario.some((c) => c.id === id))).map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.key}
                    onClick={() => setScenario((s) => p.apply(clone(s!)))}
                    className={cn("flex w-full gap-3 rounded-xl border p-3 text-left transition hover:border-teal-400 hover:bg-teal-50/50", p.key === "maya-wed" ? "border-teal-200 bg-teal-50/40" : "border-slate-200")}
                  >
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", p.key === "maya-wed" ? "text-teal-600" : "text-slate-500")} />
                    <div>
                      <div className="text-sm font-semibold text-ink">{p.title}</div>
                      <div className="text-xs text-slate-600">{p.body}</div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div>
                <CardTitle>Extend someone's availability</CardTitle>
                <CardDescription>Add a hypothetical window</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label htmlFor="q-cg">Caregiver</Label>
                  <Select id="q-cg" className="mt-1" value={quick.cg} onChange={(e) => setQuick({ ...quick, cg: e.target.value })}>
                    <option value="">Choose…</option>
                    {scenario.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label htmlFor="q-day">Day</Label>
                  <Select id="q-day" className="mt-1" value={quick.day} onChange={(e) => setQuick({ ...quick, day: Number(e.target.value) })}>
                    {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="q-s">From</Label>
                  <Input id="q-s" className="mt-1" type="time" step={300} value={quick.start} onChange={(e) => setQuick({ ...quick, start: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="q-e">To</Label>
                  <Input id="q-e" className="mt-1" type="time" step={300} value={quick.end} onChange={(e) => setQuick({ ...quick, end: e.target.value })} />
                </div>
                <Button className="col-span-2" variant="outline" onClick={addQuickWindow} disabled={!quick.cg || quick.start >= quick.end}>
                  <Plus /> Add window to scenario
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div>
                <CardTitle>Care team in this scenario</CardTitle>
                <CardDescription>Remove people, adjust limits, edit calendars</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {scenario.map((c) => {
                const w = after.workload.find((x) => x.caregiver_id === c.id);
                return (
                  <div key={c.id} className={cn("rounded-xl border border-slate-200 p-3", !c.active && "bg-slate-50 opacity-70")}>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="flex-1 truncate text-sm font-semibold text-ink">{c.name}</span>
                      {c.consent !== "confirmed" && <Badge tone="amber">{c.consent}</Badge>}
                      <Switch checked={c.active} onChange={(v) => setCg(c.id, { active: v })} label={`${c.name} active`} />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <span className="w-[86px]">Limit {c.max_hours_per_week} h/wk</span>
                      <input type="range" min={0} max={20} step={0.5} value={c.max_hours_per_week} onChange={(e) => setCg(c.id, { max_hours_per_week: Number(e.target.value) })} className="flex-1 accent-teal-600" aria-label={`${c.name} weekly hour limit`} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{w ? `${w.tasks} tasks · ${w.minutes} min` : "—"}</span>
                      <button className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline" onClick={() => setEditing(clone(c))}>
                        <Pencil className="h-3 w-3" /> Edit calendar & details
                      </button>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" className="w-full" onClick={() => setEditing({ ...blankCaregiver(scenario), id: uid("scn-cg"), name: "" })}>
                <UserPlus /> Add a potential helper
              </Button>
              <p className="text-[11px] text-slate-500">New helpers start as “pending”, so they only appear as tentative coverage until they agree.</p>
            </CardContent>
          </Card>
        </div>

        {/* -------- Results -------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Coverage matrix · after scenario</CardTitle>
                <CardDescription>Changed tasks animate from their previous state. Click any cell for the explanation.</CardDescription>
              </div>
              <div className="hidden gap-3 text-[11px] text-slate-600 sm:flex">
                {(["covered", "tentative", "uncovered"] as TaskStatus[]).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CELL_BG[s], outline: `1px solid ${CELL_FG[s]}33` }} />{STATUS_META[s].label}</span>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <Matrix tasks={ws.tasks} dates={planDates(ws)} result={after} before={before} changed={changedIds} onSelect={(id) => {
                  if (!result) return openTask(id);
                  const a = after.assignments.find((x) => x.task_id === id);
                  toast({ title: `Scenario · ${taskById[id]?.title}`, body: a?.explanation, tone: a?.status === "uncovered" ? "error" : "info" });
                }} />
              {result && <p className="mt-2 text-[11px] text-slate-500">In scenario mode, clicking a cell shows the scenario's explanation for that task.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <div>
                <CardTitle>Scenario changes</CardTitle>
                <CardDescription>What you've changed vs. the saved care team</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {changeLog.length === 0 ? (
                <p className="text-sm text-slate-500">No changes yet. Pick a quick scenario or edit a caregiver to begin.</p>
              ) : (
                <ul className="space-y-1.5">
                  {changeLog.map((c, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> {c}
                    </li>
                  ))}
                </ul>
              )}
              {reassigned.length > 0 && <p className="mt-3 text-xs text-slate-500">{reassigned.length} task(s) would be reassigned between caregivers.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* sticky actions */}
      <div className={cn("no-print sticky bottom-4 z-20 mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lift backdrop-blur", tourStep !== null && "hidden")}>
        <div className="text-sm text-slate-600">
          {dirty ? (
            <>
              Scenario: <b className="text-ink">{before.summary.covered} → {after.summary.covered}</b> covered ({before.summary.coverage_percent}% → {after.summary.coverage_percent}%)
            </>
          ) : (
            "Make a change to see its effect."
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={reset} disabled={!dirty}>
            <RotateCcw /> Reset Scenario
          </Button>
          <Button
            variant="accent"
            disabled={!dirty || applying || simulating}
            onClick={() => {
              if (confirm(`Apply this scenario to the real care schedule?\n\n${changeLog.join("\n")}\n\nOnly apply changes the people involved have agreed to.`)) apply();
            }}
          >
            {applying ? <Loader2 className="animate-spin" /> : <Check />} Apply Changes
          </Button>
        </div>
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <SheetContent title={editing.name ? `Scenario: ${editing.name}` : "Potential helper"} description="Edits stay in this scenario until you apply them." className="max-w-[760px]">
            <div className="px-6 py-5">
              <CaregiverForm value={editing} onChange={setEditing} highlightBlockIds={scenarioBlockIds} />
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-6 py-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!editing.name.trim()) return toast({ title: "Name is required", tone: "error" });
                  setScenario((s) => (s!.some((c) => c.id === editing.id) ? s!.map((c) => (c.id === editing.id ? editing : c)) : [...s!, editing]));
                  setEditing(null);
                }}
              >
                Update scenario
              </Button>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </>
  );
}
