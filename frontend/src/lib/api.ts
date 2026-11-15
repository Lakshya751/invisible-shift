import type {
  AppStateData,
  Caregiver,
  ChatResponse,
  ExtractedTask,
  ExtractionResult,
  GapStatus,
  Health,
  Me,
  PatientFields,
  Report,
  ScenarioResult,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...(init?.headers || {}) },
    });
  } catch {
    throw new ApiError(0, "Cannot reach the Invisible Shift API. Is the backend running on port 8000?");
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") msg = body.detail;
      else if (Array.isArray(body.detail))
        msg = body.detail.map((d: { loc?: string[]; msg: string }) => `${(d.loc || []).slice(-1)[0] ?? ""}: ${d.msg}`).join("; ");
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) => req<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const put = <T>(path: string, body: unknown) => req<T>(path, { method: "PUT", body: JSON.stringify(body) });

export const api = {
  health: () => req<Health>("/health"),
  state: () => req<AppStateData>("/state"),
  resetDemo: () => post<AppStateData>("/demo/reset"),
  // auth
  me: () => req<Me>("/auth/me"),
  signup: (name: string, email: string, password: string) => post<Me>("/auth/signup", { name, email, password }),
  login: (email: string, password: string) => post<Me>("/auth/login", { email, password }),
  logout: () => post<{ ok: boolean }>("/auth/logout"),
  launchDemo: () => post<Me>("/demo/launch"),
  // patients
  addPatient: (patient: PatientFields) => post<Me>("/patients", { template: "blank", patient }),
  addDemoPatient: () => post<Me>("/patients", { template: "demo" }),
  updatePatient: (id: string, patient: PatientFields) => put<Me>(`/patients/${id}`, patient),
  deletePatient: (id: string) => req<Me>(`/patients/${id}`, { method: "DELETE" }),
  selectPatient: (id: string) => post<Me>(`/patients/${id}/select`),
  sample: () => req<ExtractionResult>("/discharge/sample"),
  upload: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return req<ExtractionResult>("/discharge/upload", { method: "POST", body: fd });
  },
  extractText: (text: string) => post<ExtractionResult>("/discharge/extract", { text }),
  confirmPlan: (templates: ExtractedTask[], meta: { source: string; source_name: string; extraction_mode: string }) =>
    post<AppStateData>("/discharge/confirm", { templates, ...meta }),
  addCaregiver: (cg: Caregiver) => post<AppStateData>("/caregivers", cg),
  updateCaregiver: (cg: Caregiver) => put<AppStateData>(`/caregivers/${cg.id}`, cg),
  deleteCaregiver: (id: string) => req<AppStateData>(`/caregivers/${id}`, { method: "DELETE" }),
  assign: (task_id: string, caregiver_id: string) => post<AppStateData>("/schedule/assign", { task_id, caregiver_id }),
  unassign: (task_id: string) => req<AppStateData>(`/schedule/assign/${task_id}`, { method: "DELETE" }),
  setGapStatus: (gap_id: string, status: GapStatus) => put<AppStateData>(`/gaps/${encodeURIComponent(gap_id)}`, { status }),
  simulate: (caregivers: Caregiver[]) => post<ScenarioResult>("/scenarios/simulate", { caregivers }),
  applyScenario: (caregivers: Caregiver[]) => post<AppStateData>("/scenarios/apply", { caregivers }),
  chat: (message: string, history: { role: "user" | "assistant"; content: string }[]) =>
    post<ChatResponse>("/assistant/chat", { message, history }),
  report: () => req<Report>("/report"),
};
