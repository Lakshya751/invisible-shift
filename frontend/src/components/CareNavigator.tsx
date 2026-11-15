import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, Send, X } from "lucide-react";
import { useApp } from "@/state/AppState";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";

interface Msg {
  role: "user" | "assistant";
  content: string;
  mode?: string;
}

const SUGGESTIONS = ["Why are tasks uncovered?", "What would help the most?", "Can we move the medication time?", "Who has the most work?", "What happens on Wednesday?"];

export function CareNavigator() {
  const { navigatorOpen: open, setNavigatorOpen: setOpen, data } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const history = msgs.map(({ role, content }) => ({ role, content }));
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await api.chat(q, history);
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, mode: r.mode }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `I couldn't reach the server: ${(e as Error).message}`, mode: "error" }]);
    } finally {
      setBusy(false);
    }
  }

  const s = data?.schedule.summary;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.aside
            role="dialog"
            aria-label="Care Navigator"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="no-print fixed bottom-4 right-4 z-50 flex h-[min(620px,calc(100vh-32px))] w-[calc(100vw-32px)] max-w-[420px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lift"
          >
            <div className="flex items-center gap-3 bg-navy-900 px-4 py-3 text-white">
              <div className="rounded-lg bg-teal-500/20 p-1.5"><Bot className="h-4 w-4 text-teal-300" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Care Navigator</div>
                <div className="text-[11px] text-navy-300">Explains logistics from your live schedule · no medical advice</div>
              </div>
              <button onClick={() => setOpen(false)} className="rounded-md p-1 text-navy-300 hover:bg-white/10 hover:text-white" aria-label="Close Care Navigator">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-canvas/60 px-4 py-4" aria-live="polite">
              {msgs.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-sm text-slate-700">
                  Hi — I can explain why tasks are uncovered and what coordination steps might help.
                  {s && (
                    <span className="mt-1 block text-slate-500">
                      Right now {s.covered} of {s.total} tasks are covered ({s.coverage_percent}%).
                    </span>
                  )}
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                      m.role === "user" ? "rounded-br-md bg-navy-900 text-white" : "rounded-bl-md border border-slate-200 bg-white text-ink",
                    )}
                  >
                    {m.content}
                    {m.mode && m.role === "assistant" && (
                      <div className="mt-1.5">
                        <Badge tone={m.mode.startsWith("ai") ? "teal" : "neutral"} className="text-[10px]">
                          {m.mode.startsWith("ai") ? `AI phrasing · ${m.mode.slice(3)}` : m.mode === "error" ? "Error" : "Deterministic explanation"}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking the schedule…
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="border-t border-slate-200 bg-white p-3">
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                {SUGGESTIONS.map((q) => (
                  <button key={q} onClick={() => send(q)} className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] text-slate-700 hover:border-teal-400 hover:bg-teal-50">
                    {q}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send(input);
                }}
                className="flex gap-2"
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about coverage…"
                  aria-label="Message Care Navigator"
                  className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
                <button type="submit" disabled={busy || !input.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40" aria-label="Send">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
