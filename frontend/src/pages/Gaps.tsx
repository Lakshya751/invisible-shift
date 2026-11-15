import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertOctagon, CalendarX2, Car, CheckCircle2, ChevronDown, Flag, FlaskConical, Gauge, HeartPulse, Info, ShieldQuestion, Users } from "lucide-react";
import { useApp } from "@/state/AppState";
import { api } from "@/lib/api";
import type { Gap, GapStatus, GapType } from "@/lib/types";
import { cn, GAP_META } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";

const ICON: Record<GapType, typeof AlertOctagon> = {
  availability: CalendarX2,
  scheduling_conflict: AlertOctagon,
  capability: Users,
  transportation: Car,
  workload: Gauge,
  professional: HeartPulse,
  needs_confirmation: ShieldQuestion,
};
const STATUS_LABEL: Record<GapStatus, { t: string; tone: "red" | "neutral" | "amber" | "green" }> = {
  open: { t: "Open", tone: "red" },
  acknowledged: { t: "Acknowledged", tone: "neutral" },
  flagged_for_care_team: { t: "Flagged for care team", tone: "amber" },
  resolved: { t: "Handled", tone: "green" },
};
const URG = { high: "Within 1 day", medium: "Within 3 days", low: "Later this week" };

function GapCard({ g, i }: { g: Gap; i: number }) {
  const { run, openTask } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const Icon = ICON[g.type];
  const tone = GAP_META[g.type].tone;
  const set = (s: GapStatus, msg: string) => run(api.setGapStatus(g.gap_id, s), msg);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
      <Card className={cn("overflow-hidden", g.status === "resolved" && "opacity-60")}>
        <div className="flex gap-4 p-4 sm:p-5">
          <div className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex", tone === "red" ? "bg-gap-soft text-gap" : "bg-warn-soft text-warn")}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone}>{GAP_META[g.type].label}</Badge>
              <Badge tone={STATUS_LABEL[g.status].tone}>{STATUS_LABEL[g.status].t}</Badge>
              <span className="text-[11px] text-slate-500" title={g.clinical_note}>
                Scheduling urgency: <b className="font-semibold text-slate-700">{g.scheduling_urgency}</b> · {URG[g.scheduling_urgency]}
              </span>
            </div>
            <h3 className="mt-2 font-semibold text-ink">{g.headline}</h3>
            <p className="mt-1 text-sm text-slate-700">{g.reason}</p>
            <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2 text-sm text-teal-900">
              <span className="font-semibold">Suggested next step: </span>
              {g.suggested_action}
            </div>
            {g.details.length > 0 && (
              <button onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-ink" aria-expanded={open}>
                <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} /> Why each caregiver couldn't help
              </button>
            )}
            <AnimatePresence>
              {open && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-1 overflow-hidden text-xs text-slate-600">
                  {g.details.map((d, k) => (
                    <li key={k} className="rounded-md bg-slate-50 px-2.5 py-1.5">{d}</li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
            <div className="mt-4 flex flex-wrap gap-2">
              {g.task_id && (
                <Button size="sm" variant="outline" onClick={() => openTask(g.task_id)}>
                  View task
                </Button>
              )}
              {g.task_id && g.type !== "professional" && (
                <Button size="sm" variant="accent" onClick={() => navigate(`/app/simulator?focus=${g.task_id}`)}>
                  <FlaskConical /> Try a fix
                </Button>
              )}
              {g.status !== "flagged_for_care_team" && (
                <Button size="sm" variant="ghost" onClick={() => set("flagged_for_care_team", "Flagged — added to the care report")}>
                  <Flag /> Flag for care team
                </Button>
              )}
              {g.status === "open" && (
                <Button size="sm" variant="ghost" onClick={() => set("acknowledged", "Acknowledged")}>
                  Acknowledge
                </Button>
              )}
              {g.status !== "resolved" ? (
                <Button size="sm" variant="ghost" onClick={() => set("resolved", "Marked as handled")}>
                  <CheckCircle2 /> Mark handled
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => set("open", "Reopened")}>
                  Reopen
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function Gaps() {
  const { data } = useApp();
  const [type, setType] = useState<GapType | "all">("all");
  const gaps = useMemo(() => data?.gaps ?? [], [data]);
  if (!data) return null;
  const types = [...new Set(gaps.map((g) => g.type))];
  const shown = gaps.filter((g) => type === "all" || g.type === type);
  const taskGaps = gaps.filter((g) => g.task_id && g.type !== "needs_confirmation");

  return (
    <>
      <PageHeader
        eyebrow="Coverage gaps"
        title="Care Gap Detection"
        description="Every place where the plan and the family's real availability don't meet — with the specific reason and a nonclinical next step."
      />

      <Card className="mb-5 flex flex-col gap-3 border-navy-800 bg-navy-900 p-5 text-white sm:flex-row sm:items-center">
        <div className="flex-1">
          <div className="text-2xl font-semibold tracking-tight">
            {taskGaps.length} task{taskGaps.length === 1 ? "" : "s"} without coverage
          </div>
          <p className="mt-1 text-sm text-navy-200">
            {data.workspace.caregivers.filter((c) => c.active).length} caregivers on the team — and still {taskGaps.length} moment{taskGaps.length === 1 ? "" : "s"} this week where nobody eligible is available.
          </p>
        </div>
        <div className="flex items-start gap-2 rounded-xl bg-white/5 p-3 text-xs text-navy-200 sm:max-w-[320px]">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Urgency here is <b className="text-white">scheduling urgency</b> (how soon a gap occurs) — not clinical risk. Contact the care team with clinical concerns.
        </div>
      </Card>

      {gaps.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No coverage gaps" body="Every schedulable task has an eligible, confirmed caregiver." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            <button onClick={() => setType("all")} className={cn("rounded-full border px-3 py-1 text-xs font-medium", type === "all" ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white text-slate-600")}>
              All · {gaps.length}
            </button>
            {types.map((t) => (
              <button key={t} onClick={() => setType(t)} className={cn("rounded-full border px-3 py-1 text-xs font-medium", type === t ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white text-slate-600")}>
                {GAP_META[t].label} · {gaps.filter((g) => g.type === t).length}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <AnimatePresence>
              {shown.map((g, i) => (
                <GapCard key={g.gap_id} g={g} i={i} />
              ))}
            </AnimatePresence>
          </div>
        </>
      )}
    </>
  );
}
