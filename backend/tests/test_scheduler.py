"""Scheduling-engine tests. The demo fixture must produce 21/7 through real
constraint matching — nothing is hardcoded."""
from app.demo import demo_caregivers, demo_workspace
from app.gaps import detect_gaps
from app.models import AvailabilityBlock, Caregiver, CareTask, Commitment
from app.scheduler import generate_schedule, summarize


def _task(tid="t1", date="2026-11-16", time="12:00", dur=30, cat="meals", **kw):
    from datetime import date as d

    return CareTask(
        task_id=tid,
        template_id=tid.split("-")[0],
        title=kw.pop("title", "Task"),
        category=cat,
        date=date,
        weekday=d.fromisoformat(date).weekday(),
        scheduled_time=time,
        estimated_duration_minutes=dur,
        **kw,
    )


def _cg(cid="a", windows=((0, "11:00", "13:00"),), caps=("meals",), **kw):
    kw.setdefault("consent", "confirmed")
    return Caregiver(
        id=cid,
        name=kw.pop("name", cid.upper()),
        availability=[AvailabilityBlock(id=f"{cid}{i}", weekday=w, start=s, end=e) for i, (w, s, e) in enumerate(windows)],
        capabilities=list(caps),
        **kw,
    )


# ------------------------------------------------------------------ fixture


def test_demo_creates_28_tasks():
    ws = demo_workspace()
    assert len(ws.tasks) == 28
    assert {t.date for t in ws.tasks} == {f"2026-11-{d}" for d in range(16, 23)}
    for d in range(16, 23):
        assert sum(1 for t in ws.tasks if t.date == f"2026-11-{d}") == 4


def test_demo_expected_coverage():
    ws = demo_workspace()
    r = generate_schedule(ws.tasks, ws.caregivers)
    s = r.summary
    assert (s.total, s.covered, s.uncovered, s.tentative) == (28, 21, 7, 0)
    assert s.coverage_percent == 75.0


def test_demo_who_covers_what():
    ws = demo_workspace()
    r = generate_schedule(ws.tasks, ws.caregivers)
    by = {a.task_id: a for a in r.assignments}
    days = [f"2026-11-{d}" for d in range(16, 23)]
    assert all(by[f"med-am-{d}"].caregiver_id == "maya" for d in days)
    assert all(by[f"walk-pm-{d}"].caregiver_id == "daniel" for d in days)
    assert [by[f"meal-noon-{d}"].caregiver_id for d in days] == [None] * 5 + ["sarah", "sarah"]
    eve = [by[f"dressing-eve-{d}"].caregiver_id for d in days]
    assert eve == ["sarah", "sarah", None, "sarah", None, "sarah", "sarah"]
    uncovered = sorted(a.task_id for a in r.assignments if a.status == "uncovered")
    assert uncovered == sorted(
        [f"meal-noon-{d}" for d in days[:5]] + ["dressing-eve-2026-11-18", "dressing-eve-2026-11-20"]
    )
    assert all(by[t].gap_type == "availability" for t in uncovered)


def test_demo_explanations_are_human_readable():
    ws = demo_workspace()
    r = generate_schedule(ws.tasks, ws.caregivers)
    by = {a.task_id: a for a in r.assignments}
    assert "Maya" in by["med-am-2026-11-16"].explanation and "7:30–9:00 AM" in by["med-am-2026-11-16"].explanation
    assert by["meal-noon-2026-11-18"].explanation == "No eligible caregiver is available at 12:00 PM on Wednesday."


def test_demo_gap_detection_lists_seven():
    ws = demo_workspace()
    gaps = detect_gaps(ws, generate_schedule(ws.tasks, ws.caregivers))
    task_gaps = [g for g in gaps if g.task_id]
    assert len(task_gaps) == 7
    wed = next(g for g in task_gaps if g.task_id == "dressing-eve-2026-11-18")
    assert wed.headline.startswith("Wednesday, 8:00 PM")
    assert "flag this task for the care team" in wed.suggested_action
    assert "not clinical risk" in wed.clinical_note


# ------------------------------------------------------------------ rules


def test_empty_calendar_is_never_available():
    t = _task()
    r = generate_schedule([t], [_cg(windows=())])
    assert r.assignments[0].status == "uncovered"
    assert r.assignments[0].gap_type == "availability"


def test_availability_must_cover_full_duration():
    t = _task(time="12:45", dur=30)  # ends 13:15, window ends 13:00
    r = generate_schedule([t], [_cg()])
    assert r.assignments[0].status == "uncovered"
    t2 = _task(time="12:30", dur=30)
    assert generate_schedule([t2], [_cg()]).assignments[0].status == "covered"


def test_overlapping_assignment_prevented():
    t1 = _task("t1", time="12:00", dur=30)
    t2 = _task("t2", time="12:15", dur=30)
    r = generate_schedule([t1, t2], [_cg()])
    statuses = sorted(a.status for a in r.assignments)
    assert statuses == ["covered", "uncovered"]
    unc = next(a for a in r.assignments if a.status == "uncovered")
    assert unc.gap_type == "scheduling_conflict"
    assert "already assigned" in unc.candidates[0].reason


def test_same_time_different_days_do_not_conflict():
    t1 = _task("t1", date="2026-11-16")
    t2 = _task("t2", date="2026-11-17")
    r = generate_schedule([t1, t2], [_cg(windows=((0, "11:00", "13:00"), (1, "11:00", "13:00")))])
    assert all(a.status == "covered" for a in r.assignments)


def test_commitment_blocks_assignment():
    cg = _cg(commitments=[Commitment(id="c", weekday=0, start="11:30", end="12:30", label="Dentist")])
    r = generate_schedule([_task()], [cg])
    a = r.assignments[0]
    assert a.status == "uncovered" and a.gap_type == "scheduling_conflict"
    assert "Dentist" in a.candidates[0].reason


def test_capability_constraint():
    r = generate_schedule([_task(cat="mobility")], [_cg(caps=("meals",))])
    a = r.assignments[0]
    assert a.status == "uncovered" and a.gap_type == "capability"


def test_physical_assist_constraint():
    t = _task(cat="mobility", requires_physical_assist=True)
    r = generate_schedule([t], [_cg(caps=("mobility",), can_physical_assist=False)])
    assert r.assignments[0].status == "uncovered"
    r2 = generate_schedule([t], [_cg(caps=("mobility",), can_physical_assist=True)])
    assert r2.assignments[0].status == "covered"


def test_transportation_gap():
    t = _task(cat="appointment", requires_transport=True)
    r = generate_schedule([t], [_cg(caps=("appointment",), has_transportation=False)])
    assert r.assignments[0].gap_type == "transportation"


def test_weekly_workload_limit_enforced():
    tasks = [_task(f"t{i}", date=f"2026-11-{16 + i}", dur=30) for i in range(3)]
    cg = _cg(windows=[(i, "11:00", "13:00") for i in range(3)], max_hours_per_week=1)  # 60 min
    r = generate_schedule(tasks, [cg])
    assert [a.status for a in r.assignments] == ["covered", "covered", "uncovered"]
    assert r.assignments[2].gap_type == "workload"
    assert r.workload[0].minutes == 60


def test_professional_tasks_never_assigned_to_family():
    t = _task(cat="wound_care", professional_required=True, eligibility="professional")
    cg = _cg(caps=("wound_care",))
    r = generate_schedule([t], [cg])
    a = r.assignments[0]
    assert a.status == "professional_review" and a.caregiver_id is None


def test_unknown_eligibility_needs_review():
    t = _task(eligibility="unknown")
    a = generate_schedule([t], [_cg()]).assignments[0]
    assert a.status == "professional_review" and a.caregiver_id is None


def test_self_managed_excluded_from_denominator():
    t1 = _task("t1", eligibility="self", caregiver_required=False)
    t2 = _task("t2")
    r = generate_schedule([t1, t2], [_cg()])
    assert r.summary.self_managed == 1
    assert r.summary.coverage_percent == 100.0


def test_pending_consent_is_only_tentative():
    r = generate_schedule([_task()], [_cg(consent="pending")])
    assert r.assignments[0].status == "tentative"
    assert "not yet confirmed" in r.assignments[0].explanation


def test_declined_caregiver_not_assigned():
    r = generate_schedule([_task()], [_cg(consent="declined")])
    assert r.assignments[0].status == "uncovered"


def test_possible_availability_is_tentative():
    cg = _cg(windows=())
    cg.availability = [AvailabilityBlock(id="p", weekday=0, start="11:00", end="13:00", status="possible")]
    assert generate_schedule([_task()], [cg]).assignments[0].status == "tentative"


def test_explicit_unavailable_overrides_available():
    cg = _cg()
    cg.availability.append(AvailabilityBlock(id="u", weekday=0, start="11:50", end="12:10", status="unavailable"))
    assert generate_schedule([_task()], [cg]).assignments[0].status == "uncovered"


def test_workload_balancing_between_eligible_caregivers():
    tasks = [_task(f"t{i}", date=f"2026-11-{16 + i}") for i in range(4)]
    w = [(i, "11:00", "13:00") for i in range(4)]
    r = generate_schedule(tasks, [_cg("a", windows=w), _cg("b", windows=w)])
    counts = {w.caregiver_id: w.tasks for w in r.workload}
    assert counts == {"a": 2, "b": 2}


def test_flexible_task_placed_in_window():
    t = _task(time=None, dur=30)
    a = generate_schedule([t], [_cg()]).assignments[0]
    assert a.status == "covered" and a.start_time == "11:00"


def test_time_sensitive_task_not_rescheduled():
    # Caregiver available 13:00-14:00, task fixed at 12:00 -> stays uncovered, not moved.
    a = generate_schedule([_task()], [_cg(windows=((0, "13:00", "14:00"),))]).assignments[0]
    assert a.status == "uncovered" and a.start_time == "12:00"


def test_coverage_percent_calculation():
    from app.models import Assignment

    a = [Assignment(task_id=str(i), status="covered", explanation="") for i in range(2)]
    a += [Assignment(task_id="u", status="uncovered", explanation="")]
    assert summarize(a).coverage_percent == 66.7
    assert summarize([]).coverage_percent == 0.0


def test_caregivers_fixture_unmodified_by_schedule():
    cgs = demo_caregivers()
    before = [c.model_dump() for c in cgs]
    generate_schedule(demo_workspace().tasks, cgs)
    assert [c.model_dump() for c in cgs] == before
