"""Typed data models for Invisible Shift.

Python 3.9 compatible (uses typing.Optional / List instead of PEP 604 unions).
"""
from __future__ import annotations

import re
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

Category = Literal[
    "medication",
    "meals",
    "mobility",
    "personal_care",
    "monitoring",
    "transportation",
    "appointment",
    "wound_care",
    "other",
]
CATEGORIES: List[str] = [
    "medication",
    "meals",
    "mobility",
    "personal_care",
    "monitoring",
    "transportation",
    "appointment",
    "wound_care",
    "other",
]

# Who may perform a task according to the discharge document.
Eligibility = Literal["self", "family", "professional", "unknown"]
BlockStatus = Literal["available", "possible", "unavailable"]
Consent = Literal["confirmed", "pending", "declined"]
TaskStatus = Literal["covered", "tentative", "uncovered", "professional_review", "self_managed"]
Frequency = Literal["daily", "weekdays", "weekends", "specific_days", "once", "as_needed"]
PreferredTime = Literal["morning", "midday", "afternoon", "evening"]
GapType = Literal[
    "availability",
    "scheduling_conflict",
    "capability",
    "transportation",
    "workload",
    "professional",
    "needs_confirmation",
]
GapStatus = Literal["open", "acknowledged", "flagged_for_care_team", "resolved"]

_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


def normalize_time(value: Optional[str]) -> Optional[str]:
    """Normalize 'H:MM' / 'HH:MM' to 'HH:MM'. Empty -> None. Raises on garbage."""
    if value is None:
        return None
    value = str(value).strip()
    if value == "" or value.lower() in {"null", "none", "unspecified"}:
        return None
    m = _TIME_RE.match(value)
    if not m:
        raise ValueError(f"time must be HH:MM (24h), got {value!r}")
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 24 or mi > 59 or (h == 24 and mi != 0):
        raise ValueError(f"invalid time {value!r}")
    return f"{h:02d}:{mi:02d}"


# ---------------------------------------------------------------------------
# Discharge plan (task templates extracted from the document)
# ---------------------------------------------------------------------------


class ExtractedTask(BaseModel):
    """One actionable instruction from a discharge document (a template that
    may expand into several dated task instances)."""

    task_id: str
    title: str = Field(min_length=1, max_length=200)
    category: Category = "other"
    scheduled_time: Optional[str] = None
    frequency: Optional[Frequency] = None
    days_of_week: List[int] = Field(default_factory=list)
    date: Optional[str] = None  # YYYY-MM-DD for one-off tasks
    estimated_duration_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    caregiver_required: bool = True
    professional_required: bool = False
    eligibility: Eligibility = "family"
    requires_transport: bool = False
    requires_physical_assist: bool = False
    source_text: str = ""
    source_page: Optional[int] = None
    needs_review: bool = False
    review_notes: List[str] = Field(default_factory=list)
    confirmed: bool = False

    @field_validator("scheduled_time", mode="before")
    @classmethod
    def _time(cls, v):
        return normalize_time(v)

    @field_validator("days_of_week")
    @classmethod
    def _days(cls, v):
        for d in v:
            if d < 0 or d > 6:
                raise ValueError("days_of_week entries must be 0 (Mon) .. 6 (Sun)")
        return sorted(set(v))

    @field_validator("date")
    @classmethod
    def _date(cls, v):
        if v is None or v == "":
            return None
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("date must be YYYY-MM-DD")
        return v

    @model_validator(mode="after")
    def _consistency(self):
        # Professional-only care is never family-eligible.
        if self.professional_required:
            self.eligibility = "professional"
        if self.eligibility == "professional":
            self.professional_required = True
        if self.eligibility == "self":
            self.caregiver_required = False
        return self


# ---------------------------------------------------------------------------
# Concrete task instances
# ---------------------------------------------------------------------------


class CareTask(BaseModel):
    task_id: str
    template_id: str
    title: str
    category: Category
    date: str  # YYYY-MM-DD
    weekday: int  # 0 = Monday
    scheduled_time: Optional[str] = None  # None => flexible, any time that day
    estimated_duration_minutes: int = Field(ge=1, le=600)
    caregiver_required: bool = True
    professional_required: bool = False
    eligibility: Eligibility = "family"
    requires_transport: bool = False
    requires_physical_assist: bool = False
    source_text: str = ""
    source_page: Optional[int] = None

    @field_validator("scheduled_time", mode="before")
    @classmethod
    def _time(cls, v):
        return normalize_time(v)


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_time: Optional[str] = None
    estimated_duration_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    requires_transport: Optional[bool] = None
    requires_physical_assist: Optional[bool] = None

    @field_validator("scheduled_time", mode="before")
    @classmethod
    def _time(cls, v):
        return normalize_time(v)


# ---------------------------------------------------------------------------
# Caregivers
# ---------------------------------------------------------------------------


class TimeBlock(BaseModel):
    id: str
    weekday: int = Field(ge=0, le=6)
    start: str
    end: str

    @field_validator("start", "end", mode="before")
    @classmethod
    def _t(cls, v):
        t = normalize_time(v)
        if t is None:
            raise ValueError("start/end required")
        return t

    @model_validator(mode="after")
    def _order(self):
        if self.start >= self.end:
            raise ValueError(f"block start {self.start} must be before end {self.end}")
        return self


class AvailabilityBlock(TimeBlock):
    status: BlockStatus = "available"


class Commitment(TimeBlock):
    label: str = "Commitment"


class Caregiver(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=80)
    relationship: str = ""
    color: str = "#14b8a6"
    availability: List[AvailabilityBlock] = Field(default_factory=list)
    preferred_times: List[PreferredTime] = Field(default_factory=list)
    max_hours_per_week: float = Field(default=10, ge=0, le=168)
    has_transportation: bool = False
    can_physical_assist: bool = False
    capabilities: List[Category] = Field(default_factory=list)
    commitments: List[Commitment] = Field(default_factory=list)
    consent: Consent = "pending"
    active: bool = True
    notes: str = ""


# ---------------------------------------------------------------------------
# Scheduling results
# ---------------------------------------------------------------------------


class CandidateEvaluation(BaseModel):
    caregiver_id: str
    caregiver_name: str
    eligible: bool
    tentative: bool = False
    code: str  # ok | inactive | declined | capability | physical | transport | availability | commitment | overlap | workload
    reason: str


class Assignment(BaseModel):
    task_id: str
    status: TaskStatus
    caregiver_id: Optional[str] = None
    caregiver_name: Optional[str] = None
    start_time: Optional[str] = None  # actual start (== scheduled_time, or chosen slot for flexible tasks)
    end_time: Optional[str] = None
    explanation: str
    gap_type: Optional[GapType] = None
    pinned: bool = False
    candidates: List[CandidateEvaluation] = Field(default_factory=list)


class CoverageSummary(BaseModel):
    total: int
    covered: int
    tentative: int
    uncovered: int
    professional_review: int
    self_managed: int
    coverage_percent: float


class CaregiverWorkload(BaseModel):
    caregiver_id: str
    name: str
    color: str
    tasks: int
    tentative_tasks: int
    minutes: int
    max_minutes: int
    utilization_percent: float


class ScheduleResult(BaseModel):
    assignments: List[Assignment]
    summary: CoverageSummary
    workload: List[CaregiverWorkload]


class Gap(BaseModel):
    gap_id: str
    type: GapType
    task_id: Optional[str] = None
    template_id: Optional[str] = None
    caregiver_id: Optional[str] = None
    title: str
    date: Optional[str] = None
    day_label: Optional[str] = None
    time_label: Optional[str] = None
    headline: str
    reason: str
    details: List[str] = Field(default_factory=list)
    suggested_action: str
    scheduling_urgency: Literal["high", "medium", "low"]
    clinical_note: str
    status: GapStatus = "open"


# ---------------------------------------------------------------------------
# Workspace (persisted state)
# ---------------------------------------------------------------------------


class Patient(BaseModel):
    name: str
    age: Optional[int] = None
    situation: str = ""
    discharge_date: Optional[str] = None
    hospital: str = ""
    synthetic: bool = True


class CarePlan(BaseModel):
    start_date: str
    days: int = 7
    source: str = "sample"  # sample | upload | text
    source_name: str = ""
    extraction_mode: str = "sample"  # sample | ai:<provider> | rules
    templates: List[ExtractedTask] = Field(default_factory=list)


class Workspace(BaseModel):
    patient: Patient
    plan: CarePlan
    tasks: List[CareTask] = Field(default_factory=list)
    caregivers: List[Caregiver] = Field(default_factory=list)
    pins: Dict[str, str] = Field(default_factory=dict)  # task_id -> caregiver_id (manual)
    gap_status: Dict[str, GapStatus] = Field(default_factory=dict)
    is_demo: bool = True


# ---------------------------------------------------------------------------
# API payloads
# ---------------------------------------------------------------------------


class ExtractTextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=200_000)


class ExtractionResult(BaseModel):
    tasks: List[ExtractedTask]
    mode: str  # sample | ai:openai | ai:gemini | rules
    warnings: List[str] = Field(default_factory=list)
    document: Optional[Dict[str, object]] = None


class ConfirmPlanRequest(BaseModel):
    templates: List[ExtractedTask] = Field(min_length=1)
    start_date: Optional[str] = None
    source: str = "upload"
    source_name: str = ""
    extraction_mode: str = "rules"


class AssignRequest(BaseModel):
    task_id: str
    caregiver_id: str


class GapStatusUpdate(BaseModel):
    status: GapStatus


class ScenarioRequest(BaseModel):
    caregivers: List[Caregiver]


class TaskChange(BaseModel):
    task_id: str
    title: str
    date: str
    weekday: int
    time: Optional[str]
    before_status: TaskStatus
    after_status: TaskStatus
    before_caregiver: Optional[str]
    after_caregiver: Optional[str]
    after_explanation: str
    kind: Literal["resolved", "regressed", "reassigned", "changed"]


class ScenarioResult(BaseModel):
    before: ScheduleResult
    after: ScheduleResult
    changes: List[TaskChange]
    resolved: int
    regressed: int


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[ChatMessage] = Field(default_factory=list)


class ChatResponse(BaseModel):
    reply: str
    mode: str  # ai:<provider> | deterministic
    facts: List[str] = Field(default_factory=list)
