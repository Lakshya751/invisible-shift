"""Synthetic demo scenario. Robert Wilson and family are FICTIONAL.

Expected result through real constraint matching: 28 tasks, 21 covered,
7 uncovered (5 weekday lunches + Wed/Fri evening observations), 75 %.
"""
from __future__ import annotations

from typing import List

from .models import (
    AvailabilityBlock,
    CarePlan,
    Caregiver,
    Commitment,
    ExtractedTask,
    Patient,
    Workspace,
)
from .plan import expand_templates

DEMO_START = "2026-11-16"  # Monday
WEEKDAYS = [0, 1, 2, 3, 4]
ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]


def demo_patient() -> Patient:
    return Patient(
        name="Robert Wilson",
        age=72,
        situation="Recently discharged after abdominal surgery (synthetic demo scenario).",
        discharge_date="2026-11-15",
        hospital="Riverside General Hospital (fictional)",
        synthetic=True,
    )


def demo_templates() -> List[ExtractedTask]:
    return [
        ExtractedTask(
            task_id="med-am",
            title="Medication reminder",
            category="medication",
            scheduled_time="08:00",
            frequency="daily",
            estimated_duration_minutes=15,
            caregiver_required=True,
            eligibility="family",
            source_text=(
                "Morning medications at 8:00 AM daily as listed on the attached medication schedule. "
                "A family caregiver should remind the patient and confirm the dose was taken."
            ),
            source_page=1,
            confirmed=True,
        ),
        ExtractedTask(
            task_id="meal-noon",
            title="Meal assistance",
            category="meals",
            scheduled_time="12:00",
            frequency="daily",
            estimated_duration_minutes=30,
            caregiver_required=True,
            eligibility="family",
            source_text=(
                "Lunch at 12:00 PM daily. A caregiver should help prepare a soft, low-sodium meal "
                "and stay with the patient while eating."
            ),
            source_page=1,
            confirmed=True,
        ),
        ExtractedTask(
            task_id="walk-pm",
            title="Supervised mobility activity",
            category="mobility",
            scheduled_time="15:00",
            frequency="daily",
            estimated_duration_minutes=20,
            caregiver_required=True,
            eligibility="family",
            requires_physical_assist=True,
            source_text=(
                "Supervised walk at 3:00 PM daily, as taught by physical therapy. A caregiver who has been "
                "shown the technique should provide standby assistance."
            ),
            source_page=2,
            confirmed=True,
        ),
        ExtractedTask(
            task_id="dressing-eve",
            title="Dressing observation & logging",
            category="monitoring",
            scheduled_time="20:00",
            frequency="daily",
            estimated_duration_minutes=15,
            caregiver_required=True,
            eligibility="family",
            source_text=(
                "At 8:00 PM daily, a family caregiver should look at the outer surgical dressing and record "
                "any drainage or changes in the care log. Do not remove or change the dressing; dressing changes "
                "are performed by the home health nurse."
            ),
            source_page=2,
            confirmed=True,
        ),
    ]


def _blocks(prefix: str, days: List[int], start: str, end: str, status: str = "available") -> List[AvailabilityBlock]:
    return [AvailabilityBlock(id=f"{prefix}-{d}", weekday=d, start=start, end=end, status=status) for d in days]  # type: ignore[arg-type]


def _commit(prefix: str, days: List[int], start: str, end: str, label: str) -> List[Commitment]:
    return [Commitment(id=f"{prefix}-{d}", weekday=d, start=start, end=end, label=label) for d in days]


def demo_caregivers() -> List[Caregiver]:
    maya = Caregiver(
        id="maya",
        name="Maya Wilson",
        relationship="Daughter",
        color="#0d9488",
        availability=_blocks("maya-am", ALL_DAYS, "07:30", "09:00"),
        preferred_times=["morning"],
        max_hours_per_week=5,
        has_transportation=True,
        can_physical_assist=False,
        capabilities=["medication", "meals", "monitoring", "personal_care"],
        commitments=_commit("maya-work", WEEKDAYS, "09:30", "18:00", "Work (office)"),
        consent="confirmed",
        notes="Lives 15 minutes away. Has other daytime commitments.",
    )
    daniel = Caregiver(
        id="daniel",
        name="Daniel Wilson",
        relationship="Son",
        color="#7c3aed",
        availability=_blocks("daniel-pm", ALL_DAYS, "14:30", "16:00"),
        preferred_times=["afternoon"],
        max_hours_per_week=4,
        has_transportation=True,
        can_physical_assist=True,
        capabilities=["mobility", "transportation", "appointment"],
        commitments=_commit("daniel-work", WEEKDAYS, "06:00", "14:00", "Early work shift"),
        consent="confirmed",
        notes="Shown the walking-assist technique by physical therapy before discharge.",
    )
    sarah = Caregiver(
        id="sarah",
        name="Sarah Wilson",
        relationship="Spouse",
        color="#e8590c",
        availability=(
            _blocks("sarah-lunch", [5, 6], "11:30", "12:30")
            + _blocks("sarah-eve", [0, 1, 3, 5, 6], "19:30", "20:30")
        ),
        preferred_times=["midday", "evening"],
        max_hours_per_week=6,
        has_transportation=False,
        can_physical_assist=False,
        capabilities=["meals", "monitoring", "personal_care", "medication"],
        commitments=(
            _commit("sarah-job", WEEKDAYS, "09:00", "13:30", "Part-time library job")
            + [Commitment(id="sarah-wed", weekday=2, start="17:00", end="21:30", label="Volunteer shift")]
            + [Commitment(id="sarah-fri", weekday=4, start="18:00", end="21:00", label="Evening class")]
        ),
        consent="confirmed",
        notes="Does not drive. Unavailable Wednesday and Friday evenings.",
    )
    return [maya, daniel, sarah]


def demo_workspace() -> Workspace:
    templates = demo_templates()
    return Workspace(
        patient=demo_patient(),
        plan=CarePlan(
            start_date=DEMO_START,
            days=7,
            source="sample",
            source_name="Riverside General — Discharge Instructions (synthetic)",
            extraction_mode="sample",
            templates=templates,
        ),
        tasks=expand_templates(templates, DEMO_START, 7),
        caregivers=demo_caregivers(),
        pins={},
        gap_status={},
        is_demo=True,
    )


def blank_workspace() -> Workspace:
    return Workspace(
        patient=Patient(name="Your patient", synthetic=False, situation=""),
        plan=CarePlan(start_date=DEMO_START, days=7, source="none", extraction_mode="none", templates=[]),
        tasks=[],
        caregivers=[],
        is_demo=False,
    )
