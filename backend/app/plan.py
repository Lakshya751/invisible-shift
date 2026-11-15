"""Expand confirmed discharge-plan templates into dated task instances."""
from __future__ import annotations

from typing import List

from .models import CareTask, ExtractedTask
from .timeutil import plan_dates


def template_days(t: ExtractedTask, start: str, days: int) -> List[str]:
    dates = plan_dates(start, days)
    freq = t.frequency
    if freq == "as_needed":
        return []
    if freq == "once":
        if t.date:
            return [t.date] if any(d.isoformat() == t.date for d in dates) else []
        if t.days_of_week:
            return [d.isoformat() for d in dates if d.weekday() in t.days_of_week][:1]
        return []
    if freq == "weekdays":
        return [d.isoformat() for d in dates if d.weekday() < 5]
    if freq == "weekends":
        return [d.isoformat() for d in dates if d.weekday() >= 5]
    if freq == "specific_days":
        return [d.isoformat() for d in dates if d.weekday() in t.days_of_week]
    # daily (default when unspecified but confirmed)
    return [d.isoformat() for d in dates]


def expand_templates(templates: List[ExtractedTask], start: str, days: int = 7) -> List[CareTask]:
    out: List[CareTask] = []
    for t in templates:
        for iso in template_days(t, start, days):
            from datetime import date as _d

            wd = _d.fromisoformat(iso).weekday()
            out.append(
                CareTask(
                    task_id=f"{t.task_id}-{iso}",
                    template_id=t.task_id,
                    title=t.title,
                    category=t.category,
                    date=iso,
                    weekday=wd,
                    scheduled_time=t.scheduled_time,
                    estimated_duration_minutes=t.estimated_duration_minutes or 30,
                    caregiver_required=t.caregiver_required,
                    professional_required=t.professional_required,
                    eligibility=t.eligibility,
                    requires_transport=t.requires_transport,
                    requires_physical_assist=t.requires_physical_assist,
                    source_text=t.source_text,
                    source_page=t.source_page,
                )
            )
    out.sort(key=lambda x: (x.date, x.scheduled_time or "99:99", x.task_id))
    return out
