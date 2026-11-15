import type { Caregiver, Workspace } from "./types";
import { toMin } from "./utils";

/** Mirror of the backend's availability_windows (display only — the backend is the source of truth). */
export function availabilityWindows(cg: Caregiver, weekday: number): [number, number, boolean][] {
  const pos = cg.availability
    .filter((b) => b.weekday === weekday && b.status !== "unavailable")
    .map((b) => [toMin(b.start), toMin(b.end), b.status === "possible"] as [number, number, boolean]);
  const neg = cg.availability.filter((b) => b.weekday === weekday && b.status === "unavailable").map((b) => [toMin(b.start), toMin(b.end)]);
  let res = merge(pos);
  for (const [cs, ce] of neg) {
    const nxt: [number, number, boolean][] = [];
    for (const [s, e, t] of res) {
      if (ce <= s || cs >= e) nxt.push([s, e, t]);
      else {
        if (s < cs) nxt.push([s, cs, t]);
        if (ce < e) nxt.push([ce, e, t]);
      }
    }
    res = nxt;
  }
  return merge(res);
}

function merge(items: [number, number, boolean][]): [number, number, boolean][] {
  const s = [...items].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number, boolean][] = [];
  for (const it of s) {
    const last = out[out.length - 1];
    if (last && it[0] <= last[1]) {
      last[1] = Math.max(last[1], it[1]);
      last[2] = last[2] || it[2];
    } else out.push([...it]);
  }
  return out;
}

export function planDates(ws: Workspace): string[] {
  const [y, m, d] = ws.plan.start_date.split("-").map(Number);
  return Array.from({ length: ws.plan.days }, (_, i) => {
    const dt = new Date(y, m - 1, d + i);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  });
}
