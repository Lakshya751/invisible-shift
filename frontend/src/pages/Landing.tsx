import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, CalendarCheck2, FileSearch, FlaskConical, Loader2, Lock, Play, ScanSearch, ShieldCheck, Upload, Users } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/** Illustrative preview of the product's weekly coverage grid (labelled as a preview). */
function ProductPreview() {
  const rows = [
    { t: "8:00 AM", label: "Medication reminder", who: "Maya", cells: "GGGGGGG" },
    { t: "12:00 PM", label: "Meal assistance", who: "Sarah", cells: "RRRRRGG" },
    { t: "3:00 PM", label: "Supervised walk", who: "Daniel", cells: "GGGGGGG" },
    { t: "8:00 PM", label: "Dressing observation", who: "Sarah", cells: "GGRGRGG" },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-br from-teal-400/25 via-transparent to-indigo-400/20 blur-2xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-3 text-[11px] text-slate-500">Weekly coverage · product preview</span>
        </div>
        <div className="grid grid-cols-3 gap-3 p-4">
          {[
            ["Care tasks", "28", "text-ink"],
            ["Covered", "21", "text-covered"],
            ["Uncovered", "7", "text-gap"],
          ].map(([k, v, c]) => (
            <div key={k} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <div className="text-[10.5px] uppercase tracking-wider text-slate-500">{k}</div>
              <div className={cn("text-2xl font-semibold tabular-nums", c)}>{v}</div>
            </div>
          ))}
        </div>
        <div className="px-4 pb-4">
          <div className="grid grid-cols-[96px_repeat(7,1fr)] gap-1 text-[10px] text-slate-500">
            <div />
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} className="text-center font-semibold">{d}</div>
            ))}
            {rows.map((r, ri) => (
              <div key={r.label} className="contents">
                <div className="truncate py-1.5 pr-1 text-[10.5px] text-slate-700">
                  <div className="font-medium">{r.t}</div>
                  <div className="truncate text-slate-400">{r.label}</div>
                </div>
                {r.cells.split("").map((c, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4 + (ri * 7 + i) * 0.02 }}
                    className={cn(
                      "flex items-center justify-center rounded-md border text-[9px] font-semibold",
                      c === "G" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700",
                    )}
                  >
                    {c === "G" ? r.who[0] : "—"}
                  </motion.div>
                ))}
              </div>
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 }}
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900"
          >
            <b>Wednesday, 8:00 PM</b> — Dressing observation is uncovered because all eligible caregivers are unavailable.
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { launchDemo, me } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    const ok = await launchDemo();
    setBusy(false);
    if (ok) navigate("/app/overview");
  }
  const signedIn = !!me && !me.user.is_guest;
  const uploadPath = me ? (me.active_patient_id ? "/app/discharge" : "/app/patients") : "/signin?mode=signup&next=/app/patients";

  return (
    <div className="min-h-screen bg-canvas">
      <section className="relative overflow-hidden bg-navy-950 text-white">
        <div className="grain absolute inset-0" />
        <div className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-teal-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <header className="flex items-center justify-between py-5">
            <Logo light />
            <div className="flex items-center gap-2">
              <Button variant="ghost" className="text-navy-200 hover:bg-white/10 hover:text-white" onClick={() => navigate(signedIn ? "/app/patients" : "/signin")}>
                {signedIn ? "My patients" : "Sign in"}
              </Button>
              <Button variant="accent" size="sm" onClick={go} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Play />} Live demo
              </Button>
            </div>
          </header>

          <div className="grid items-center gap-12 pb-20 pt-10 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-16">
            <div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-5 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 text-xs font-medium text-teal-200">
                Because care doesn't end when the hospital says goodbye.
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-[54px]"
              >
                The hospital has a discharge plan.{" "}
                <span className="font-display font-normal italic text-teal-300">Does your family have a care plan?</span>
              </motion.h1>
              <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-6 max-w-xl text-[17px] leading-relaxed text-navy-200">
                Invisible Shift transforms discharge instructions into coordinated family care, revealing scheduling gaps before they go unnoticed.
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" variant="accent" onClick={go} disabled={busy} className="shadow-[0_8px_30px_-6px_rgba(20,184,166,0.6)]">
                  {busy ? <Loader2 className="animate-spin" /> : <Play />} Launch Live Demo
                </Button>
                <Button size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => navigate(uploadPath)}>
                  <Upload /> Upload a Care Plan
                </Button>
              </motion.div>
              <p className="mt-4 text-xs text-navy-400">No account needed. The demo uses a fictional patient and runs without an AI key.</p>
            </div>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <ProductPreview />
            </motion.div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">The overlooked question</div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">“Who is actually available to perform every required care task?”</h2>
          <p className="mt-3 text-slate-600">
            Discharge instructions say <i>what</i> must happen at home. They rarely know whether the people responsible can be there when it needs to happen.
            Three caregivers can still leave a Wednesday evening uncovered.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: FileSearch, t: "Read the discharge plan", b: "AI extracts reviewable tasks from the PDF — preserving original wording and flagging anything unspecified." },
            { icon: Users, t: "Map the care team", b: "Each caregiver declares real availability, capabilities, commitments and limits. Empty never means available." },
            { icon: CalendarCheck2, t: "Match every task", b: "A deterministic scheduler assigns tasks under explicit constraints and explains every decision." },
            { icon: FlaskConical, t: "Close the gaps", b: "See exactly what's uncovered and why, then test fixes in the What-If Simulator before committing." },
          ].map(({ icon: Icon, t, b }, i) => (
            <motion.div
              key={t}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="rounded-xl bg-navy-900 p-2.5 text-teal-300"><Icon className="h-5 w-5" /></div>
                <span className="font-mono text-xs text-slate-400">0{i + 1}</span>
              </div>
              <h3 className="font-semibold text-ink">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{b}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-3">
          {[
            { icon: ShieldCheck, t: "Logistics, not medicine", b: "Never changes clinical instructions, invents dosages, diagnoses, or predicts deterioration." },
            { icon: ScanSearch, t: "Grounded in data", b: "Every number comes from the scheduling engine. The AI only explains verified facts." },
            { icon: Lock, t: "Human in the loop", b: "Families confirm every extracted task. Professional-only care is flagged for the care team, never assigned to family." },
          ].map(({ icon: Icon, t, b }) => (
            <div key={t} className="flex gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" />
              <div>
                <h3 className="font-semibold text-ink">{t}</h3>
                <p className="mt-1 text-sm text-slate-600">{b}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
        <h2 className="font-display text-4xl italic text-navy-900">See the gaps before they become problems.</h2>
        <Button size="lg" variant="default" className="mt-6" onClick={go} disabled={busy}>
          Launch Live Demo <ArrowRight />
        </Button>
      </section>

      <footer className="border-t border-slate-200 px-4 py-6 text-center text-xs leading-relaxed text-slate-500">
        Invisible Shift is a hackathon prototype for care logistics. It is not medical advice, does not establish medical readiness for discharge, is not certified and is not HIPAA-compliant.
        Demo data is entirely fictional.
      </footer>
    </div>
  );
}
