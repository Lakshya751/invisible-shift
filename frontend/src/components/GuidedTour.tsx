import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, CheckCircle2, Presentation, X } from "lucide-react";
import { useApp } from "@/state/AppState";
import { Button } from "./ui/button";
import { cn, DAY_NAMES, fmt12 } from "@/lib/utils";

const ROUTES = ["/app/overview", "/app/gaps", "/app/simulator?preset=maya-wed", "/app/simulator?preset=maya-wed"];

export function GuidedTour() {
  const { tourStep, setTourStep, data, lastSim } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (tourStep === null) return;
    if (tourStep < 3) navigate(ROUTES[tourStep]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep]);

  if (tourStep === null || !data) return null;
  const s = data.schedule.summary;
  const p = data.workspace.patient;
  const caregivers = data.workspace.caregivers.filter((c) => c.active);
  const resolved = lastSim?.changes.filter((c) => c.kind === "resolved") || [];

  const steps = [
    {
      kicker: "Step 1 · The problem",
      title: `${p.name} is going home.`,
      body: (
        <>
          {p.name}{p.age ? `, ${p.age}` : ""} (fictional) was discharged after surgery with a plan containing{" "}
          <b>{s.total} care tasks</b> this week — medication reminders, meals, supervised walks and evening dressing checks. {caregivers.length} family members
          are ready to help: {caregivers.map((c) => c.name.split(" ")[0]).join(", ")}.
        </>
      ),
    },
    {
      kicker: "Step 2 · The hidden gaps",
      title: `${s.uncovered} tasks have no one.`,
      body: (
        <>
          Having {caregivers.length} caregivers does not guarantee coverage. The scheduling engine matched every task against declared availability,
          approved capabilities and commitments: <b>{s.uncovered} tasks are uncovered</b> — weekday lunches and two evening dressing checks.
        </>
      ),
    },
    {
      kicker: "Step 3 · The intervention",
      title: "What if Maya helps Wednesday evening?",
      body: (
        <>
          We give Maya a new availability window — <b>Wednesday 7:45–8:30 PM</b> — in an isolated scenario. The deterministic scheduler re-runs
          immediately. Nothing is saved until we press “Apply changes”.
        </>
      ),
    },
    {
      kicker: "Step 4 · The result",
      title: lastSim ? `${lastSim.before.summary.covered} → ${lastSim.after.summary.covered} covered tasks` : "Recalculating…",
      body: (
        <>
          {resolved.length > 0 && (
            <span className="mb-2 flex items-start gap-2 rounded-lg bg-emerald-50 p-2 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {resolved.map((r) => `${DAY_NAMES[r.weekday]} ${fmt12(r.time)} — ${r.title} → ${r.after_caregiver}`).join("; ")}
              </span>
            </span>
          )}
          <span className="block font-display text-[19px] italic leading-snug text-white">
            “We didn't change the patient's treatment. We made the family's ability to deliver care visible.”
          </span>
        </>
      ),
    },
  ];
  const step = steps[tourStep];

  return (
    <AnimatePresence>
      <motion.div
        key={tourStep}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="no-print fixed bottom-4 left-1/2 z-[45] w-[calc(100vw-32px)] max-w-[560px] -translate-x-1/2 rounded-2xl border border-navy-700 bg-navy-900 p-5 text-white shadow-lift lg:left-[calc(50%+130px)]"
        role="dialog"
        aria-label="Guided demo"
      >
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-300">
            <Presentation className="h-3.5 w-3.5" /> {step.kicker}
          </div>
          <button onClick={() => setTourStep(null)} className="rounded p-1 text-navy-300 hover:bg-white/10 hover:text-white" aria-label="End guided demo">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
        <div className="mt-1.5 text-sm leading-relaxed text-navy-100">{step.body}</div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <span key={i} className={cn("h-1.5 rounded-full transition-all", i === tourStep ? "w-6 bg-teal-400" : "w-1.5 bg-navy-600")} />
            ))}
          </div>
          <div className="flex gap-2">
            {tourStep > 0 && (
              <Button size="sm" variant="ghost" className="text-navy-200 hover:bg-white/10 hover:text-white" onClick={() => setTourStep(tourStep - 1)}>
                <ArrowLeft /> Back
              </Button>
            )}
            {tourStep < 3 ? (
              <Button size="sm" variant="accent" onClick={() => setTourStep(tourStep + 1)}>
                {tourStep === 2 ? "Show the result" : "Next"} <ArrowRight />
              </Button>
            ) : (
              <Button size="sm" variant="accent" onClick={() => setTourStep(null)}>
                Finish
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
