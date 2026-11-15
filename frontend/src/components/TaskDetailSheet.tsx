import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, CircleSlash, Flag, FlaskConical, MessageCircleQuestion, Quote, UserCheck, XCircle } from "lucide-react";
import { Sheet, SheetContent } from "./ui/sheet";
import { Button } from "./ui/button";
import { Select } from "./ui/input";
import { Badge } from "./ui/badge";
import { StatusChip } from "./StatusChip";
import { useApp } from "@/state/AppState";
import { api, ApiError } from "@/lib/api";
import { CATEGORY_LABEL, cn, DAY_NAMES, fmt12, fmtDate, GAP_META } from "@/lib/utils";

export function TaskDetailSheet() {
  const { openTaskId, openTask, taskById, assignmentById, data, run, setData, toast, setNavigatorOpen } = useApp();
  const navigate = useNavigate();
  const [pick, setPick] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = openTaskId ? taskById[openTaskId] : null;
  const a = openTaskId ? assignmentById[openTaskId] : null;
  const gap = data?.gaps.find((g) => g.task_id === openTaskId && g.type !== "needs_confirmation");

  const close = (o: boolean) => {
    if (!o) {
      openTask(null);
      setConflict(null);
      setPick("");
    }
  };

  async function tryAssign() {
    if (!t || !pick) return;
    setBusy(true);
    setConflict(null);
    try {
      const res = await api.assign(t.task_id, pick);
      setData(res);
      toast({ title: "Assignment saved", body: "Validated by the scheduling engine.", tone: "success" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setConflict(e.message);
      else toast({ title: "Could not assign", body: (e as Error).message, tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!t} onOpenChange={close}>
      {t && a && (
        <SheetContent title={t.title} description={`${DAY_NAMES[t.weekday]}, ${fmtDate(t.date, { month: "long", day: "numeric" })} · ${fmt12(a.start_time || t.scheduled_time)}`}>
          <div className="space-y-6 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={a.status} />
              <Badge>{CATEGORY_LABEL[t.category]}</Badge>
              <Badge>{t.estimated_duration_minutes} min</Badge>
              {t.requires_physical_assist && <Badge tone="indigo">Physical assist</Badge>}
              {t.requires_transport && <Badge tone="indigo">Needs transport</Badge>}
              {a.pinned && <Badge tone="teal">Manually assigned</Badge>}
            </div>

            <section
              className={cn(
                "rounded-xl border p-4",
                a.status === "covered" && "border-emerald-200 bg-emerald-50/60",
                a.status === "uncovered" && "border-red-200 bg-red-50/60",
                (a.status === "tentative" || a.status === "professional_review") && "border-amber-200 bg-amber-50/60",
                a.status === "self_managed" && "border-slate-200 bg-slate-50",
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                {a.status === "covered" ? <UserCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {a.status === "uncovered" ? "Why it's uncovered" : "Why this assignment"}
                {a.gap_type && <span className="font-normal normal-case tracking-normal text-slate-500">· {GAP_META[a.gap_type].label}</span>}
              </div>
              <p className="text-sm leading-relaxed text-ink">{a.explanation}</p>
              {a.caregiver_name && (
                <p className="mt-2 text-sm text-slate-600">
                  Assigned caregiver: <span className="font-semibold text-ink">{a.caregiver_name}</span>
                  {a.start_time && a.end_time && ` · ${fmt12(a.start_time)}–${fmt12(a.end_time)}`}
                </p>
              )}
            </section>

            {a.candidates.length > 0 && (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">How each caregiver was evaluated</h4>
                <ul className="space-y-2">
                  {a.candidates.map((c) => (
                    <li key={c.caregiver_id} className="flex gap-2.5 rounded-lg border border-slate-100 bg-white p-2.5 text-sm">
                      {c.eligible ? (
                        <CheckCircle2 className={cn("mt-0.5 h-4 w-4 shrink-0", c.tentative ? "text-warn" : "text-covered")} />
                      ) : c.code === "inactive" ? (
                        <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-gap" />
                      )}
                      <span className="text-slate-700">{c.reason}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <Quote className="h-3.5 w-3.5" /> Source instruction {t.source_page ? `· page ${t.source_page}` : ""}
              </h4>
              <blockquote className="rounded-lg border-l-4 border-navy-300 bg-navy-50/60 px-4 py-3 text-sm italic leading-relaxed text-navy-800">
                “{t.source_text || "No source text recorded."}”
              </blockquote>
              <p className="mt-1.5 text-[11px] text-slate-500">Original wording preserved. Invisible Shift never edits clinical instructions.</p>
            </section>

            {t.eligibility === "family" && (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Try a different caregiver</h4>
                <div className="flex gap-2">
                  <Select value={pick} onChange={(e) => { setPick(e.target.value); setConflict(null); }} aria-label="Choose caregiver">
                    <option value="">Choose a caregiver…</option>
                    {data?.workspace.caregivers.filter((c) => c.active).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  <Button onClick={tryAssign} disabled={!pick || busy} variant="outline">Check & assign</Button>
                </div>
                {conflict && (
                  <div className="mt-2 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span><span className="font-semibold">Not possible: </span>{conflict}</span>
                  </div>
                )}
                {a.pinned && (
                  <Button variant="link" size="sm" className="mt-1" onClick={() => run(api.unassign(t.task_id), "Returned to automatic scheduling")}>
                    Remove manual assignment
                  </Button>
                )}
              </section>
            )}

            {(a.status === "uncovered" || a.status === "professional_review" || a.status === "tentative") && (
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Coordination actions</h4>
                {gap && <p className="mb-3 text-sm text-slate-700">{gap.suggested_action}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="accent" onClick={() => { openTask(null); navigate(`/app/simulator?focus=${t.task_id}`); }}>
                    <FlaskConical /> Test a fix in the simulator
                  </Button>
                  {gap && (
                    <Button size="sm" variant="outline" disabled={gap.status === "flagged_for_care_team"} onClick={() => run(api.setGapStatus(gap.gap_id, "flagged_for_care_team"), "Flagged for the care team")}>
                      <Flag /> {gap.status === "flagged_for_care_team" ? "Flagged" : "Flag for care team"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => { openTask(null); setNavigatorOpen(true); }}>
                    <MessageCircleQuestion /> Ask Care Navigator
                  </Button>
                </div>
              </section>
            )}
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
