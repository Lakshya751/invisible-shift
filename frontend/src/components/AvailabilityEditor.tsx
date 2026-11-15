import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { AvailabilityBlock, BlockStatus, Commitment } from "@/lib/types";
import { cn, DAY_SHORT, fmtRange, fromMin, toMin, uid } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input, Label, Select } from "./ui/input";

const START_H = 6;
const END_H = 23;
const PX_PER_MIN = 0.62;
const SNAP = 15;

const BRUSH: Record<BlockStatus, { label: string; cls: string }> = {
  available: { label: "Available", cls: "bg-emerald-500/85 text-white border-emerald-600" },
  possible: { label: "Possibly available", cls: "bg-amber-300/80 text-amber-950 border-amber-500 border-dashed" },
  unavailable: { label: "Unavailable", cls: "bg-slate-500/80 text-white border-slate-600" },
};

export function AvailabilityEditor({
  value,
  commitments,
  onChange,
  highlightIds,
}: {
  value: AvailabilityBlock[];
  commitments: Commitment[];
  onChange: (v: AvailabilityBlock[]) => void;
  highlightIds?: Set<string>;
}) {
  const [brush, setBrush] = useState<BlockStatus>("available");
  const [draft, setDraft] = useState<{ day: number; a: number; b: number } | null>(null);
  const dragRef = useRef<{ day: number; a: number } | null>(null);
  const [form, setForm] = useState({ days: [] as number[], start: "09:00", end: "10:00", status: "available" as BlockStatus });
  const [formErr, setFormErr] = useState<string | null>(null);
  const total = (END_H - START_H) * 60;
  const height = total * PX_PER_MIN;

  const yToMin = (el: HTMLElement, clientY: number) => {
    const r = el.getBoundingClientRect();
    const m = Math.round(((clientY - r.top) / PX_PER_MIN) / SNAP) * SNAP;
    return Math.max(0, Math.min(total, m)) + START_H * 60;
  };

  function commit(day: number, a: number, b: number, status: BlockStatus) {
    const s = Math.min(a, b);
    const e = Math.max(a, b);
    if (e - s < SNAP) return;
    onChange([...value, { id: uid("blk"), weekday: day, start: fromMin(s), end: fromMin(e), status }]);
  }

  function addFromForm() {
    setFormErr(null);
    if (!form.days.length) return setFormErr("Choose at least one day.");
    if (form.start >= form.end) return setFormErr("Start must be before end.");
    onChange([
      ...value,
      ...form.days.map((d) => ({ id: uid("blk"), weekday: d, start: form.start, end: form.end, status: form.status })),
    ]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-slate-600">Drag on the calendar to paint:</span>
        {(Object.keys(BRUSH) as BlockStatus[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBrush(b)}
            className={cn(
              "rounded-full border px-2.5 py-1 font-medium transition",
              brush === b ? BRUSH[b].cls : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
            aria-pressed={brush === b}
          >
            {BRUSH[b].label}
          </button>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-slate-500">
          <span className="h-2.5 w-4 rounded-sm bg-[repeating-linear-gradient(45deg,#cbd5e1_0_3px,#f1f5f9_3px_6px)]" /> Commitment
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <div className="grid min-w-[620px] grid-cols-[44px_repeat(7,1fr)] select-none">
          <div className="border-b border-slate-200 bg-slate-50" />
          {DAY_SHORT.map((d) => (
            <div key={d} className="border-b border-l border-slate-200 bg-slate-50 py-1.5 text-center text-[11px] font-semibold text-slate-600">{d}</div>
          ))}
          <div className="relative" style={{ height }}>
            {Array.from({ length: END_H - START_H }, (_, i) => (
              <div key={i} className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-slate-400" style={{ top: i * 60 * PX_PER_MIN }}>
                {i === 0 ? "" : `${((START_H + i) % 12) || 12}${START_H + i < 12 ? "a" : "p"}`}
              </div>
            ))}
          </div>
          {DAY_SHORT.map((_, day) => (
            <div
              key={day}
              className="relative cursor-crosshair border-l border-slate-100 touch-none"
              style={{ height }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest("[data-block]")) return;
                const m = yToMin(e.currentTarget, e.clientY);
                dragRef.current = { day, a: m };
                setDraft({ day, a: m, b: m + SNAP });
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!dragRef.current || dragRef.current.day !== day) return;
                setDraft({ day, a: dragRef.current.a, b: yToMin(e.currentTarget, e.clientY) });
              }}
              onPointerUp={() => {
                if (draft && dragRef.current) commit(draft.day, draft.a, Math.abs(draft.b - draft.a) <= SNAP ? Math.min(draft.a + 60, END_H * 60) : draft.b, brush);
                dragRef.current = null;
                setDraft(null);
              }}
            >
              {Array.from({ length: END_H - START_H }, (_, i) => (
                <div key={i} className="absolute inset-x-0 border-t border-slate-100" style={{ top: i * 60 * PX_PER_MIN }} />
              ))}
              {commitments
                .filter((c) => c.weekday === day)
                .map((c) => {
                  const s = Math.max(toMin(c.start), START_H * 60);
                  const e = Math.min(toMin(c.end), END_H * 60);
                  if (e <= s) return null;
                  return (
                    <div
                      key={c.id}
                      title={`${c.label} ${fmtRange(c.start, c.end)}`}
                      className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded bg-[repeating-linear-gradient(45deg,#e2e8f0_0_4px,#f8fafc_4px_8px)] px-1 text-[9.5px] font-medium text-slate-500"
                      style={{ top: (s - START_H * 60) * PX_PER_MIN, height: (e - s) * PX_PER_MIN }}
                    >
                      {c.label}
                    </div>
                  );
                })}
              {value
                .filter((b) => b.weekday === day)
                .map((b) => {
                  const s = Math.max(toMin(b.start), START_H * 60);
                  const e = Math.min(toMin(b.end), END_H * 60);
                  if (e <= s) return null;
                  return (
                    <div
                      data-block
                      key={b.id}
                      className={cn(
                        "group absolute inset-x-1 overflow-hidden rounded-md border px-1 text-[9.5px] font-semibold leading-tight shadow-sm",
                        BRUSH[b.status].cls,
                        highlightIds?.has(b.id) && "ring-2 ring-teal-400 ring-offset-1",
                      )}
                      style={{ top: (s - START_H * 60) * PX_PER_MIN, height: Math.max(14, (e - s) * PX_PER_MIN) }}
                      title={`${BRUSH[b.status].label} ${fmtRange(b.start, b.end)}`}
                    >
                      <span className="block truncate pr-3">{fmtRange(b.start, b.end)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${DAY_SHORT[day]} ${fmtRange(b.start, b.end)}`}
                        onClick={() => onChange(value.filter((x) => x.id !== b.id))}
                        className="absolute right-0.5 top-0.5 rounded bg-black/20 p-[1px] opacity-70 hover:opacity-100 group-hover:opacity-100"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  );
                })}
              {draft && draft.day === day && (
                <div
                  className={cn("pointer-events-none absolute inset-x-1 rounded-md border opacity-70", BRUSH[brush].cls)}
                  style={{
                    top: (Math.min(draft.a, draft.b) - START_H * 60) * PX_PER_MIN,
                    height: Math.max(8, Math.abs(draft.b - draft.a) * PX_PER_MIN),
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-700">Or add an exact window</div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>Days</Label>
            <div className="mt-1 flex gap-1">
              {DAY_SHORT.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={form.days.includes(i)}
                  onClick={() => setForm((f) => ({ ...f, days: f.days.includes(i) ? f.days.filter((x) => x !== i) : [...f.days, i] }))}
                  className={cn(
                    "h-8 w-9 rounded-md border text-[11px] font-medium",
                    form.days.includes(i) ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white text-slate-600",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="av-start">From</Label>
            <Input id="av-start" type="time" step={300} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="mt-1 w-[120px]" />
          </div>
          <div>
            <Label htmlFor="av-end">To</Label>
            <Input id="av-end" type="time" step={300} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="mt-1 w-[120px]" />
          </div>
          <div>
            <Label htmlFor="av-status">Status</Label>
            <Select id="av-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as BlockStatus })} className="mt-1 w-[170px]">
              <option value="available">Available</option>
              <option value="possible">Possibly available</option>
              <option value="unavailable">Unavailable</option>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={addFromForm}>
            <Plus /> Add
          </Button>
        </div>
        {formErr && <p className="mt-2 text-xs text-gap">{formErr}</p>}
      </div>
    </div>
  );
}
