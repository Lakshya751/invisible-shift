import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#111c33" />
      <path d="M7 20c3-8 6-8 9 0s6 8 9 0" fill="none" stroke="#2dd4bf" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="16" cy="9" r="2.3" fill="#2dd4bf" />
    </svg>
  );
}

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <div className={cn("text-[15px] font-semibold tracking-tight", light ? "text-white" : "text-ink")}>Invisible Shift</div>
        <div className={cn("mt-1 text-[10.5px] tracking-wide", light ? "text-navy-300" : "text-slate-500")}>Care coverage, made visible</div>
      </div>
    </div>
  );
}
