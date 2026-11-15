export type Category =
  | "medication"
  | "meals"
  | "mobility"
  | "personal_care"
  | "monitoring"
  | "transportation"
  | "appointment"
  | "wound_care"
  | "other";
export type Eligibility = "self" | "family" | "professional" | "unknown";
export type BlockStatus = "available" | "possible" | "unavailable";
export type Consent = "confirmed" | "pending" | "declined";
export type TaskStatus = "covered" | "tentative" | "uncovered" | "professional_review" | "self_managed";
export type Frequency = "daily" | "weekdays" | "weekends" | "specific_days" | "once" | "as_needed";
export type PreferredTime = "morning" | "midday" | "afternoon" | "evening";
export type GapType =
  | "availability"
  | "scheduling_conflict"
  | "capability"
  | "transportation"
  | "workload"
  | "professional"
  | "needs_confirmation";
export type GapStatus = "open" | "acknowledged" | "flagged_for_care_team" | "resolved";

export interface ExtractedTask {
  task_id: string;
  title: string;
  category: Category;
  scheduled_time: string | null;
  frequency: Frequency | null;
  days_of_week: number[];
  date: string | null;
  estimated_duration_minutes: number | null;
  caregiver_required: boolean;
  professional_required: boolean;
  eligibility: Eligibility;
  requires_transport: boolean;
  requires_physical_assist: boolean;
  source_text: string;
  source_page: number | null;
  needs_review: boolean;
  review_notes: string[];
  confirmed: boolean;
}

export interface CareTask {
  task_id: string;
  template_id: string;
  title: string;
  category: Category;
  date: string;
  weekday: number;
  scheduled_time: string | null;
  estimated_duration_minutes: number;
  caregiver_required: boolean;
  professional_required: boolean;
  eligibility: Eligibility;
  requires_transport: boolean;
  requires_physical_assist: boolean;
  source_text: string;
  source_page: number | null;
}

export interface TimeBlock {
  id: string;
  weekday: number;
  start: string;
  end: string;
}
export interface AvailabilityBlock extends TimeBlock {
  status: BlockStatus;
}
export interface Commitment extends TimeBlock {
  label: string;
}

export interface Caregiver {
  id: string;
  name: string;
  relationship: string;
  color: string;
  availability: AvailabilityBlock[];
  preferred_times: PreferredTime[];
  max_hours_per_week: number;
  has_transportation: boolean;
  can_physical_assist: boolean;
  capabilities: Category[];
  commitments: Commitment[];
  consent: Consent;
  active: boolean;
  notes: string;
}

export interface CandidateEvaluation {
  caregiver_id: string;
  caregiver_name: string;
  eligible: boolean;
  tentative: boolean;
  code: string;
  reason: string;
}

export interface Assignment {
  task_id: string;
  status: TaskStatus;
  caregiver_id: string | null;
  caregiver_name: string | null;
  start_time: string | null;
  end_time: string | null;
  explanation: string;
  gap_type: GapType | null;
  pinned: boolean;
  candidates: CandidateEvaluation[];
}

export interface CoverageSummary {
  total: number;
  covered: number;
  tentative: number;
  uncovered: number;
  professional_review: number;
  self_managed: number;
  coverage_percent: number;
}

export interface CaregiverWorkload {
  caregiver_id: string;
  name: string;
  color: string;
  tasks: number;
  tentative_tasks: number;
  minutes: number;
  max_minutes: number;
  utilization_percent: number;
}

export interface ScheduleResult {
  assignments: Assignment[];
  summary: CoverageSummary;
  workload: CaregiverWorkload[];
}

export interface Gap {
  gap_id: string;
  type: GapType;
  task_id: string | null;
  template_id: string | null;
  caregiver_id: string | null;
  title: string;
  date: string | null;
  day_label: string | null;
  time_label: string | null;
  headline: string;
  reason: string;
  details: string[];
  suggested_action: string;
  scheduling_urgency: "high" | "medium" | "low";
  clinical_note: string;
  status: GapStatus;
}

export interface Patient {
  name: string;
  age: number | null;
  situation: string;
  discharge_date: string | null;
  hospital: string;
  synthetic: boolean;
}

export interface CarePlan {
  start_date: string;
  days: number;
  source: string;
  source_name: string;
  extraction_mode: string;
  templates: ExtractedTask[];
}

export interface Workspace {
  patient: Patient;
  plan: CarePlan;
  tasks: CareTask[];
  caregivers: Caregiver[];
  pins: Record<string, string>;
  gap_status: Record<string, GapStatus>;
  is_demo: boolean;
}

export interface AppStateData {
  workspace: Workspace;
  schedule: ScheduleResult;
  gaps: Gap[];
}

export interface ExtractionResult {
  tasks: ExtractedTask[];
  mode: string;
  warnings: string[];
  document: { filename?: string; pages?: number; characters?: number; text?: string } | null;
}

export interface TaskChange {
  task_id: string;
  title: string;
  date: string;
  weekday: number;
  time: string | null;
  before_status: TaskStatus;
  after_status: TaskStatus;
  before_caregiver: string | null;
  after_caregiver: string | null;
  after_explanation: string;
  kind: "resolved" | "regressed" | "reassigned" | "changed";
}

export interface ScenarioResult {
  before: ScheduleResult;
  after: ScheduleResult;
  changes: TaskChange[];
  resolved: number;
  regressed: number;
}

export interface ChatResponse {
  reply: string;
  mode: string;
  facts: string[];
}

export interface Health {
  status: string;
  ai_provider: string | null;
  ai_label: string;
}

export interface Report {
  title: string;
  generated_at: string;
  patient: Patient;
  is_demo: boolean;
  plan: { start: string; end: string; days: number; source: string; extraction_mode: string; instructions: number };
  summary: CoverageSummary;
  workload: CaregiverWorkload[];
  caregivers: { name: string; relationship: string; consent: Consent; active: boolean; capabilities: Category[] }[];
  uncovered: {
    date: string | null;
    day: string | null;
    time: string | null;
    task: string;
    gap_type: string;
    reason: string;
    details: string[];
    action: string;
    status: GapStatus;
  }[];
  coordination_actions: string[];
  clinician_questions: string[];
  disclaimer: string;
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  is_guest: boolean;
}

export interface PatientSummary {
  id: string;
  patient: Patient;
  is_demo: boolean;
  plan_start: string;
  instructions: number;
  caregivers: number;
  summary: CoverageSummary;
}

export interface Me {
  user: User;
  active_patient_id: string | null;
  patients: PatientSummary[];
}

export interface PatientFields {
  name: string;
  age: number | null;
  situation: string;
  discharge_date: string | null;
  hospital: string;
  plan_start_date: string;
}
