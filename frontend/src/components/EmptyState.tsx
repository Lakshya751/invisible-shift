import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <div className="mb-3 rounded-xl bg-slate-100 p-3 text-slate-500"><Icon className="h-6 w-6" /></div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
