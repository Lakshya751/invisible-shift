from __future__ import annotations

from datetime import date, timedelta
from typing import List, Tuple

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def to_min(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def from_min(m: int) -> str:
    m = max(0, min(m, 24 * 60))
    return f"{m // 60:02d}:{m % 60:02d}"


def fmt12(t: str) -> str:
    """'08:00' -> '8:00 AM'"""
    m = to_min(t)
    h, mi = divmod(m, 60)
    suffix = "AM" if h < 12 or h == 24 else "PM"
    h12 = h % 12 or 12
    return f"{h12}:{mi:02d} {suffix}"


def fmt_range(start: str, end: str) -> str:
    a, b = fmt12(start), fmt12(end)
    if a[-2:] == b[-2:]:
        return f"{a[:-3]}–{b}"
    return f"{a}–{b}"


def overlaps(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end


def plan_dates(start: str, days: int) -> List[date]:
    d0 = date.fromisoformat(start)
    return [d0 + timedelta(days=i) for i in range(days)]


def merge_intervals(items: List[Tuple[int, int, bool]]) -> List[Tuple[int, int, bool]]:
    """Merge touching/overlapping (start, end, tentative) intervals. A merged
    interval is tentative if any portion is tentative."""
    if not items:
        return []
    items = sorted(items)
    out = [list(items[0])]
    for s, e, t in items[1:]:
        last = out[-1]
        if s <= last[1]:
            last[1] = max(last[1], e)
            last[2] = last[2] or t
        else:
            out.append([s, e, t])
    return [(a, b, c) for a, b, c in out]


def subtract(intervals: List[Tuple[int, int, bool]], cut: List[Tuple[int, int]]) -> List[Tuple[int, int, bool]]:
    result = intervals
    for cs, ce in cut:
        nxt = []
        for s, e, t in result:
            if ce <= s or cs >= e:
                nxt.append((s, e, t))
                continue
            if s < cs:
                nxt.append((s, cs, t))
            if ce < e:
                nxt.append((ce, e, t))
        result = nxt
    return result


def time_of_day(t: str) -> str:
    m = to_min(t)
    if m < 11 * 60:
        return "morning"
    if m < 14 * 60:
        return "midday"
    if m < 18 * 60:
        return "afternoon"
    return "evening"
