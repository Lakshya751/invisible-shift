import { cn, STATUS_META } from "@/lib/utils";
import type { TaskStatus } from "@/lib/types";

export function StatusChip({ status, className }: { status: TaskStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", m.chip, className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}
