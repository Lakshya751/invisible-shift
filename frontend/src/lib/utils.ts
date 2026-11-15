import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Category, GapType, TaskStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function fmt12(t: string | null | undefined): string {
  if (!t) return "Flexible";
  const m = toMin(t);
  const h = Math.floor(m / 60);
  const mi = m % 60;
  const suf = h < 12 || h === 24 ? "AM" : "PM";
  return `${h % 12 || 12}:${String(mi).padStart(2, "0")} ${suf}`;
}

export function fmtRange(a: string, b: string) {
  const x = fmt12(a);
  const y = fmt12(b);
  return x.slice(-2) === y.slice(-2) ? `${x.slice(0, -3)}–${y}` : `${x}–${y}`;
}

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", opts);
}

export const CATEGORY_LABEL: Record<Category, string> = {
  medication: "Medication",
  meals: "Meals & nutrition",
  mobility: "Mobility",
  personal_care: "Personal care",
  monitoring: "Monitoring",
  transportation: "Transportation",
  appointment: "Follow-up appointment",
  wound_care: "Wound-care-related",
  other: "Other",
};
export const CATEGORIES = Object.keys(CATEGORY_LABEL) as Category[];

export const STATUS_META: Record<TaskStatus, { label: string; dot: string; chip: string; block: string }> = {
  covered: {
    label: "Covered",
    dot: "bg-covered",
    chip: "bg-covered-soft text-covered-ink ring-covered/20",
    block: "bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100",
  },
  tentative: {
    label: "Tentative",
    dot: "bg-warn",
    chip: "bg-warn-soft text-warn-ink ring-warn/20",
    block: "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100",
  },
  uncovered: {
    label: "Uncovered",
    dot: "bg-gap",
    chip: "bg-gap-soft text-gap-ink ring-gap/20",
    block: "bg-red-50 border-red-300 text-red-900 hover:bg-red-100",
  },
  professional_review: {
    label: "Professional review",
    dot: "bg-warn",
    chip: "bg-warn-soft text-warn-ink ring-warn/20",
    block: "bg-amber-50 border-amber-300 text-amber-900 border-dashed hover:bg-amber-100",
  },
  self_managed: {
    label: "Self-managed",
    dot: "bg-slate-400",
    chip: "bg-slate-100 text-slate-700 ring-slate-300/40",
    block: "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100",
  },
};

export const GAP_META: Record<GapType, { label: string; tone: "red" | "amber" }> = {
  availability: { label: "Availability gap", tone: "red" },
  scheduling_conflict: { label: "Scheduling conflict", tone: "red" },
  capability: { label: "Capability gap", tone: "red" },
  transportation: { label: "Transportation gap", tone: "red" },
  workload: { label: "Workload gap", tone: "amber" },
  professional: { label: "Professional care gap", tone: "amber" },
  needs_confirmation: { label: "Needs confirmation", tone: "amber" },
};

export const uid = (p = "id") => `${p}-${Math.random().toString(36).slice(2, 9)}`;

export const firstName = (n: string | null | undefined) => (n || "").split(" ")[0];
