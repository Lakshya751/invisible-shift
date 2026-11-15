import { useState } from "react";
import { Bike, Car, Clock, HandHelping, Loader2, Pencil, Trash2, UserPlus, Users } from "lucide-react";
import { useApp } from "@/state/AppState";
import { api } from "@/lib/api";
import type { Caregiver } from "@/lib/types";
import { availabilityWindows } from "@/lib/availability";
import { CATEGORY_LABEL, cn, DAY_SHORT, fmtRange, fromMin } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CaregiverForm, blankCaregiver } from "@/components/CaregiverForm";
import { EmptyState } from "@/components/EmptyState";

const CONSENT = { confirmed: { t: "Confirmed", tone: "green" as const }, pending: { t: "Pending confirmation", tone: "amber" as const }, declined: { t: "Declined", tone: "red" as const } };

function WeekStrip({ cg }: { cg: Caregiver }) {
  const S = 6 * 60;
  const E = 23 * 60;
  return (
    <div className="space-y-1">
      {DAY_SHORT.map((d, i) => {
        const wins = availabilityWindows(cg, i);
        return (
          <div key={d} className="flex items-center gap-2">
            <span className="w-7 text-[10.5px] font-medium text-slate-500">{d}</span>
            <div className="relative h-3.5 flex-1 rounded bg-slate-100">
              {cg.commitments.filter((c) => c.weekday === i).map((c) => {
                const [a, b] = [c.start, c.end].map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
                return <div key={c.id} title={c.label} className="absolute inset-y-0 rounded bg-[repeating-linear-gradient(45deg,#cbd5e1_0_3px,#f1f5f9_3px_6px)]" style={{ left: `${((Math.max(a, S) - S) / (E - S)) * 100}%`, width: `${((Math.min(b, E) - Math.max(a, S)) / (E - S)) * 100}%` }} />;
              })}
              {wins.map(([a, b, tent], k) => (
                <div key={k} title={`${fmtRange(fromMin(a), fromMin(b))}${tent ? " (possibly)" : ""}`} className={cn("absolute inset-y-0 rounded", tent && "opacity-50")} style={{ left: `${((a - S) / (E - S)) * 100}%`, width: `${((b - a) / (E - S)) * 100}%`, background: cg.color }} />
              ))}
            </div>
            <span className="w-[108px] truncate text-right text-[10.5px] tabular-nums text-slate-500">{wins.length ? wins.map(([a, b]) => fmtRange(fromMin(a), fromMin(b))).join(", ") : "—"}</span>
          </div>
        );
      })}
      <div className="flex justify-between pl-9 pr-[116px] text-[9.5px] text-slate-400"><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div>
    </div>
  );
}

export default function CareTeam() {
  const { data, run, toast } = useApp();
  const [editing, setEditing] = useState<Caregiver | null>(null);
  const [saving, setSaving] = useState(false);
  if (!data) return null;
  const cgs = data.workspace.caregivers;
  const wl = Object.fromEntries(data.schedule.workload.map((w) => [w.caregiver_id, w]));

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return toast({ title: "Name is required", tone: "error" });
    setSaving(true);
    const res = await run(editing.id ? api.updateCaregiver(editing) : api.addCaregiver(editing), editing.id ? "Caregiver updated — schedule recalculated" : "Caregiver added — schedule recalculated");
    setSaving(false);
    if (res) setEditing(null);
  }

  return (
    <>
      <PageHeader
        eyebrow="Care team"
        title="Family caregivers"
        description="Who can help, when, and with what. The scheduler only uses availability that has been explicitly declared, and only assigns tasks a caregiver is approved for."
        actions={
          <>
            {data.workspace.is_demo && (
              <Button variant="ghost" onClick={() => { if (confirm("Start a blank workspace? This clears the demo patient, plan and caregivers.")) run(api.blank(), "Blank workspace ready"); }}>
                Start blank workspace
              </Button>
            )}
            <Button onClick={() => setEditing(blankCaregiver(cgs))}>
              <UserPlus /> Add caregiver
            </Button>
          </>
        }
      />

      {cgs.length === 0 ? (
        <EmptyState icon={Users} title="No caregivers yet" body="Add the family members and friends who can help, with their real weekly availability." action={<Button onClick={() => setEditing(blankCaregiver(cgs))}><UserPlus /> Add caregiver</Button>} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {cgs.map((cg) => {
            const w = wl[cg.id];
            return (
              <Card key={cg.id} className={cn("p-5", !cg.active && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-semibold text-white" style={{ background: cg.color }}>
                    {cg.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{cg.name}</h3>
                      <span className="text-sm text-slate-500">{cg.relationship}</span>
                      <Badge tone={CONSENT[cg.consent].tone}>{CONSENT[cg.consent].t}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> up to {cg.max_hours_per_week} h/week</span>
                      <span className="inline-flex items-center gap-1">{cg.has_transportation ? <Car className="h-3.5 w-3.5" /> : <Bike className="h-3.5 w-3.5" />} {cg.has_transportation ? "Has transport" : "No transport"}</span>
                      <span className="inline-flex items-center gap-1"><HandHelping className="h-3.5 w-3.5" /> {cg.can_physical_assist ? "Physical assist OK" : "No physical assist"}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(structuredClone(cg))} aria-label={`Edit ${cg.name}`}><Pencil /></Button>
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Remove ${cg.name} from the care team?`)) run(api.deleteCaregiver(cg.id), "Caregiver removed"); }} aria-label={`Remove ${cg.name}`}><Trash2 /></Button>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {cg.capabilities.map((c) => <Badge key={c} tone="teal">{CATEGORY_LABEL[c]}</Badge>)}
                  {cg.capabilities.length === 0 && <span className="text-xs text-slate-500">No approved task types yet.</span>}
                </div>
                <div className="mt-4">
                  <WeekStrip cg={cg} />
                </div>
                {w && (
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span><b className="text-ink">{w.tasks}</b> tasks assigned{w.tentative_tasks ? ` (${w.tentative_tasks} tentative)` : ""}</span>
                    <span className="tabular-nums">{w.minutes} of {w.max_minutes} min · {w.utilization_percent}%</span>
                  </div>
                )}
                {cg.notes && <p className="mt-3 text-xs text-slate-500">{cg.notes}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <SheetContent title={editing.id ? `Edit ${editing.name}` : "Add caregiver"} description="Changes re-run the scheduling engine immediately when saved." className="max-w-[760px]">
            <div className="px-6 py-5">
              <CaregiverForm value={editing} onChange={setEditing} />
            </div>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-6 py-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />} Save & recalculate</Button>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </>
  );
}
