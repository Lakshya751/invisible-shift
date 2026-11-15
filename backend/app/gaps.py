"""Care Gap Detection Engine.

Turns scheduler output into actionable, nonclinical coverage gaps. Urgency here
is *scheduling* urgency (how soon the gap occurs) — never clinical risk.
"""
from __future__ import annotations

from datetime import date
from typing import Dict, List, Optional

from .models import Caregiver, CareTask, Gap, ScheduleResult, Workspace
from .scheduler import availability_windows
from .timeutil import DAY_NAMES, fmt12, fmt_range, overlaps, to_min

CLINICAL_NOTE = (
    "Scheduling urgency only — reflects how soon this gap occurs, not clinical risk. "
    "Contact the care team with any clinical concerns."
)

TYPE_LABEL = {
    "availability": "Availability gap",
    "scheduling_conflict": "Scheduling conflict",
    "capability": "Capability gap",
    "transportation": "Transportation gap",
    "workload": "Workload gap",
    "professional": "Professional care gap",
    "needs_confirmation": "Needs confirmation",
}


def _urgency(task_date: str, plan_start: str, today: Optional[date] = None) -> str:
    today = today or date.today()
    start = date.fromisoformat(plan_start)
    ref = today if (start.toordinal() - 7) <= today.toordinal() <= start.toordinal() + 7 else start
    delta = (date.fromisoformat(task_date) - ref).days
    if delta <= 1:
        return "high"
    if delta <= 3:
        return "medium"
    return "low"


def _action(gap_type: str, task: CareTask, sched_names: List[str], when: str) -> str:
    names = ", ".join(sched_names)
    if gap_type == "availability":
        return (
            f"Ask another eligible caregiver{(' (' + names + ')') if names else ''} whether they can assist {when}, "
            "arrange a trusted helper, or flag this task for the care team."
        )
    if gap_type == "scheduling_conflict":
        return f"Ask {names or 'the caregiver'} whether the conflicting obligation can move, or ask another eligible caregiver to cover {when}."
    if gap_type == "capability":
        return "Ask the care team whether a family member can be shown how to help with this task, or arrange an approved helper."
    if gap_type == "transportation":
        return "Arrange a ride (family, friend, community or medical transport) and confirm it before the appointment."
    if gap_type == "workload":
        return f"Redistribute tasks, or ask {names or 'the caregiver'} whether they can raise their weekly limit."
    if gap_type == "professional":
        return "Confirm a home-health or clinical provider with the discharge team. Do not assign this to family caregivers."
    return "Confirm with the caregiver before relying on this assignment."


def detect_gaps(ws: Workspace, schedule: ScheduleResult, today: Optional[date] = None) -> List[Gap]:
    tasks: Dict[str, CareTask] = {t.task_id: t for t in ws.tasks}
    cgs: Dict[str, Caregiver] = {c.id: c for c in ws.caregivers}
    gaps: List[Gap] = []

    for a in schedule.assignments:
        t = tasks[a.task_id]
        day = DAY_NAMES[t.weekday]
        time_label = fmt12(t.scheduled_time) if t.scheduled_time else "Flexible time"
        when = f"at {fmt12(t.scheduled_time)} on {day}" if t.scheduled_time else f"on {day}"
        urgency = _urgency(t.date, ws.plan.start_date, today)

        if a.status == "uncovered" and a.gap_type:
            relevant = [e for e in a.candidates if e.code not in ("inactive", "declined")]
            capable = [e for e in relevant if e.code not in ("capability", "physical", "transport")]
            details = [e.reason for e in relevant]
            names = [e.caregiver_name.split(" ")[0] for e in (capable or relevant)]
            if a.gap_type == "workload":
                names = [e.caregiver_name.split(" ")[0] for e in capable if e.code == "workload"]
            if a.gap_type == "scheduling_conflict":
                names = [e.caregiver_name.split(" ")[0] for e in capable if e.code in ("overlap", "commitment")]
            gid = f"{a.gap_type}:{t.task_id}"
            gaps.append(
                Gap(
                    gap_id=gid,
                    type=a.gap_type,
                    task_id=t.task_id,
                    template_id=t.template_id,
                    title=t.title,
                    date=t.date,
                    day_label=day,
                    time_label=time_label,
                    headline=f"{day}, {time_label} — {t.title} is uncovered",
                    reason=a.explanation,
                    details=details,
                    suggested_action=_action(a.gap_type, t, names, when),
                    scheduling_urgency=urgency,  # type: ignore[arg-type]
                    clinical_note=CLINICAL_NOTE,
                    status=ws.gap_status.get(gid, "open"),
                )
            )
        elif a.status == "professional_review":
            gid = f"professional:{t.task_id}"
            gaps.append(
                Gap(
                    gap_id=gid,
                    type="professional",
                    task_id=t.task_id,
                    template_id=t.template_id,
                    title=t.title,
                    date=t.date,
                    day_label=day,
                    time_label=time_label,
                    headline=f"{day}, {time_label} — {t.title} needs a professional provider",
                    reason=a.explanation,
                    suggested_action=_action("professional", t, [], when),
                    scheduling_urgency=urgency,  # type: ignore[arg-type]
                    clinical_note=CLINICAL_NOTE,
                    status=ws.gap_status.get(gid, "open"),
                )
            )
        elif a.status == "tentative":
            gid = f"needs_confirmation:{t.task_id}"
            first = (a.caregiver_name or "").split(" ")[0]
            gaps.append(
                Gap(
                    gap_id=gid,
                    type="needs_confirmation",
                    task_id=t.task_id,
                    template_id=t.template_id,
                    caregiver_id=a.caregiver_id,
                    title=t.title,
                    date=t.date,
                    day_label=day,
                    time_label=time_label,
                    headline=f"{day}, {time_label} — {t.title} is only tentatively covered",
                    reason=a.explanation,
                    suggested_action=f"Confirm with {first} that they can reliably help {when}.",
                    scheduling_urgency=urgency,  # type: ignore[arg-type]
                    clinical_note=CLINICAL_NOTE,
                    status=ws.gap_status.get(gid, "open"),
                )
            )

    # Caregiver-level workload warnings (≥ 90 % of stated capacity).
    for w in schedule.workload:
        if w.max_minutes and w.utilization_percent >= 90:
            gid = f"workload:{w.caregiver_id}"
            first = w.name.split(" ")[0]
            gaps.append(
                Gap(
                    gap_id=gid,
                    type="workload",
                    caregiver_id=w.caregiver_id,
                    title=f"{w.name} is near capacity",
                    headline=f"{w.name} is at {w.utilization_percent:g}% of their weekly limit",
                    reason=f"{first} has {w.minutes} of {w.max_minutes} minutes assigned this week.",
                    suggested_action=f"Check in with {first} about sustainability, or share tasks with another caregiver.",
                    scheduling_urgency="medium",
                    clinical_note=CLINICAL_NOTE,
                    status=ws.gap_status.get(gid, "open"),
                )
            )

    # Data conflicts: a commitment overlapping a block marked available.
    for cg in ws.caregivers:
        if not cg.active:
            continue
        for c in cg.commitments:
            for s, e, _t in availability_windows(cg, c.weekday):
                if overlaps(s, e, to_min(c.start), to_min(c.end)):
                    gid = f"scheduling_conflict:{cg.id}:{c.id}"
                    first = cg.name.split(" ")[0]
                    gaps.append(
                        Gap(
                            gap_id=gid,
                            type="scheduling_conflict",
                            caregiver_id=cg.id,
                            title=f"{first}'s calendar conflict",
                            day_label=DAY_NAMES[c.weekday],
                            time_label=fmt_range(c.start, c.end),
                            headline=f"{DAY_NAMES[c.weekday]} — {first} is marked available during '{c.label}'",
                            reason=(
                                f"{first}'s availability overlaps their commitment '{c.label}' "
                                f"({fmt_range(c.start, c.end)}). The scheduler will not assign tasks during the overlap."
                            ),
                            suggested_action=f"Ask {first} to update either their availability or the commitment.",
                            scheduling_urgency="low",
                            clinical_note=CLINICAL_NOTE,
                            status=ws.gap_status.get(gid, "open"),
                        )
                    )
                    break

    order = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda g: (g.status == "resolved", order[g.scheduling_urgency], g.date or "9999", g.time_label or ""))
    return gaps


__all__ = ["detect_gaps", "TYPE_LABEL", "CLINICAL_NOTE"]
