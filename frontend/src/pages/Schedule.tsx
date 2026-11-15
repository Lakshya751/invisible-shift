import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Eye, EyeOff, List } from "lucide-react";
import { useApp } from "@/state/AppState";
import type { TaskStatus } from "@/lib/types";
import { planDates } from "@/lib/availability";
import { cn, DAY_NAMES, firstName, fmt12, fmtDate, STATUS_META } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { CalendarLegend, WeekCalendar } from "@/components/WeekCalendar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { StatusChip } from "@/components/StatusChip";
import { EmptyState } from "@/components/EmptyState";

const FILTERS: { key: string; label: string; statuses: TaskStatus[] }[] = [
  { key: "all", label: "All", statuses: ["covered", "tentative", "uncovered", "professional_review", "self_managed"] },
  { key: "covered", label: "Covered", statuses: ["covered"] },
  { key: "attention", label: "Tentative / review", statuses: ["tentative", "professional_review"] },
  { key: "uncovered", label: "Uncovered", statuses: ["uncovered"] },
];

export default function Schedule() {
  const { data, assignmentById, openTask } = useApp();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "all";
  const [cgFilter, setCgFilter] = useState<string>("");
  const [showAvail, setShowAvail] = useState(true);
  const [view, setView] = useState<"calendar" | "list">(typeof window !== "undefined" && window.innerWidth < 768 ? "list" : "calendar");

  const visible = useMemo(() => new Set(FILTERS.find((f) => f.key === filter)?.statuses ?? FILTERS[0].statuses), [filter]);
  if (!data) return null;
  const ws = data.workspace;
  const dates = planDates(ws);
  const counts = (st: TaskStatus[]) => data.schedule.assignments.filter((a) => st.includes(a.status)).length;

  return (
    <>
      <PageHeader
        eyebrow="Care schedule"
        title="Weekly care schedule"
        description="Every task placed at its required time. Click any task to see who was considered, why it was (or wasn't) assigned, and the original instruction."
      />
      {ws.tasks.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No tasks to schedule" body="Confirm a discharge plan first." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setParams(f.key === "all" ? {} : { filter: f.key })}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                    filter === f.key ? (f.key === "uncovered" ? "bg-gap text-white" : "bg-navy-900 text-white") : "text-slate-600 hover:bg-slate-100",
                  )}
                  aria-pressed={filter === f.key}
                >
                  {f.label} <span className="ml-1 tabular-nums opacity-70">{counts(f.statuses)}</span>
                </button>
              ))}
            </div>
            <Select value={cgFilter} onChange={(e) => setCgFilter(e.target.value)} className="w-auto min-w-[170px]" aria-label="Filter by caregiver">
              <option value="">All caregivers</option>
              {ws.caregivers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
            <div className="ml-auto flex gap-1">
              {view === "calendar" && (
                <Button variant="ghost" size="sm" onClick={() => setShowAvail((v) => !v)}>
                  {showAvail ? <EyeOff /> : <Eye />} Availability
                </Button>
              )}
              <Button variant={view === "calendar" ? "subtle" : "ghost"} size="sm" onClick={() => setView("calendar")} aria-pressed={view === "calendar"}>
                <CalendarDays /> Calendar
              </Button>
              <Button variant={view === "list" ? "subtle" : "ghost"} size="sm" onClick={() => setView("list")} aria-pressed={view === "list"}>
                <List /> List
              </Button>
            </div>
          </div>

          {view === "calendar" ? (
            <>
              <WeekCalendar
                tasks={ws.tasks}
                assignments={assignmentById}
                caregivers={ws.caregivers}
                dates={dates}
                onSelect={openTask}
                visibleStatuses={visible}
                caregiverFilter={cgFilter || null}
                showAvailability={showAvail}
              />
              <div className="mt-3">
                <CalendarLegend caregivers={ws.caregivers} />
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {dates.map((d) => {
                const items = ws.tasks
                  .filter((t) => t.date === d)
                  .map((t) => ({ t, a: assignmentById[t.task_id] }))
                  .filter(({ a }) => a && visible.has(a.status) && (!cgFilter || a.caregiver_id === cgFilter));
                if (!items.length) return null;
                const wd = (new Date(d + "T12:00:00").getDay() + 6) % 7;
                return (
                  <Card key={d} className="overflow-hidden">
                    <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-sm font-semibold text-ink">
                      {DAY_NAMES[wd]} <span className="font-normal text-slate-500">· {fmtDate(d, { month: "long", day: "numeric" })}</span>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {items.map(({ t, a }) => (
                        <li key={t.task_id}>
                          <button onClick={() => openTask(t.task_id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                            <span className={cn("h-8 w-1 rounded-full", STATUS_META[a.status].dot)} />
                            <span className="w-16 shrink-0 text-sm font-semibold tabular-nums text-ink">{fmt12(a.start_time || t.scheduled_time)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
                              <span className="block truncate text-xs text-slate-500">{a.caregiver_name ? firstName(a.caregiver_name) : a.explanation}</span>
                            </span>
                            <StatusChip status={a.status} className="hidden sm:inline-flex" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
