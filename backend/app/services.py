"""Higher-level operations shared by the API and tests."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Dict, List

from .gaps import TYPE_LABEL, detect_gaps
from .models import Caregiver, Gap, ScenarioResult, ScheduleResult, TaskChange, Workspace
from .scheduler import generate_schedule
from .timeutil import DAY_NAMES, fmt12

DISCLAIMER = (
    "Invisible Shift is a logistical decision-support prototype. It does not provide medical advice, does not "
    "establish medical readiness for discharge, and does not assess clinical risk. Coverage figures describe "
    "caregiver availability only. All care instructions must be confirmed with the treating clinical team. "
    "This prototype is not certified and is not HIPAA-compliant; do not enter real patient information."
)


def schedule_for(ws: Workspace) -> ScheduleResult:
    return generate_schedule(ws.tasks, ws.caregivers, ws.pins)


def full_state(ws: Workspace) -> Dict:
    sched = schedule_for(ws)
    gaps = detect_gaps(ws, sched)
    return {"workspace": ws.model_dump(), "schedule": sched.model_dump(), "gaps": [g.model_dump() for g in gaps]}


def simulate(ws: Workspace, scenario_caregivers: List[Caregiver]) -> ScenarioResult:
    """Run the scheduler on an isolated copy. The workspace is NOT modified."""
    before = schedule_for(ws)
    ids = {c.id for c in scenario_caregivers}
    pins = {k: v for k, v in ws.pins.items() if v in ids}
    after = generate_schedule(ws.tasks, scenario_caregivers, pins)
    tasks = {t.task_id: t for t in ws.tasks}
    good = {"covered", "tentative"}
    rank = {"covered": 3, "tentative": 2, "professional_review": 1, "self_managed": 1, "uncovered": 0}
    changes: List[TaskChange] = []
    b_map = {a.task_id: a for a in before.assignments}
    for a in after.assignments:
        b = b_map[a.task_id]
        if b.status == a.status and b.caregiver_id == a.caregiver_id:
            continue
        if rank[a.status] > rank[b.status] and a.status in good:
            kind = "resolved"
        elif rank[a.status] < rank[b.status]:
            kind = "regressed"
        elif b.caregiver_id != a.caregiver_id and b.status == a.status:
            kind = "reassigned"
        else:
            kind = "changed"
        t = tasks[a.task_id]
        changes.append(
            TaskChange(
                task_id=t.task_id,
                title=t.title,
                date=t.date,
                weekday=t.weekday,
                time=t.scheduled_time,
                before_status=b.status,
                after_status=a.status,
                before_caregiver=b.caregiver_name,
                after_caregiver=a.caregiver_name,
                after_explanation=a.explanation,
                kind=kind,  # type: ignore[arg-type]
            )
        )
    return ScenarioResult(
        before=before,
        after=after,
        changes=changes,
        resolved=sum(1 for c in changes if c.kind == "resolved"),
        regressed=sum(1 for c in changes if c.kind == "regressed"),
    )


def build_report(ws: Workspace) -> Dict:
    sched = schedule_for(ws)
    gaps = detect_gaps(ws, sched)
    tasks = {t.task_id: t for t in ws.tasks}
    start = date.fromisoformat(ws.plan.start_date)
    end = start + timedelta(days=ws.plan.days - 1)

    uncovered = []
    for g in gaps:
        if g.task_id and g.type != "needs_confirmation":
            uncovered.append(
                {
                    "date": g.date,
                    "day": g.day_label,
                    "time": g.time_label,
                    "task": g.title,
                    "gap_type": TYPE_LABEL[g.type],
                    "reason": g.reason,
                    "details": g.details,
                    "action": g.suggested_action,
                    "status": g.status,
                }
            )
    uncovered.sort(key=lambda u: (u["date"] or "", u["time"] or ""))

    # Recurring-pattern coordination actions
    patterns: Dict[tuple, List[str]] = defaultdict(list)
    for a in sched.assignments:
        if a.status == "uncovered":
            t = tasks[a.task_id]
            patterns[(t.title, t.scheduled_time, a.gap_type)].append(DAY_NAMES[t.weekday][:3])
    actions = []
    for (title, time, gtype), days in sorted(patterns.items(), key=lambda kv: -len(kv[1])):
        when = fmt12(time) if time else "flexible time"
        actions.append(
            f"Find an eligible helper for {title.lower()} at {when} on {', '.join(days)} "
            f"({len(days)} task{'s' if len(days) != 1 else ''}, {TYPE_LABEL.get(gtype or '', 'gap').lower()})."
        )
    if any(a.status == "tentative" for a in sched.assignments):
        actions.append("Confirm all tentative assignments directly with the caregivers involved.")

    questions: List[str] = []
    seen = set()
    for a in sched.assignments:
        t = tasks[a.task_id]
        if a.status == "professional_review" and t.template_id not in seen:
            seen.add(t.template_id)
            questions.append(
                f"Who will provide “{t.title}”? This requires a confirmed home-health or clinical provider"
                + (" (eligibility is currently unclear)." if t.eligibility == "unknown" else ".")
            )
    timing_seen = set()
    for a in sched.assignments:
        t = tasks[a.task_id]
        if a.status == "uncovered" and t.scheduled_time and t.template_id not in timing_seen:
            timing_seen.add(t.template_id)
            questions.append(
                f"Is there any clinically acceptable flexibility in the timing of “{t.title}” (currently {fmt12(t.scheduled_time)})? "
                "The family will not change timing without clinician approval."
            )
    for tpl in ws.plan.templates:
        if tpl.needs_review and not tpl.confirmed:
            questions.append(f"Please verify the instruction “{tpl.source_text[:140]}” — it was flagged during extraction review.")
    for g in gaps:
        if g.status == "flagged_for_care_team":
            questions.append(f"Flagged by family: {g.headline}.")

    return {
        "title": "Invisible Shift — Home Care Coverage Assessment",
        "generated_at": datetime.now().isoformat(timespec="minutes"),
        "patient": ws.patient.model_dump(),
        "is_demo": ws.is_demo,
        "plan": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "days": ws.plan.days,
            "source": ws.plan.source_name or ws.plan.source,
            "extraction_mode": ws.plan.extraction_mode,
            "instructions": len(ws.plan.templates),
        },
        "summary": sched.summary.model_dump(),
        "workload": [w.model_dump() for w in sched.workload],
        "caregivers": [
            {"name": c.name, "relationship": c.relationship, "consent": c.consent, "active": c.active, "capabilities": c.capabilities}
            for c in ws.caregivers
        ],
        "uncovered": uncovered,
        "coordination_actions": actions,
        "clinician_questions": questions,
        "disclaimer": DISCLAIMER,
    }


def gaps_for(ws: Workspace) -> List[Gap]:
    return detect_gaps(ws, schedule_for(ws))


__all__ = ["schedule_for", "full_state", "simulate", "build_report", "gaps_for", "DISCLAIMER"]

