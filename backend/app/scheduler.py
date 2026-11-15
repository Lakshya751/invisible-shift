"""Deterministic care-scheduling engine.

The scheduler never asks an LLM anything. It matches every dated care task to
an *eligible* family caregiver using explicit constraints:

  1. The caregiver has explicitly declared availability covering the full task
     window (an empty calendar never means "available").
  2. The caregiver is approved for the task category (and physical-assist /
     transportation needs).
  3. No overlapping assignment or personal commitment.
  4. Weekly workload limit is respected.
  5. Professional-only tasks are never given to family caregivers.

Tasks are processed most-constrained-first, and ties between eligible
caregivers are broken by firmness (confirmed > tentative), stated preference,
then lowest workload utilization. Time-sensitive tasks are never moved: if
nobody is eligible at the required time, the task stays uncovered.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from .models import (
    Assignment,
    CandidateEvaluation,
    CareTask,
    Caregiver,
    CaregiverWorkload,
    CoverageSummary,
    ScheduleResult,
)
from .timeutil import (
    DAY_NAMES,
    fmt12,
    fmt_range,
    from_min,
    merge_intervals,
    overlaps,
    subtract,
    time_of_day,
    to_min,
)

CATEGORY_LABEL = {
    "medication": "medication reminders",
    "meals": "meal assistance",
    "mobility": "mobility assistance",
    "personal_care": "personal care",
    "monitoring": "monitoring & observation",
    "transportation": "transportation",
    "appointment": "appointment support",
    "wound_care": "wound-care-related tasks",
    "other": "this type of task",
}

FLEX_STEP = 15  # minutes, used when searching a slot for flexible-time tasks


class _State:
    """Mutable bookkeeping while scheduling one plan."""

    def __init__(self, caregivers: List[Caregiver]):
        self.busy: Dict[str, List[Tuple[str, int, int, str, str]]] = {c.id: [] for c in caregivers}  # (task_id, start, end, title, date)
        self.minutes: Dict[str, int] = {c.id: 0 for c in caregivers}


def availability_windows(cg: Caregiver, weekday: int) -> List[Tuple[int, int, bool]]:
    """Explicitly declared availability for a weekday as merged intervals
    (start, end, tentative). Explicit 'unavailable' blocks are subtracted."""
    pos = [
        (to_min(b.start), to_min(b.end), b.status == "possible")
        for b in cg.availability
        if b.weekday == weekday and b.status in ("available", "possible")
    ]
    neg = [(to_min(b.start), to_min(b.end)) for b in cg.availability if b.weekday == weekday and b.status == "unavailable"]
    return merge_intervals(subtract(merge_intervals(pos), neg))


def _describe_windows(cg: Caregiver, weekday: int) -> str:
    wins = availability_windows(cg, weekday)
    if not wins:
        return f"{cg.name} has not marked any availability on {DAY_NAMES[weekday]}"
    parts = [fmt_range(from_min(s), from_min(e)) + (" (possibly)" if t else "") for s, e, t in wins]
    return f"{cg.name} is available {', '.join(parts)} on {DAY_NAMES[weekday]}"


def _static_checks(task: CareTask, cg: Caregiver) -> Optional[CandidateEvaluation]:
    """Checks that don't depend on time. Returns a failing evaluation, or None."""

    def fail(code: str, reason: str) -> CandidateEvaluation:
        return CandidateEvaluation(caregiver_id=cg.id, caregiver_name=cg.name, eligible=False, code=code, reason=reason)

    if not cg.active:
        return fail("inactive", f"{cg.name} is not part of the active care team.")
    if cg.consent == "declined":
        return fail("declined", f"{cg.name} has declined caregiving assignments.")
    if task.category not in cg.capabilities:
        return fail("capability", f"{cg.name} is not approved for {CATEGORY_LABEL[task.category]}.")
    if task.requires_physical_assist and not cg.can_physical_assist:
        return fail("physical", f"{cg.name} cannot provide the physical assistance this task needs.")
    if task.requires_transport and not cg.has_transportation:
        return fail("transport", f"{cg.name} does not have transportation available.")
    return None


def evaluate(
    task: CareTask,
    cg: Caregiver,
    state: _State,
    start_override: Optional[int] = None,
) -> Tuple[CandidateEvaluation, Optional[int]]:
    """Full eligibility evaluation. Returns (evaluation, chosen_start_minutes)."""
    static = _static_checks(task, cg)
    if static is not None:
        return static, None

    dur = task.estimated_duration_minutes
    day = DAY_NAMES[task.weekday]
    windows = availability_windows(cg, task.weekday)
    commitments = [c for c in cg.commitments if c.weekday == task.weekday]
    busy = [b for b in state.busy[cg.id] if b[4] == task.date]
    max_minutes = int(round(cg.max_hours_per_week * 60))

    def fail(code: str, reason: str):
        return CandidateEvaluation(caregiver_id=cg.id, caregiver_name=cg.name, eligible=False, code=code, reason=reason), None

    if state.minutes[cg.id] + dur > max_minutes:
        return fail(
            "workload",
            f"{cg.name} would exceed their weekly limit of {cg.max_hours_per_week:g} h "
            f"({state.minutes[cg.id]} of {max_minutes} min already assigned).",
        )

    if task.scheduled_time is not None or start_override is not None:
        starts = [start_override if start_override is not None else to_min(task.scheduled_time)]
    else:
        # Flexible task: try every slot inside declared windows, earliest first.
        starts = []
        for ws, we, _t in windows:
            s = ws
            while s + dur <= we:
                starts.append(s)
                s += FLEX_STEP
        if not starts:
            return fail("availability", f"{_describe_windows(cg, task.weekday)}; no window fits {dur} minutes.")

    first_failure = None
    for s in starts:
        e = s + dur
        window = next(((ws, we, t) for ws, we, t in windows if ws <= s and e <= we), None)
        clash = next((c for c in commitments if overlaps(s, e, to_min(c.start), to_min(c.end))), None)
        rng = fmt_range(from_min(s), from_min(e))
        if window is None:
            if clash is not None:
                res = fail(
                    "availability",
                    f"{cg.name} is not available {rng} on {day} ({clash.label}, {fmt_range(clash.start, clash.end)}).",
                )
            else:
                res = fail("availability", f"{_describe_windows(cg, task.weekday)}, which does not cover {rng}.")
            first_failure = first_failure or res
            continue
        if clash is not None:
            res = fail(
                "commitment",
                f"{cg.name} marked this time available but also has '{clash.label}' "
                f"({fmt_range(clash.start, clash.end)}) on {day}.",
            )
            first_failure = first_failure or res
            continue
        other = next((b for b in busy if overlaps(s, e, b[1], b[2])), None)
        if other is not None:
            res = fail(
                "overlap",
                f"{cg.name} is already assigned to '{other[3]}' at {fmt12(from_min(other[1]))} on {day}.",
            )
            first_failure = first_failure or res
            continue
        tentative = window[2] or cg.consent == "pending"
        win_txt = fmt_range(from_min(window[0]), from_min(window[1]))
        reason = f"{cg.name} is available {win_txt} on {day} and is approved for {CATEGORY_LABEL[task.category]}."
        if window[2]:
            reason = f"{cg.name} is *possibly* available {win_txt} on {day} and is approved for {CATEGORY_LABEL[task.category]}."
        return (
            CandidateEvaluation(
                caregiver_id=cg.id, caregiver_name=cg.name, eligible=True, tentative=tentative, code="ok", reason=reason
            ),
            s,
        )
    return first_failure  # type: ignore[return-value]


def _classify_gap(task: CareTask, evals: List[CandidateEvaluation]) -> str:
    considered = [e for e in evals if e.code not in ("inactive", "declined")]
    capable = [e for e in considered if e.code not in ("capability", "physical", "transport")]
    if not capable:
        if any(e.code == "transport" for e in considered):
            return "transportation"
        return "capability"
    codes = {e.code for e in capable}
    if "workload" in codes:
        return "workload"
    if codes & {"overlap", "commitment"}:
        return "scheduling_conflict"
    return "availability"


def _uncovered_explanation(task: CareTask, gap_type: str) -> str:
    day = DAY_NAMES[task.weekday]
    when = f"at {fmt12(task.scheduled_time)} on {day}" if task.scheduled_time else f"on {day}"
    return {
        "availability": f"No eligible caregiver is available {when}.",
        "capability": f"No caregiver on the team is approved to perform {CATEGORY_LABEL[task.category]}.",
        "transportation": f"No eligible caregiver with transportation is available {when}.",
        "workload": f"The only eligible caregivers {when} have reached their weekly workload limit.",
        "scheduling_conflict": f"Every eligible caregiver has a conflicting obligation {when}.",
    }[gap_type]


def _pref_penalty(cg: Caregiver, start_min: int) -> int:
    if not cg.preferred_times:
        return 0
    return 0 if time_of_day(from_min(start_min)) in cg.preferred_times else 1


def generate_schedule(
    tasks: List[CareTask],
    caregivers: List[Caregiver],
    pins: Optional[Dict[str, str]] = None,
) -> ScheduleResult:
    pins = pins or {}
    state = _State(caregivers)
    by_id = {c.id: c for c in caregivers}
    order = {c.id: i for i, c in enumerate(caregivers)}
    results: Dict[str, Assignment] = {}

    def book(task: CareTask, cg: Caregiver, start: int) -> None:
        state.busy[cg.id].append((task.task_id, start, start + task.estimated_duration_minutes, task.title, task.date))
        state.minutes[cg.id] += task.estimated_duration_minutes

    schedulable: List[CareTask] = []
    for t in tasks:
        if t.eligibility == "self" or not t.caregiver_required:
            results[t.task_id] = Assignment(
                task_id=t.task_id,
                status="self_managed",
                start_time=t.scheduled_time,
                explanation="The discharge plan lists this as patient self-managed; no caregiver assignment is needed.",
            )
        elif t.professional_required or t.eligibility == "professional":
            results[t.task_id] = Assignment(
                task_id=t.task_id,
                status="professional_review",
                gap_type="professional",
                start_time=t.scheduled_time,
                explanation=(
                    "This task requires professional clinical care and is never assigned to family caregivers. "
                    "Confirm a home-health or clinical provider with the care team."
                ),
            )
        elif t.eligibility == "unknown":
            results[t.task_id] = Assignment(
                task_id=t.task_id,
                status="professional_review",
                gap_type="professional",
                start_time=t.scheduled_time,
                explanation=(
                    "It is unclear whether a family caregiver may perform this task. "
                    "Clarify eligibility with the care team before assigning it."
                ),
            )
        else:
            schedulable.append(t)

    # 1) Manual pins first — validated with exactly the same rules.
    for t in schedulable:
        cg_id = pins.get(t.task_id)
        if not cg_id or cg_id not in by_id:
            continue
        ev, start = evaluate(t, by_id[cg_id], state)
        if ev.eligible and start is not None:
            book(t, by_id[cg_id], start)
            results[t.task_id] = Assignment(
                task_id=t.task_id,
                status="tentative" if ev.tentative else "covered",
                caregiver_id=cg_id,
                caregiver_name=by_id[cg_id].name,
                start_time=from_min(start),
                end_time=from_min(start + t.estimated_duration_minutes),
                explanation=f"Manually assigned to {by_id[cg_id].name}. {ev.reason}",
                pinned=True,
                candidates=[ev],
            )

    # 2) Most-constrained-first: count caregivers that pass static + window checks.
    def static_candidates(t: CareTask) -> int:
        blank = _State(caregivers)
        return sum(1 for c in caregivers if evaluate(t, c, blank)[0].eligible)

    remaining = [t for t in schedulable if t.task_id not in results]
    remaining.sort(key=lambda t: (static_candidates(t), t.date, t.scheduled_time or "99:99", t.task_id))

    for t in remaining:
        evals: List[CandidateEvaluation] = []
        options = []
        for cg in caregivers:
            ev, start = evaluate(t, cg, state)
            evals.append(ev)
            if ev.eligible and start is not None:
                max_m = max(1, int(round(cg.max_hours_per_week * 60)))
                util = state.minutes[cg.id] / max_m
                options.append(((1 if ev.tentative else 0, _pref_penalty(cg, start), round(util, 4), order[cg.id]), cg, ev, start))

        if not options:
            gap = _classify_gap(t, evals)
            results[t.task_id] = Assignment(
                task_id=t.task_id,
                status="uncovered",
                start_time=t.scheduled_time,
                explanation=_uncovered_explanation(t, gap),
                gap_type=gap,  # type: ignore[arg-type]
                candidates=evals,
            )
            continue

        options.sort(key=lambda o: o[0])
        _, cg, ev, start = options[0]
        book(t, cg, start)
        explanation = f"Assigned to {cg.name} because {ev.reason}"
        if t.scheduled_time is None:
            explanation += f" (Flexible-time task placed at {fmt12(from_min(start))}.)"
        if len(options) > 1:
            others = ", ".join(o[1].name for o in options[1:])
            explanation += f" {others} {'was' if len(options) == 2 else 'were'} also eligible; {cg.name} was chosen to balance workload and honor preferences."
        if ev.tentative:
            why = []
            if cg.consent == "pending":
                why.append(f"{cg.name} has not yet confirmed participation")
            if "*possibly*" in ev.reason:
                why.append("the availability is marked 'possibly available'")
            explanation = (
                f"Tentatively assigned to {cg.name}: {' and '.join(why)}. "
                f"Confirm with {cg.name} before relying on this. " + ev.reason.replace("*", "")
            )
        results[t.task_id] = Assignment(
            task_id=t.task_id,
            status="tentative" if ev.tentative else "covered",
            caregiver_id=cg.id,
            caregiver_name=cg.name,
            start_time=from_min(start),
            end_time=from_min(start + t.estimated_duration_minutes),
            explanation=explanation.replace("*", ""),
            candidates=evals,
        )

    assignments = [results[t.task_id] for t in tasks]
    return ScheduleResult(
        assignments=assignments,
        summary=summarize(assignments),
        workload=workload(assignments, tasks, caregivers),
    )


def summarize(assignments: List[Assignment]) -> CoverageSummary:
    count = lambda s: sum(1 for a in assignments if a.status == s)  # noqa: E731
    total = len(assignments)
    self_managed = count("self_managed")
    denom = total - self_managed
    covered = count("covered")
    return CoverageSummary(
        total=total,
        covered=covered,
        tentative=count("tentative"),
        uncovered=count("uncovered"),
        professional_review=count("professional_review"),
        self_managed=self_managed,
        coverage_percent=round(100.0 * covered / denom, 1) if denom else 0.0,
    )


def workload(assignments: List[Assignment], tasks: List[CareTask], caregivers: List[Caregiver]) -> List[CaregiverWorkload]:
    dur = {t.task_id: t.estimated_duration_minutes for t in tasks}
    out = []
    for cg in caregivers:
        mine = [a for a in assignments if a.caregiver_id == cg.id]
        minutes = sum(dur[a.task_id] for a in mine)
        max_m = int(round(cg.max_hours_per_week * 60))
        out.append(
            CaregiverWorkload(
                caregiver_id=cg.id,
                name=cg.name,
                color=cg.color,
                tasks=len(mine),
                tentative_tasks=sum(1 for a in mine if a.status == "tentative"),
                minutes=minutes,
                max_minutes=max_m,
                utilization_percent=round(100.0 * minutes / max_m, 1) if max_m else 0.0,
            )
        )
    return out


def check_assignment(task: CareTask, cg: Caregiver, tasks: List[CareTask], caregivers: List[Caregiver], pins: Dict[str, str]) -> CandidateEvaluation:
    """Would manually assigning `task` to `cg` be valid, given the current
    schedule (excluding the task's own current assignment)?"""
    current = generate_schedule(tasks, caregivers, pins)
    state = _State(caregivers)
    tmap = {t.task_id: t for t in tasks}
    for a in current.assignments:
        if a.caregiver_id and a.task_id != task.task_id and a.start_time:
            t = tmap[a.task_id]
            s = to_min(a.start_time)
            state.busy[a.caregiver_id].append((t.task_id, s, s + t.estimated_duration_minutes, t.title, t.date))
            state.minutes[a.caregiver_id] += t.estimated_duration_minutes
    if task.professional_required or task.eligibility in ("professional", "unknown", "self"):
        return CandidateEvaluation(
            caregiver_id=cg.id,
            caregiver_name=cg.name,
            eligible=False,
            code="professional",
            reason="This task is not family-assignable (professional care, unclear eligibility, or patient self-managed).",
        )
    ev, _ = evaluate(task, cg, state)
    return ev
