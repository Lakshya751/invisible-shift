import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCheck, Download, FileText, FileUp, Loader2, Plus, Quote, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useApp } from "@/state/AppState";
import { api } from "@/lib/api";
import type { Eligibility, ExtractedTask, ExtractionResult, Frequency } from "@/lib/types";
import { CATEGORIES, CATEGORY_LABEL, cn, DAY_SHORT, fmt12 } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Switch, Textarea } from "@/components/ui/input";

const FREQ: { v: Frequency; l: string }[] = [
  { v: "daily", l: "Daily" },
  { v: "weekdays", l: "Weekdays" },
  { v: "weekends", l: "Weekends" },
  { v: "specific_days", l: "Specific days" },
  { v: "once", l: "Once" },
  { v: "as_needed", l: "As needed (not scheduled)" },
];
const ELIG: { v: Eligibility; l: string; tone: "green" | "amber" | "neutral" | "red" }[] = [
  { v: "family", l: "Family caregiver", tone: "green" },
  { v: "self", l: "Patient self-managed", tone: "neutral" },
  { v: "professional", l: "Professional only", tone: "amber" },
  { v: "unknown", l: "Unclear — needs clarification", tone: "red" },
];

function modeLabel(m: string) {
  if (m.startsWith("ai:")) return { text: `AI extraction · ${m.slice(3)}`, tone: "teal" as const };
  if (m === "rules") return { text: "Rule-based extraction (demo mode, no AI key)", tone: "amber" as const };
  return { text: "Synthetic sample plan", tone: "indigo" as const };
}

function TaskEditor({ t, onChange, onDelete }: { t: ExtractedTask; onChange: (t: ExtractedTask) => void; onDelete: () => void }) {
  const set = <K extends keyof ExtractedTask>(k: K, v: ExtractedTask[K]) => onChange({ ...t, [k]: v, confirmed: k === "confirmed" ? (v as boolean) : t.confirmed });
  const missing: string[] = [];
  if (!t.estimated_duration_minutes) missing.push("duration");
  if (!t.frequency) missing.push("frequency");
  if (t.frequency === "once" && !t.date && !t.days_of_week.length) missing.push("date");
  const canConfirm = missing.length === 0 && t.title.trim().length > 0;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }}>
      <Card className={cn("overflow-hidden", t.confirmed ? "border-emerald-200" : t.needs_review ? "border-amber-200" : "")}>
        <div className={cn("flex flex-wrap items-center gap-2 border-b px-4 py-2.5", t.confirmed ? "border-emerald-100 bg-emerald-50/60" : "border-slate-100 bg-slate-50/60")}>
          <span className="font-mono text-[11px] text-slate-400">{t.task_id}</span>
          <Badge tone={ELIG.find((e) => e.v === t.eligibility)!.tone}>{ELIG.find((e) => e.v === t.eligibility)!.l}</Badge>
          {t.needs_review && !t.confirmed && (
            <Badge tone="amber">
              <AlertTriangle className="h-3 w-3" /> Needs review
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-3">
            <label className={cn("flex items-center gap-2 text-xs font-medium", canConfirm ? "text-slate-700" : "text-slate-400")}>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-teal-600"
                checked={t.confirmed}
                disabled={!canConfirm}
                onChange={(e) => set("confirmed", e.target.checked)}
              />
              Reviewed & confirmed
            </label>
            <button onClick={onDelete} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-gap" aria-label={`Delete ${t.title}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Task title</Label>
              <Input className="mt-1" value={t.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <Select className="mt-1" value={t.category} onChange={(e) => set("category", e.target.value as ExtractedTask["category"])}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Who may perform it</Label>
              <Select
                className="mt-1"
                value={t.eligibility}
                onChange={(e) => {
                  const v = e.target.value as Eligibility;
                  onChange({ ...t, eligibility: v, professional_required: v === "professional", caregiver_required: v !== "self", confirmed: false });
                }}
              >
                {ELIG.map((e) => (
                  <option key={e.v} value={e.v}>{e.l}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Time</Label>
              <Input className="mt-1" type="time" value={t.scheduled_time ?? ""} onChange={(e) => set("scheduled_time", e.target.value || null)} />
              {!t.scheduled_time && <p className="mt-1 text-[11px] text-amber-700">Unspecified — matched to any available window that day</p>}
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input
                className={cn("mt-1", !t.estimated_duration_minutes && "border-amber-300")}
                type="number"
                min={1}
                max={600}
                value={t.estimated_duration_minutes ?? ""}
                placeholder="Enter estimate"
                onChange={(e) => set("estimated_duration_minutes", e.target.value ? Math.max(1, Math.min(600, Number(e.target.value))) : null)}
              />
            </div>
            <div className="col-span-2">
              <Label>Frequency</Label>
              <Select className={cn("mt-1", !t.frequency && "border-amber-300")} value={t.frequency ?? ""} onChange={(e) => set("frequency", (e.target.value || null) as Frequency | null)}>
                <option value="">Unspecified — choose…</option>
                {FREQ.map((f) => (
                  <option key={f.v} value={f.v}>{f.l}</option>
                ))}
              </Select>
            </div>
            {(t.frequency === "specific_days" || (t.frequency === "once" && !t.date)) && (
              <div className="col-span-2">
                <Label>Days</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {DAY_SHORT.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => set("days_of_week", t.days_of_week.includes(i) ? t.days_of_week.filter((x) => x !== i) : [...t.days_of_week, i].sort())}
                      className={cn("h-8 w-10 rounded-md border text-xs", t.days_of_week.includes(i) ? "border-navy-900 bg-navy-900 text-white" : "border-slate-200 bg-white")}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {t.frequency === "once" && (
              <div className="col-span-2">
                <Label>Date</Label>
                <Input className="mt-1" type="date" value={t.date ?? ""} onChange={(e) => set("date", e.target.value || null)} />
              </div>
            )}
            <div className="col-span-2 flex flex-wrap gap-5 pt-1 text-xs text-slate-700">
              <label className="flex items-center gap-2">
                <Switch checked={t.requires_physical_assist} onChange={(v) => set("requires_physical_assist", v)} label="Requires physical assistance" /> Physical assistance
              </label>
              <label className="flex items-center gap-2">
                <Switch checked={t.requires_transport} onChange={(v) => set("requires_transport", v)} label="Requires transportation" /> Transportation
              </label>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <Quote className="h-3.5 w-3.5" /> Original instruction {t.source_page ? `(page ${t.source_page})` : ""}
              </div>
              <blockquote className="rounded-lg border-l-4 border-navy-300 bg-navy-50/60 px-3 py-2.5 text-sm italic leading-relaxed text-navy-800">
                “{t.source_text || "Added manually"}”
              </blockquote>
            </div>
            {t.review_notes.length > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                {t.review_notes.map((n, i) => (
                  <li key={i} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {n}
                  </li>
                ))}
              </ul>
            )}
            {t.eligibility === "professional" && (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                Professional-only tasks are never assigned to family caregivers. They appear as “Requires professional review” so the care team can confirm a provider.
              </p>
            )}
            {missing.length > 0 && <p className="text-xs text-slate-500">Fill in {missing.join(", ")} to confirm this task.</p>}
            {t.scheduled_time && <p className="text-xs text-slate-500">Will be scheduled at {fmt12(t.scheduled_time)} — Invisible Shift never moves this time.</p>}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export default function Discharge() {
  const { data, run, toast } = useApp();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<ExtractionResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function doExtract(p: Promise<ExtractionResult>, label: string) {
    setBusy(label);
    setUploadErr(null);
    try {
      const r = await p;
      setDraft(r);
      if (!r.tasks.length) setUploadErr("No actionable care instructions were recognised. You can add tasks manually below.");
    } catch (e) {
      setUploadErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      setUploadErr("Unsupported file type. Please upload a PDF, or paste the instruction text.");
      return;
    }
    doExtract(api.upload(f), "upload");
  }

  async function confirm() {
    if (!draft) return;
    setBusy("confirm");
    const res = await run(
      api.confirmPlan(draft.tasks, {
        source: draft.mode === "sample" ? "sample" : "upload",
        source_name: draft.document?.filename || "Discharge plan",
        extraction_mode: draft.mode,
      }),
    );
    setBusy(null);
    if (res) {
      toast({ title: "Care plan confirmed", body: `${res.schedule.summary.total} dated tasks scheduled for the week.`, tone: "success" });
      setDraft(null);
      navigate("/app/schedule");
    }
  }

  const tasks = draft?.tasks || [];
  const allConfirmed = tasks.length > 0 && tasks.every((t) => t.confirmed);
  const update = (i: number, t: ExtractedTask) => setDraft((d) => (d ? { ...d, tasks: d.tasks.map((x, j) => (j === i ? t : x)) } : d));
  const confirmable = (t: ExtractedTask) => !!t.estimated_duration_minutes && !!t.frequency && !(t.frequency === "once" && !t.date && !t.days_of_week.length);

  return (
    <>
      <PageHeader
        eyebrow="Discharge plan"
        title="AI Discharge Plan Reader"
        description="Upload discharge instructions. Tasks are extracted with original wording preserved, then you review and confirm every one before anything is scheduled. Nothing is invented: unspecified details are flagged."
      />

      {!draft && (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardContent className="pt-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  onFile(e.dataTransfer.files[0]);
                }}
                className={cn(
                  "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition",
                  drag ? "border-teal-500 bg-teal-50" : "border-slate-300 bg-slate-50/50",
                )}
              >
                <div className="rounded-2xl bg-navy-900 p-3 text-teal-300">{busy === "upload" ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileUp className="h-6 w-6" />}</div>
                <h3 className="mt-4 font-semibold text-ink">{busy === "upload" ? "Reading your discharge document…" : "Drop a discharge PDF here"}</h3>
                <p className="mt-1 text-sm text-slate-500">Text-based PDFs up to 10 MB. Use fictional or de-identified documents only.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => fileRef.current?.click()} disabled={!!busy}>
                    <FileUp /> Choose PDF
                  </Button>
                  <Button variant="outline" onClick={() => setShowPaste((v) => !v)} disabled={!!busy}>
                    <FileText /> Paste text instead
                  </Button>
                </div>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
              <AnimatePresence>
                {showPaste && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-4 space-y-2">
                      <Label htmlFor="paste">Discharge instruction text</Label>
                      <Textarea id="paste" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="e.g. Lunch at 12:00 PM daily. A caregiver should help prepare a soft meal…" />
                      <Button onClick={() => doExtract(api.extractText(paste), "paste")} disabled={!paste.trim() || !!busy}>
                        {busy === "paste" ? <Loader2 className="animate-spin" /> : <Wand2 />} Extract tasks
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {uploadErr && (
                <div className="mt-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {uploadErr}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Try it with sample data</CardTitle>
                  <CardDescription>Synthetic discharge plan for the fictional patient Robert Wilson.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="accent" className="w-full" onClick={() => doExtract(api.sample(), "sample")} disabled={!!busy}>
                  {busy === "sample" ? <Loader2 className="animate-spin" /> : <Sparkles />} Load sample discharge plan
                </Button>
                <Button variant="outline" className="w-full" asChild>
                  <a href="/api/discharge/sample.pdf" download>
                    <Download /> Download sample PDF to upload
                  </a>
                </Button>
                <p className="pt-1 text-xs text-slate-500">The sample PDF also includes a nurse-only dressing change, a follow-up appointment and a self-managed instruction — to show how eligibility is classified.</p>
              </CardContent>
            </Card>
            {data && data.workspace.plan.templates.length > 0 && (
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Current confirmed plan</CardTitle>
                    <CardDescription>{data.workspace.plan.source_name}</CardDescription>
                  </div>
                  <Badge tone={modeLabel(data.workspace.plan.extraction_mode).tone}>{data.workspace.plan.templates.length} instructions</Badge>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {data.workspace.plan.templates.map((t) => (
                    <div key={t.task_id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-ink">{t.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">{fmt12(t.scheduled_time)} · {t.frequency ?? "—"}</span>
                    </div>
                  ))}
                  <Button variant="link" size="sm" className="mt-1" onClick={() => setDraft({ tasks: data.workspace.plan.templates, mode: data.workspace.plan.extraction_mode, warnings: [], document: { filename: data.workspace.plan.source_name } })}>
                    Edit current plan
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {draft && (
        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={modeLabel(draft.mode).tone} className="text-xs">{modeLabel(draft.mode).text}</Badge>
              {draft.document?.filename && <span className="text-sm text-slate-600">{draft.document.filename}{draft.document.pages ? ` · ${draft.document.pages} page(s)` : ""}</span>}
              <span className="ml-auto text-sm text-slate-600">
                <b className="text-ink">{tasks.filter((t) => t.confirmed).length}</b> of {tasks.length} confirmed
              </span>
            </div>
            {draft.warnings.map((w, i) => (
              <p key={i} className="mt-2 flex gap-1.5 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
              </p>
            ))}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <motion.div className="h-full bg-covered" animate={{ width: `${tasks.length ? (100 * tasks.filter((t) => t.confirmed).length) / tasks.length : 0}%` }} />
            </div>
          </Card>

          <AnimatePresence>
            {tasks.map((t, i) => (
              <TaskEditor key={t.task_id} t={t} onChange={(nt) => update(i, nt)} onDelete={() => setDraft((d) => (d ? { ...d, tasks: d.tasks.filter((_, j) => j !== i) } : d))} />
            ))}
          </AnimatePresence>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lift backdrop-blur">
            <Button
              variant="outline"
              onClick={() =>
                setDraft((d) =>
                  d
                    ? {
                        ...d,
                        tasks: [
                          ...d.tasks,
                          {
                            task_id: `manual_${Date.now().toString(36)}`,
                            title: "New care task",
                            category: "other",
                            scheduled_time: null,
                            frequency: null,
                            days_of_week: [],
                            date: null,
                            estimated_duration_minutes: null,
                            caregiver_required: true,
                            professional_required: false,
                            eligibility: "family",
                            requires_transport: false,
                            requires_physical_assist: false,
                            source_text: "",
                            source_page: null,
                            needs_review: true,
                            review_notes: ["Added manually — make sure it matches the discharge instructions."],
                            confirmed: false,
                          },
                        ],
                      }
                    : d,
                )
              }
            >
              <Plus /> Add task
            </Button>
            <Button variant="ghost" onClick={() => setDraft((d) => (d ? { ...d, tasks: d.tasks.map((t) => (confirmable(t) && t.title.trim() ? { ...t, confirmed: true } : t)) } : d))}>
              <CheckCheck /> Confirm all complete tasks
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            <div className="ml-auto flex items-center gap-3">
              {!allConfirmed && <span className="hidden text-xs text-slate-500 sm:inline">Every task must be reviewed before scheduling.</span>}
              <Button variant="accent" disabled={!allConfirmed || busy === "confirm"} onClick={confirm}>
                {busy === "confirm" ? <Loader2 className="animate-spin" /> : <CheckCheck />} Confirm & build schedule
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
