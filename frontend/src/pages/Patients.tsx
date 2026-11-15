import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarDays, CheckCircle2, FileHeart, Loader2, Pencil, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { useApp } from "@/state/AppState";
import type { PatientFields, PatientSummary } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";

function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const empty = (): PatientFields => ({ name: "", age: null, situation: "", discharge_date: null, hospital: "", plan_start_date: nextMonday() });

function PatientForm({ value, onChange }: { value: PatientFields; onChange: (v: PatientFields) => void }) {
  const set = <K extends keyof PatientFields>(k: K, v: PatientFields[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Label htmlFor="p-name">Patient name *</Label>
        <Input id="p-name" className="mt-1" value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ana Lopez" autoFocus />
      </div>
      <div>
        <Label htmlFor="p-age">Age</Label>
        <Input id="p-age" className="mt-1" type="number" min={0} max={125} value={value.age ?? ""} onChange={(e) => set("age", e.target.value === "" ? null : Math.max(0, Math.min(125, Number(e.target.value))))} />
      </div>
      <div>
        <Label htmlFor="p-hosp">Hospital / care team</Label>
        <Input id="p-hosp" className="mt-1" value={value.hospital} onChange={(e) => set("hospital", e.target.value)} placeholder="Optional" />
      </div>
      <div>
        <Label htmlFor="p-dd">Discharge date</Label>
        <Input id="p-dd" className="mt-1" type="date" value={value.discharge_date ?? ""} onChange={(e) => set("discharge_date", e.target.value || null)} />
      </div>
      <div>
        <Label htmlFor="p-start">Care plan starts *</Label>
        <Input id="p-start" className="mt-1" type="date" value={value.plan_start_date} onChange={(e) => set("plan_start_date", e.target.value)} />
        <p className="mt-1 text-[11px] text-slate-500">First day of the 7-day schedule.</p>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="p-sit">Situation (non-clinical summary)</Label>
        <Textarea id="p-sit" className="mt-1" rows={2} value={value.situation} onChange={(e) => set("situation", e.target.value)} placeholder="e.g. Home after knee surgery; lives with spouse." />
      </div>
      <p className="text-[11px] text-slate-500 sm:col-span-2">Prototype — not HIPAA-compliant. Use fictional or de-identified details.</p>
    </div>
  );
}

function PatientCard({ p, active, onOpen, onEdit, onDelete, busy }: { p: PatientSummary; active: boolean; onOpen: () => void; onEdit: () => void; onDelete: () => void; busy: boolean }) {
  const s = p.summary;
  const hasPlan = s.total > 0;
  return (
    <Card className={cn("flex flex-col p-5 transition", active && "ring-2 ring-teal-500")}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-sm font-semibold text-teal-300">
          {p.patient.name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-ink">{p.patient.name}{p.patient.age != null ? `, ${p.patient.age}` : ""}</h3>
            {p.is_demo && <Badge tone="indigo">Fictional demo</Badge>}
            {active && <Badge tone="teal">Open</Badge>}
          </div>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{p.patient.situation || "No summary added."}</p>
        </div>
        <div className="flex gap-0.5">
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label={`Edit ${p.patient.name}`}><Pencil /></Button>
          <Button size="icon" variant="ghost" onClick={onDelete} aria-label={`Delete ${p.patient.name}`}><Trash2 /></Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 py-2">
          <div className="text-lg font-semibold tabular-nums text-ink">{s.total}</div>
          <div className="text-[10.5px] text-slate-500">tasks</div>
        </div>
        <div className="rounded-lg bg-slate-50 py-2">
          <div className={cn("text-lg font-semibold tabular-nums", s.uncovered + s.professional_review ? "text-gap" : "text-ink")}>{s.uncovered + s.professional_review}</div>
          <div className="text-[10.5px] text-slate-500">uncovered</div>
        </div>
        <div className="rounded-lg bg-slate-50 py-2">
          <div className="text-lg font-semibold tabular-nums text-ink">{p.caregivers}</div>
          <div className="text-[10.5px] text-slate-500">caregivers</div>
        </div>
      </div>

      {hasPlan ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>Care coverage</span>
            <span className="font-semibold tabular-nums text-ink">{s.coverage_percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <motion.div className="h-full rounded-full bg-covered" initial={{ width: 0 }} animate={{ width: `${s.coverage_percent}%` }} transition={{ duration: 0.8 }} />
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600">No discharge plan yet — open to upload one.</div>
      )}

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> Week of {fmtDate(p.plan_start, { month: "short", day: "numeric", year: "numeric" })}</span>
        <Button size="sm" variant={active ? "subtle" : "default"} onClick={onOpen} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Open <ArrowRight />
        </Button>
      </div>
    </Card>
  );
}

export default function Patients() {
  const { me, refreshMe, selectPatient, addPatient, addDemoPatient, updatePatient, deletePatient } = useApp();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<{ id: string | null; value: PatientFields } | null>(null);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  if (!me) return null;
  const patients = me.patients;

  async function open(id: string, hasPlan: boolean) {
    setOpening(id);
    await selectPatient(id);
    setOpening(null);
    navigate(hasPlan ? "/app/overview" : "/app/discharge");
  }

  async function save() {
    if (!editing) return;
    setErr(null);
    if (!editing.value.name.trim()) return setErr("Patient name is required.");
    if (!editing.value.plan_start_date) return setErr("Choose when the care plan starts.");
    setSaving(true);
    const ok = editing.id ? await updatePatient(editing.id, editing.value) : await addPatient(editing.value);
    setSaving(false);
    if (ok) {
      const isNew = !editing.id;
      setEditing(null);
      if (isNew) navigate("/app/discharge");
    }
  }

  async function demo() {
    setOpening("demo");
    const ok = await addDemoPatient();
    setOpening(null);
    if (ok) navigate("/app/overview");
  }

  return (
    <>
      <PageHeader
        eyebrow="Patients"
        title={me.user.is_guest ? "Patients (guest session)" : `${me.user.name.split(" ")[0]}'s patients`}
        description="Each patient has their own discharge plan, care team and weekly schedule. Open a patient to work on their care coverage."
        actions={
          <>
            {!patients.some((p) => p.is_demo) && (
              <Button variant="outline" onClick={demo} disabled={opening === "demo"}>
                {opening === "demo" ? <Loader2 className="animate-spin" /> : <Sparkles />} Add demo patient
              </Button>
            )}
            <Button onClick={() => { setErr(null); setEditing({ id: null, value: empty() }); }}>
              <UserPlus /> Add patient
            </Button>
          </>
        }
      />

      {patients.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <div className="mb-4 inline-flex rounded-xl bg-navy-900 p-2.5 text-teal-300"><UserPlus className="h-5 w-5" /></div>
            <h2 className="text-lg font-semibold text-ink">Add your first patient</h2>
            <p className="mt-1 text-sm text-slate-600">Start with the person coming home from hospital. Next you'll upload their discharge instructions and add the family members who can help.</p>
            <ol className="mt-4 space-y-2 text-sm text-slate-700">
              {[
                [UserPlus, "Add patient details"],
                [FileHeart, "Upload & confirm the discharge plan"],
                [Users, "Add caregivers and their availability"],
                [CheckCircle2, "See coverage and fix gaps"],
              ].map(([Icon, t], i) => {
                const I = Icon as typeof UserPlus;
                return (
                  <li key={i} className="flex items-center gap-2.5"><I className="h-4 w-4 text-teal-600" /> {t as string}</li>
                );
              })}
            </ol>
            <Button className="mt-5" onClick={() => setEditing({ id: null, value: empty() })}><UserPlus /> Add patient</Button>
          </Card>
          <Card className="border-dashed p-6">
            <div className="mb-4 inline-flex rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><Sparkles className="h-5 w-5" /></div>
            <h2 className="text-lg font-semibold text-ink">Or explore with a fictional family</h2>
            <p className="mt-1 text-sm text-slate-600">Robert Wilson (72, fictional) is home after surgery with 28 weekly care tasks and three family caregivers — and 7 tasks nobody can cover.</p>
            <Button variant="outline" className="mt-5" onClick={demo} disabled={opening === "demo"}>
              {opening === "demo" ? <Loader2 className="animate-spin" /> : <Sparkles />} Add demo patient
            </Button>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {patients.map((p) => (
            <PatientCard
              key={p.id}
              p={p}
              active={p.id === me.active_patient_id}
              busy={opening === p.id}
              onOpen={() => open(p.id, p.summary.total > 0 || p.instructions > 0)}
              onEdit={() => {
                setErr(null);
                setEditing({
                  id: p.id,
                  value: { name: p.patient.name, age: p.patient.age, situation: p.patient.situation, discharge_date: p.patient.discharge_date, hospital: p.patient.hospital, plan_start_date: p.plan_start },
                });
              }}
              onDelete={async () => {
                if (confirm(`Delete ${p.patient.name}? Their discharge plan, care team and schedule will be permanently removed.`)) await deletePatient(p.id);
              }}
            />
          ))}
        </div>
      )}

      {me.user.is_guest && (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center">
          <span className="flex-1">You're in a temporary guest session. Create an account to keep these patients.</span>
          <Button size="sm" onClick={() => navigate("/signin?mode=signup")}>Create account</Button>
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <SheetContent side="center" title={editing.id ? "Edit patient" : "Add patient"} description={editing.id ? "Changing the start date moves the 7-day schedule; task times stay the same." : "You'll upload their discharge plan next."}>
            <div className="px-6 py-5">
              <PatientForm value={editing.value} onChange={(v) => setEditing({ ...editing, value: v })} />
              {err && <p className="mt-3 text-sm text-gap" role="alert">{err}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-3">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="animate-spin" />} {editing.id ? "Save changes" : "Add patient"}
              </Button>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </>
  );
}
