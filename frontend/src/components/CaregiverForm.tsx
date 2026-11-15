import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Caregiver, Category, Commitment, PreferredTime } from "@/lib/types";
import { CATEGORIES, CATEGORY_LABEL, cn, DAY_SHORT, uid } from "@/lib/utils";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { Button } from "./ui/button";
import { Input, Label, Select, Switch, Textarea } from "./ui/input";

export const CG_COLORS = ["#0d9488", "#7c3aed", "#e8590c", "#2563eb", "#be185d", "#4d7c0f"];

export function blankCaregiver(existing: Caregiver[]): Caregiver {
  return {
    id: "",
    name: "",
    relationship: "",
    color: CG_COLORS[existing.length % CG_COLORS.length],
    availability: [],
    preferred_times: [],
    max_hours_per_week: 5,
    has_transportation: false,
    can_physical_assist: false,
    capabilities: [],
    commitments: [],
    consent: "pending",
    active: true,
    notes: "",
  };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function CaregiverForm({
  value,
  onChange,
  highlightBlockIds,
}: {
  value: Caregiver;
  onChange: (c: Caregiver) => void;
  highlightBlockIds?: Set<string>;
}) {
  const set = <K extends keyof Caregiver>(k: K, v: Caregiver[K]) => onChange({ ...value, [k]: v });
  const [c, setC] = useState<Omit<Commitment, "id">>({ weekday: 0, start: "09:00", end: "17:00", label: "Work" });

  return (
    <div className="space-y-7">
      <Section title="Who">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="cg-name">Name</Label>
            <Input id="cg-name" className="mt-1" value={value.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Jordan Lee" />
          </div>
          <div>
            <Label htmlFor="cg-rel">Relationship to patient</Label>
            <Input id="cg-rel" className="mt-1" value={value.relationship} onChange={(e) => set("relationship", e.target.value)} placeholder="e.g. Neighbor" />
          </div>
          <div>
            <Label htmlFor="cg-consent">Agreement to help</Label>
            <Select id="cg-consent" className="mt-1" value={value.consent} onChange={(e) => set("consent", e.target.value as Caregiver["consent"])}>
              <option value="confirmed">Confirmed — agreed to assigned tasks</option>
              <option value="pending">Pending — not yet confirmed (tentative only)</option>
              <option value="declined">Declined</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="cg-hours">Max care hours / week</Label>
            <Input id="cg-hours" className="mt-1" type="number" min={0} max={168} step={0.5} value={value.max_hours_per_week} onChange={(e) => set("max_hours_per_week", Math.max(0, Number(e.target.value)))} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label>Color</Label>
          {CG_COLORS.map((col) => (
            <button key={col} type="button" aria-label={`Color ${col}`} onClick={() => set("color", col)} className={cn("h-6 w-6 rounded-full ring-offset-2", value.color === col && "ring-2 ring-navy-900")} style={{ background: col }} />
          ))}
        </div>
      </Section>

      <Section title="Approved task capabilities" hint="Only tasks in these categories can be assigned. Approve clinical-adjacent tasks only when the care team has said a family member may do them.">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => {
            const on = value.capabilities.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={on}
                onClick={() => set("capabilities", on ? value.capabilities.filter((x) => x !== cat) : ([...value.capabilities, cat] as Category[]))}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}
              >
                {CATEGORY_LABEL[cat]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-6 text-sm text-slate-700">
          <label className="flex items-center gap-2"><Switch checked={value.can_physical_assist} onChange={(v) => set("can_physical_assist", v)} label="Can provide physical assistance" /> Can provide physical assistance</label>
          <label className="flex items-center gap-2"><Switch checked={value.has_transportation} onChange={(v) => set("has_transportation", v)} label="Has transportation" /> Has transportation</label>
        </div>
      </Section>

      <Section title="Weekly availability" hint="Only explicitly marked time counts. An empty calendar is never treated as available.">
        <AvailabilityEditor value={value.availability} commitments={value.commitments} onChange={(v) => set("availability", v)} highlightIds={highlightBlockIds} />
      </Section>

      <Section title="Preferred caregiving times">
        <div className="flex flex-wrap gap-1.5">
          {(["morning", "midday", "afternoon", "evening"] as PreferredTime[]).map((p) => {
            const on = value.preferred_times.includes(p);
            return (
              <button key={p} type="button" aria-pressed={on} onClick={() => set("preferred_times", on ? value.preferred_times.filter((x) => x !== p) : [...value.preferred_times, p])} className={cn("rounded-full border px-3 py-1 text-xs font-medium capitalize", on ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white text-slate-600")}>
                {p}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Existing commitments" hint="Work, appointments and other obligations. These always block assignments.">
        <div className="space-y-1.5">
          {value.commitments.length === 0 && <p className="text-xs text-slate-500">None added.</p>}
          {value.commitments.map((cm) => (
            <div key={cm.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm">
              <span className="w-10 text-xs font-semibold text-slate-500">{DAY_SHORT[cm.weekday]}</span>
              <span className="flex-1 truncate text-ink">{cm.label}</span>
              <span className="text-xs tabular-nums text-slate-600">{cm.start}–{cm.end}</span>
              <button type="button" onClick={() => set("commitments", value.commitments.filter((x) => x.id !== cm.id))} className="rounded p-1 text-slate-400 hover:text-gap" aria-label={`Remove ${cm.label}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label>Day</Label>
            <Select className="mt-1 w-[90px]" value={c.weekday} onChange={(e) => setC({ ...c, weekday: Number(e.target.value) })}>
              {DAY_SHORT.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </Select>
          </div>
          <div className="min-w-[120px] flex-1">
            <Label>Label</Label>
            <Input className="mt-1" value={c.label} onChange={(e) => setC({ ...c, label: e.target.value })} />
          </div>
          <div>
            <Label>From</Label>
            <Input className="mt-1 w-[110px]" type="time" value={c.start} onChange={(e) => setC({ ...c, start: e.target.value })} />
          </div>
          <div>
            <Label>To</Label>
            <Input className="mt-1 w-[110px]" type="time" value={c.end} onChange={(e) => setC({ ...c, end: e.target.value })} />
          </div>
          <Button type="button" variant="outline" disabled={!c.label || c.start >= c.end} onClick={() => set("commitments", [...value.commitments, { ...c, id: uid("cm") }])}>
            <Plus /> Add
          </Button>
        </div>
      </Section>

      <Section title="Notes">
        <Textarea value={value.notes} onChange={(e) => set("notes", e.target.value)} rows={2} placeholder="Anything the family should know (non-medical)." />
      </Section>
    </div>
  );
}
