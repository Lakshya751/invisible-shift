import { motion } from "framer-motion";
import { useMemo } from "react";
import type { Assignment, CareTask, Caregiver, TaskStatus } from "@/lib/types";
import { cn, DAY_SHORT, firstName, fmt12, fmtDate, STATUS_META, toMin } from "@/lib/utils";
import { availabilityWindows } from "@/lib/availability";

const HOUR_PX = 46;
const MIN_BLOCK = 34;

export interface WeekCalendarProps {
  tasks: CareTask[];
  assignments: Record<string, Assignment>;
  caregivers: Caregiver[];
  dates: string[];
  onSelect?: (taskId: string) => void;
  highlight?: Set<string>;
  visibleStatuses?: Set<TaskStatus>;
  caregiverFilter?: string | null;
  showAvailability?: boolean;
  className?: string;
}

export function WeekCalendar({
  tasks,
  assignments,
  caregivers,
  dates,
  onSelect,
  highlight,
  visibleStatuses,
  caregiverFilter,
  showAvailability = true,
  className,
}: WeekCalendarProps) {
  const [startH, endH] = useMemo(() => {
    let lo = 7 * 60;
    let hi = 21 * 60;
    for (const t of tasks) {
      if (!t.scheduled_time) continue;
      const s = toMin(t.scheduled_time);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s + t.estimated_duration_minutes + 30);
    }
    return [Math.floor(lo / 60), Math.min(24, Math.ceil(hi / 60))];
  }, [tasks]);
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const height = hours.length * HOUR_PX;
  const activeCgs = caregivers.filter((c) => c.active);
  const flexible = tasks.filter((t) => !t.scheduled_time && !assignments[t.task_id]?.start_time);

  return (
    <div className={cn("overflow-x-auto rounded-2xl border border-slate-200 bg-white", className)}>
      <div className="min-w-[760px]">
        {/* header */}
        <div className="sticky top-0 z-10 grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200 bg-white/95 backdrop-blur">
          <div />
          {dates.map((d) => (
            <div key={d} className="border-l border-slate-100 px-2 py-2.5 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{DAY_SHORT[(new Date(d + "T12:00:00").getDay() + 6) % 7]}</div>
              <div className="text-sm font-semibold text-ink">{fmtDate(d, { month: "short", day: "numeric" })}</div>
            </div>
          ))}
        </div>
        <div className="relative grid grid-cols-[56px_repeat(7,1fr)]" style={{ height }}>
          {/* time gutter */}
          <div className="relative">
            {hours.map((h, i) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10.5px] tabular-nums text-slate-400" style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : fmt12(`${String(h).padStart(2, "0")}:00`).replace(":00", "")}
              </div>
            ))}
          </div>
          {dates.map((d) => {
            const weekday = (new Date(d + "T12:00:00").getDay() + 6) % 7;
            const dayTasks = tasks.filter((t) => t.date === d);
            return (
              <div key={d} className="relative border-l border-slate-100">
                {hours.map((_, i) => (
                  <div key={i} className="absolute inset-x-0 border-t border-slate-100" style={{ top: i * HOUR_PX }} />
                ))}
                {/* availability lanes */}
                {showAvailability &&
                  activeCgs.map((cg, li) =>
                    availabilityWindows(cg, weekday).map(([s, e, tentative], k) => {
                      const top = ((s - startH * 60) / 60) * HOUR_PX;
                      const h = ((e - s) / 60) * HOUR_PX;
                      if (top + h < 0 || top > height) return null;
                      return (
                        <div
                          key={`${cg.id}-${k}`}
                          title={`${cg.name} available${tentative ? " (possibly)" : ""}`}
                          className="absolute rounded-full"
                          style={{
                            top: Math.max(0, top),
                            height: h,
                            left: 3 + li * 5,
                            width: 3,
                            background: cg.color,
                            opacity: tentative ? 0.35 : 0.7,
                          }}
                        />
                      );
                    }),
                  )}
                {dayTasks.map((t) => {
                  const a = assignments[t.task_id];
                  if (!a) return null;
                  const start = a.start_time || t.scheduled_time;
                  if (!start) return null;
                  const dim =
                    (visibleStatuses && !visibleStatuses.has(a.status)) || (caregiverFilter && a.caregiver_id !== caregiverFilter);
                  const top = ((toMin(start) - startH * 60) / 60) * HOUR_PX;
                  const h = Math.max(MIN_BLOCK, (t.estimated_duration_minutes / 60) * HOUR_PX);
                  const isHi = highlight?.has(t.task_id);
                  const cg = caregivers.find((c) => c.id === a.caregiver_id);
                  return (
                    <motion.button
                      layout
                      key={t.task_id}
                      onClick={() => onSelect?.(t.task_id)}
                      initial={false}
                      animate={{ opacity: dim ? 0.25 : 1 }}
                      className={cn(
                        "absolute left-[22px] right-1.5 overflow-hidden rounded-lg border px-2 py-1 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500",
                        STATUS_META[a.status].block,
                        isHi && "z-10 animate-pulsering ring-2 ring-covered",
                      )}
                      style={{ top, height: h }}
                      aria-label={`${t.title}, ${fmt12(start)}, ${STATUS_META[a.status].label}${a.caregiver_name ? `, ${a.caregiver_name}` : ""}`}
                    >
                      <div className="flex items-center gap-1 text-[11px] font-semibold leading-tight">
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_META[a.status].dot)} />
                        <span className="truncate">{t.title}</span>
                      </div>
                      <div className="truncate text-[10.5px] leading-tight opacity-80">
                        {fmt12(start)} ·{" "}
                        {a.caregiver_name ? (
                          <span className="inline-flex items-center gap-1 font-medium">
                            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: cg?.color }} />
                            {firstName(a.caregiver_name)}
                          </span>
                        ) : a.status === "uncovered" ? (
                          "No one"
                        ) : (
                          STATUS_META[a.status].label
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            );
          })}
        </div>
        {flexible.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
            <span className="font-semibold">Flexible / unscheduled: </span>
            {flexible.map((t) => (
              <button key={t.task_id} onClick={() => onSelect?.(t.task_id)} className="mr-2 underline decoration-dotted">
                {t.title} ({fmtDate(t.date)})
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CalendarLegend({ caregivers }: { caregivers: Caregiver[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      {(["covered", "tentative", "uncovered"] as TaskStatus[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-sm", STATUS_META[s].dot)} /> {STATUS_META[s].label}
        </span>
      ))}
      <span className="mx-1 hidden h-3 w-px bg-slate-300 sm:inline-block" />
      {caregivers
        .filter((c) => c.active)
        .map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-1 rounded-full" style={{ background: c.color }} /> {firstName(c.name)}'s availability
          </span>
        ))}
    </div>
  );
}
