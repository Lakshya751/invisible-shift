import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Play, ShieldCheck } from "lucide-react";
import { useApp } from "@/state/AppState";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function SignIn() {
  const { me, authChecked, signIn, signUp, launchDemo } = useApp();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = params.get("mode") === "signup" ? "signup" : "signin";
  const next = params.get("next");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<"form" | "demo" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const isGuest = !!me?.user.is_guest;

  // Already signed in with a real account → go to the app.
  useEffect(() => {
    if (authChecked && me && !me.user.is_guest) navigate(next || (me.active_patient_id ? "/app/overview" : "/app/patients"), { replace: true });
  }, [authChecked, me, navigate, next]);

  function switchMode(m: "signin" | "signup") {
    setErr(null);
    const p = new URLSearchParams(params);
    if (m === "signup") p.set("mode", "signup");
    else p.delete("mode");
    setParams(p, { replace: true });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (mode === "signup" && password.length < 8) return setErr("Password must be at least 8 characters.");
    setBusy("form");
    try {
      const m = mode === "signup" ? await signUp(name.trim(), email.trim(), password) : await signIn(email.trim(), password);
      navigate(next || (m.active_patient_id ? "/app/overview" : "/app/patients"), { replace: true });
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function demo() {
    setBusy("demo");
    if (await launchDemo()) navigate("/app/overview");
    setBusy(null);
  }

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-950 p-10 text-white lg:flex lg:flex-col">
        <div className="grain absolute inset-0" />
        <div className="absolute -left-32 bottom-0 h-[420px] w-[420px] rounded-full bg-teal-500/10 blur-3xl" />
        <Link to="/" className="relative">
          <Logo light />
        </Link>
        <div className="relative mt-auto max-w-md">
          <p className="font-display text-[34px] italic leading-tight text-white">
            “The hospital has a discharge plan. Does your family have a care plan?”
          </p>
          <ul className="mt-8 space-y-3 text-sm text-navy-200">
            {[
              "Keep a separate care plan, care team and schedule for each patient",
              "See every uncovered care task before it's missed",
              "Logistics only — Invisible Shift never changes clinical instructions",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[420px]">
          <Link to="/" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {mode === "signup" ? (isGuest ? "Save your work" : "Create your account") : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {mode === "signup"
              ? isGuest
                ? "You're using a temporary guest session. Create an account to keep your patients and plans."
                : "Set up care coordination for the people you look after."
              : "Sign in to see your patients and their care coverage."}
          </p>

          <div className="mt-6 grid grid-cols-2 rounded-xl border border-slate-200 bg-white p-1" role="tablist">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => switchMode(m)}
                className={cn("rounded-lg py-2 text-sm font-medium transition", mode === m ? "bg-navy-900 text-white" : "text-slate-600 hover:bg-slate-50")}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Your name</Label>
                <Input id="name" className="mt-1 h-10" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" className="mt-1 h-10" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  className="h-10 pr-10"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-ink" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {mode === "signup" && <p className="mt-1 text-[11px] text-slate-500">At least 8 characters.</p>}
            </div>
            {err && (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {err}
              </div>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={!!busy || !email || !password || (mode === "signup" && !name.trim())}>
              {busy === "form" ? <Loader2 className="animate-spin" /> : null}
              {mode === "signup" ? "Create account" : "Sign in"} <ArrowRight />
            </Button>
          </form>

          {!isGuest && (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
              </div>
              <Button variant="outline" size="lg" className="w-full" onClick={demo} disabled={!!busy}>
                {busy === "demo" ? <Loader2 className="animate-spin" /> : <Play />} Try the live demo — no account needed
              </Button>
            </>
          )}
          {isGuest && (
            <Button variant="ghost" className="mt-4 w-full" onClick={() => navigate(-1)}>
              Back to the demo
            </Button>
          )}

          <p className="mt-8 text-center text-[11px] leading-relaxed text-slate-500">
            Prototype — not HIPAA-compliant. Use fictional or de-identified information only.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
