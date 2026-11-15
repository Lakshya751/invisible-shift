import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Printer, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { Report as R } from "@/lib/types";
import { useApp } from "@/state/AppState";
import { CATEGORY_LABEL, fmtDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/Logo";

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="print-card mt-8">
      <h2 className="mb-3 flex items-baseline gap-3 border-b border-slate-200 pb-2 text-[15px] font-semibold text-ink">
        <span className="font-mono text-xs text-slate-400">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function Report() {
  const { data } = useApp();
  const [rep, setRep] = useState<R | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .report()
      .then((r) => {
        setRep(r);
        setErr(null);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };
  // reload whenever the shared schedule changes
  useEffect(load, [data]);

  if (loading && !rep) return <div className="flex h-60 items-center justify-center text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Generating report…</div>;
  if (err || !rep) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">Could not generate report: {err}</div>;
  const s = rep.summary;

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Care Report</h1>
          <p className="text-sm text-slate-600">A coordination summary for a care coordinator or discharge team. Use “Save as PDF” in the print dialog to export.</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw /> Refresh</Button>
        <Button onClick={() => window.print()}><Printer /> Print / Save as PDF</Button>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-card sm:px-10 print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-navy-900 pb-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-700">Home Care Coverage Assessment</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">{rep.title}</h1>
            <p className="mt-1 text-sm text-slate-600">Logistical decision support · Generated {new Date(rep.generated_at).toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" })}</p>
          </div>
          <LogoMark className="h-10 w-10 shrink-0" />
        </header>

        {rep.is_demo && (
          <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
            SYNTHETIC DEMONSTRATION — the patient, family and discharge plan in this report are fictional.
          </div>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-slate-500">Patient</dt><dd className="font-semibold text-ink">{rep.patient.name}{rep.patient.synthetic ? " (fictional)" : ""}</dd></div>
          <div><dt className="text-xs text-slate-500">Age</dt><dd className="font-semibold text-ink">{rep.patient.age ?? "—"}</dd></div>
          <div><dt className="text-xs text-slate-500">Care plan period</dt><dd className="font-semibold text-ink">{fmtDate(rep.plan.start, { month: "short", day: "numeric" })} – {fmtDate(rep.plan.end, { month: "short", day: "numeric", year: "numeric" })}</dd></div>
          <div><dt className="text-xs text-slate-500">Date of analysis</dt><dd className="font-semibold text-ink">{new Date(rep.generated_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">Source</dt><dd className="text-ink">{rep.plan.source} · {rep.plan.instructions} instructions</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">Extraction</dt><dd className="text-ink">{rep.plan.extraction_mode === "sample" ? "Synthetic sample plan" : rep.plan.extraction_mode === "rules" ? "Rule-based (no AI), confirmed by family" : `${rep.plan.extraction_mode}, confirmed by family`}</dd></div>
        </dl>

        <Section n={1} title="Coverage summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Total tasks", s.total, "text-ink"],
              ["Covered", s.covered, "text-covered"],
              ["Uncovered", s.uncovered, "text-gap"],
              ["Coverage", `${s.coverage_percent}%`, "text-ink"],
            ].map(([k, v, c]) => (
              <div key={k as string} className="rounded-xl border border-slate-200 p-3">
                <div className="text-xs text-slate-500">{k}</div>
                <div className={`text-2xl font-semibold tabular-nums ${c}`}>{v}</div>
              </div>
            ))}
          </div>
          {(s.tentative > 0 || s.professional_review > 0 || s.self_managed > 0) && (
            <p className="mt-2 text-xs text-slate-600">
              Also: {s.tentative} tentative (awaiting caregiver confirmation), {s.professional_review} requiring professional review, {s.self_managed} patient self-managed.
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">Coverage = covered tasks ÷ tasks needing a caregiver or provider. It measures caregiver availability only and is not a measure of medical readiness or risk.</p>
        </Section>

        <Section n={2} title="Caregiver workload">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 font-medium">Caregiver</th><th className="font-medium">Agreement</th><th className="text-right font-medium">Tasks</th><th className="text-right font-medium">Minutes / limit</th><th className="text-right font-medium">Utilization</th></tr></thead>
            <tbody>
              {rep.workload.map((w) => {
                const cg = rep.caregivers.find((c) => c.name === w.name);
                return (
                  <tr key={w.caregiver_id} className="border-t border-slate-100">
                    <td className="py-2"><span className="font-medium text-ink">{w.name}</span> <span className="text-xs text-slate-500">{cg?.relationship}{cg && !cg.active ? " · inactive" : ""}</span><div className="text-[11px] text-slate-500">{cg?.capabilities.map((c) => CATEGORY_LABEL[c]).join(", ")}</div></td>
                    <td className="capitalize text-slate-700">{cg?.consent}</td>
                    <td className="text-right tabular-nums">{w.tasks}</td>
                    <td className="text-right tabular-nums">{w.minutes} / {w.max_minutes}</td>
                    <td className="text-right tabular-nums">{w.utilization_percent}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>

        <Section n={3} title={`Uncovered tasks & reasons (${rep.uncovered.length})`}>
          {rep.uncovered.length === 0 ? (
            <p className="text-sm text-slate-600">No uncovered tasks.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 font-medium">When</th><th className="font-medium">Task</th><th className="font-medium">Reason</th><th className="font-medium">Status</th></tr></thead>
              <tbody>
                {rep.uncovered.map((u, i) => (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap py-2 pr-3 text-slate-700">{u.day?.slice(0, 3)} {u.date ? fmtDate(u.date, { month: "short", day: "numeric" }) : ""}<div className="text-xs font-semibold text-ink">{u.time}</div></td>
                    <td className="pr-3"><div className="font-medium text-ink">{u.task}</div><div className="text-xs text-gap">{u.gap_type}</div></td>
                    <td className="pr-3 text-slate-700">{u.reason}<div className="mt-0.5 text-xs text-slate-500">{u.details.join(" ")}</div></td>
                    <td className="whitespace-nowrap text-xs capitalize text-slate-600">{u.status.replace(/_/g, " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section n={4} title="Suggested coordination actions (nonclinical)">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {rep.coordination_actions.length ? rep.coordination_actions.map((a, i) => <li key={i}>{a}</li>) : <li>No actions needed.</li>}
          </ul>
        </Section>

        <Section n={5} title="Questions requiring clinician review">
          <ul className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            {rep.clinician_questions.length ? rep.clinician_questions.map((q, i) => <li key={i}>{q}</li>) : <li>None at this time.</li>}
          </ul>
        </Section>

        <footer className="mt-10 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div><b>Disclaimer.</b> {rep.disclaimer}</div>
        </footer>
      </article>
    </>
  );
}
