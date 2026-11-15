"""Invisible Shift API."""
from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Annotated, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from . import ai, assistant  # noqa: E402
from .auth import COOKIE_NAME, AuthContext, cookie_secure, hash_password, verify_password  # noqa: E402
from .db import SESSION_DAYS, Store  # noqa: E402
from .demo import blank_workspace, demo_templates, demo_workspace  # noqa: E402
from .extraction import InvalidUpload, pdf_to_text, rule_extract, sample_pdf_bytes  # noqa: E402
from .models import (  # noqa: E402
    AssignRequest,
    Caregiver,
    CareTask,
    ChatRequest,
    ChatResponse,
    ConfirmPlanRequest,
    ExtractionResult,
    ExtractTextRequest,
    GapStatusUpdate,
    LoginRequest,
    Patient,
    PatientCreate,
    PatientFields,
    ScenarioRequest,
    ScenarioResult,
    SignupRequest,
    TaskUpdate,
    Workspace,
)
from .plan import expand_templates  # noqa: E402
from .scheduler import check_assignment  # noqa: E402
from .services import build_report, full_state, gaps_for, schedule_for, simulate  # noqa: E402

log = logging.getLogger("invisible_shift")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Invisible Shift API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_store = Store(os.getenv("DATABASE_URL", f"sqlite:///{Path(__file__).resolve().parent.parent / 'invisible_shift.db'}"))


def get_store() -> Store:
    return _store


def set_store(store: Store) -> None:
    global _store
    _store = store


# ---------------------------------------------------------------- auth plumbing


def _optional_auth(request: Request) -> Optional[AuthContext]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    sess = get_store().get_session(token)
    if sess is None:
        return None
    user = get_store().get_user(sess.user_id)
    if user is None:
        return None
    return AuthContext(token=token, user_id=user.id, user_name=user.name, is_guest=user.is_guest, active_patient_id=sess.active_patient_id)


def auth_ctx(request: Request) -> AuthContext:
    ctx = _optional_auth(request)
    if ctx is None:
        raise HTTPException(401, "Please sign in.")
    return ctx


def patient_ctx(ctx: AuthContext = Depends(auth_ctx)) -> AuthContext:
    if not ctx.active_patient_id or get_store().load(ctx.user_id, ctx.active_patient_id) is None:
        raise HTTPException(409, "No patient selected. Choose or add a patient first.")
    return ctx


Auth = Annotated[AuthContext, Depends(auth_ctx)]
PCtx = Annotated[AuthContext, Depends(patient_ctx)]


def _set_cookie(resp: Response, token: str) -> None:
    resp.set_cookie(
        COOKIE_NAME,
        token,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=cookie_secure(),
        path="/",
    )


def load_ws(ctx: AuthContext) -> Workspace:
    ws = get_store().load(ctx.user_id, ctx.active_patient_id or "")
    if ws is None:
        raise HTTPException(409, "No patient selected. Choose or add a patient first.")
    return ws


def save_ws(ctx: AuthContext, ws: Workspace) -> Dict:
    get_store().save(ctx.user_id, ctx.active_patient_id or "", ws)
    return full_state(ws)


def _patient_summary(pid: str, ws: Workspace) -> Dict:
    s = schedule_for(ws).summary
    return {
        "id": pid,
        "patient": ws.patient.model_dump(),
        "is_demo": ws.is_demo,
        "plan_start": ws.plan.start_date,
        "instructions": len(ws.plan.templates),
        "caregivers": len([c for c in ws.caregivers if c.active]),
        "summary": s.model_dump(),
    }


def _me(user_id: str, active: Optional[str]) -> Dict:
    store = get_store()
    user = store.get_user(user_id)
    assert user is not None
    patients = []
    for row in store.list_patients(user_id):
        ws = Workspace.model_validate_json(row.data)
        patients.append(_patient_summary(row.id, ws))
    if active and not any(p["id"] == active for p in patients):
        active = None
    return {
        "user": {"id": user.id, "name": user.name, "email": user.email, "is_guest": user.is_guest},
        "active_patient_id": active,
        "patients": patients,
    }


def _launch_demo_for(user_id: str) -> str:
    """Reset (or create) this user's demo patient and return its id."""
    store = get_store()
    for row in store.list_patients(user_id):
        if Workspace.model_validate_json(row.data).is_demo:
            store.save(user_id, row.id, demo_workspace())
            return row.id
    return store.create_patient(user_id, demo_workspace())


# ---------------------------------------------------------------- meta


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_provider": ai.provider(), "ai_label": ai.provider_label()}


# ---------------------------------------------------------------- auth


@app.get("/api/auth/me")
def me(ctx: Auth):
    return _me(ctx.user_id, ctx.active_patient_id)


@app.post("/api/auth/signup")
def signup(req: SignupRequest, request: Request, response: Response):
    store = get_store()
    if store.get_user_by_email(req.email):
        raise HTTPException(409, "An account with this email already exists. Try signing in.")
    current = _optional_auth(request)
    if current and current.is_guest:
        # Keep the guest's patients: upgrade the guest account in place.
        store.upgrade_guest(current.user_id, req.name, req.email, hash_password(req.password))
        return _me(current.user_id, current.active_patient_id)
    user = store.create_user(req.name, req.email, hash_password(req.password))
    token = store.create_session(user.id)
    _set_cookie(response, token)
    return _me(user.id, None)


@app.post("/api/auth/login")
def login(req: LoginRequest, response: Response):
    store = get_store()
    user = store.get_user_by_email(req.email.strip().lower())
    if user is None or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password.")
    rows = store.list_patients(user.id)
    token = store.create_session(user.id, rows[0].id if len(rows) == 1 else None)
    _set_cookie(response, token)
    return _me(user.id, rows[0].id if len(rows) == 1 else None)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        get_store().delete_session(token)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


# ---------------------------------------------------------------- demo


@app.post("/api/demo/launch")
def launch_demo(request: Request, response: Response):
    """Judge-friendly entry point: no account needed. Creates a temporary guest
    session if necessary, then loads a fresh fictional demo patient."""
    store = get_store()
    ctx = _optional_auth(request)
    if ctx is None:
        user = store.create_user("Guest", None, None, is_guest=True)
        pid = _launch_demo_for(user.id)
        token = store.create_session(user.id, pid)
        _set_cookie(response, token)
        return _me(user.id, pid)
    pid = _launch_demo_for(ctx.user_id)
    store.set_active_patient(ctx.token, pid)
    return _me(ctx.user_id, pid)


@app.get("/api/demo")
def get_demo():
    """Describe the synthetic demo scenario (does not modify state)."""
    ws = demo_workspace()
    return {"patient": ws.patient.model_dump(), "caregivers": [c.name for c in ws.caregivers], "tasks": len(ws.tasks)}


@app.post("/api/demo/reset")
def reset_demo(ctx: PCtx):
    if not load_ws(ctx).is_demo:
        raise HTTPException(400, "Only the fictional demo patient can be reset.")
    return save_ws(ctx, demo_workspace())


# ---------------------------------------------------------------- patients


@app.get("/api/patients")
def list_patients(ctx: Auth):
    return _me(ctx.user_id, ctx.active_patient_id)["patients"]


@app.post("/api/patients")
def create_patient(req: PatientCreate, ctx: Auth):
    store = get_store()
    if req.template == "demo":
        pid = _launch_demo_for(ctx.user_id)
    else:
        f = req.patient
        assert f is not None
        ws = blank_workspace(
            Patient(name=f.name, age=f.age, situation=f.situation, discharge_date=f.discharge_date, hospital=f.hospital, synthetic=False),
            f.plan_start_date,
        )
        pid = store.create_patient(ctx.user_id, ws)
    store.set_active_patient(ctx.token, pid)
    return _me(ctx.user_id, pid)


@app.put("/api/patients/{patient_id}")
def update_patient(patient_id: str, f: PatientFields, ctx: Auth):
    store = get_store()
    ws = store.load(ctx.user_id, patient_id)
    if ws is None:
        raise HTTPException(404, "Patient not found")
    ws.patient = Patient(
        name=f.name, age=f.age, situation=f.situation, discharge_date=f.discharge_date, hospital=f.hospital, synthetic=ws.patient.synthetic
    )
    if f.plan_start_date != ws.plan.start_date:
        # Re-date the confirmed plan; clinical content and times are unchanged.
        ws.plan.start_date = f.plan_start_date
        ws.tasks = expand_templates(ws.plan.templates, f.plan_start_date, ws.plan.days)
        ws.pins = {}
        ws.gap_status = {}
    store.save(ctx.user_id, patient_id, ws)
    return _me(ctx.user_id, ctx.active_patient_id)


@app.delete("/api/patients/{patient_id}")
def delete_patient(patient_id: str, ctx: Auth):
    if not get_store().delete_patient(ctx.user_id, patient_id):
        raise HTTPException(404, "Patient not found")
    active = ctx.active_patient_id
    if active == patient_id:
        active = None
        get_store().set_active_patient(ctx.token, None)
    return _me(ctx.user_id, active)


@app.post("/api/patients/{patient_id}/select")
def select_patient(patient_id: str, ctx: Auth):
    if get_store().load(ctx.user_id, patient_id) is None:
        raise HTTPException(404, "Patient not found")
    get_store().set_active_patient(ctx.token, patient_id)
    return _me(ctx.user_id, patient_id)


# ---------------------------------------------------------------- active-patient state


@app.get("/api/state")
def state(ctx: PCtx):
    return full_state(load_ws(ctx))


# ---------------------------------------------------------------- discharge


def _extract(text: str) -> ExtractionResult:
    warnings: List[str] = []
    if ai.provider():
        try:
            tasks, w = ai.ai_extract(text)
            return ExtractionResult(tasks=tasks, mode=f"ai:{ai.provider()}", warnings=w)
        except (ai.AIUnavailableError, ai.AIOutputError) as exc:
            log.warning("AI extraction failed, falling back to rules: %s", type(exc).__name__)
            warnings.append(f"AI extraction failed ({exc}). Used the rule-based parser instead — review carefully.")
    tasks = ai.ground_tasks(rule_extract(text), text)
    if not tasks:
        warnings.append("No actionable care instructions were recognised. Add tasks manually or paste clearer text.")
    return ExtractionResult(tasks=tasks, mode="rules", warnings=warnings)


@app.post("/api/discharge/upload", response_model=ExtractionResult)
async def upload(ctx: Auth, file: UploadFile = File(...)):
    name = file.filename or "upload"
    if not name.lower().endswith(".pdf") and file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(415, "Unsupported file type. Please upload a PDF.")
    data = await file.read()
    try:
        text, pages = pdf_to_text(data)
    except InvalidUpload as exc:
        raise HTTPException(422, str(exc))
    res = _extract(text)
    res.document = {"filename": name, "pages": pages, "characters": len(text), "text": text[:20000]}
    return res


@app.post("/api/discharge/extract", response_model=ExtractionResult)
def extract_text(req: ExtractTextRequest, ctx: Auth):
    text = req.text if "[Page" in req.text else "[Page 1]\n" + req.text
    res = _extract(text)
    res.document = {"filename": "Pasted text", "pages": text.count("[Page"), "characters": len(text), "text": text[:20000]}
    return res


@app.get("/api/discharge/sample", response_model=ExtractionResult)
def sample_plan():
    return ExtractionResult(
        tasks=demo_templates(),
        mode="sample",
        warnings=["Synthetic sample plan for the fictional patient Robert Wilson."],
        document={"filename": "Riverside General — Discharge Instructions (synthetic)", "pages": 2},
    )


@app.get("/api/discharge/sample.pdf")
def sample_pdf():
    return Response(
        sample_pdf_bytes(),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="sample-discharge-robert-wilson-SYNTHETIC.pdf"'},
    )


@app.post("/api/discharge/confirm")
def confirm_plan(req: ConfirmPlanRequest, ctx: PCtx):
    unconfirmed = [t.title for t in req.templates if not t.confirmed]
    if unconfirmed:
        raise HTTPException(422, f"Every task must be reviewed and confirmed first. Unconfirmed: {', '.join(unconfirmed[:5])}")
    ids = [t.task_id for t in req.templates]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Duplicate task ids in plan.")
    ws = load_ws(ctx)
    start = req.start_date or ws.plan.start_date
    ws.plan.templates = req.templates
    ws.plan.start_date = start
    ws.plan.source = req.source
    ws.plan.source_name = req.source_name
    ws.plan.extraction_mode = req.extraction_mode
    ws.tasks = expand_templates(req.templates, start, ws.plan.days)
    ws.pins = {}
    ws.gap_status = {}
    if req.source != "sample":
        ws.is_demo = False
    return save_ws(ctx, ws)


# ---------------------------------------------------------------- tasks


@app.get("/api/tasks", response_model=List[CareTask])
def list_tasks(ctx: PCtx):
    return load_ws(ctx).tasks


@app.put("/api/tasks/{task_id}")
def update_task(task_id: str, upd: TaskUpdate, ctx: PCtx):
    ws = load_ws(ctx)
    t = next((t for t in ws.tasks if t.task_id == task_id), None)
    if not t:
        raise HTTPException(404, "Task not found")
    for k, v in upd.model_dump(exclude_unset=True).items():
        setattr(t, k, v)
    return save_ws(ctx, ws)


# ---------------------------------------------------------------- caregivers


@app.get("/api/caregivers", response_model=List[Caregiver])
def list_caregivers(ctx: PCtx):
    return load_ws(ctx).caregivers


@app.post("/api/caregivers")
def add_caregiver(cg: Caregiver, ctx: PCtx):
    ws = load_ws(ctx)
    if not cg.id or any(c.id == cg.id for c in ws.caregivers):
        cg.id = f"cg-{uuid.uuid4().hex[:8]}"
    ws.caregivers.append(cg)
    return save_ws(ctx, ws)


@app.put("/api/caregivers/{cg_id}")
def update_caregiver(cg_id: str, cg: Caregiver, ctx: PCtx):
    ws = load_ws(ctx)
    idx = next((i for i, c in enumerate(ws.caregivers) if c.id == cg_id), None)
    if idx is None:
        raise HTTPException(404, "Caregiver not found")
    cg.id = cg_id
    ws.caregivers[idx] = cg
    return save_ws(ctx, ws)


@app.delete("/api/caregivers/{cg_id}")
def delete_caregiver(cg_id: str, ctx: PCtx):
    ws = load_ws(ctx)
    if not any(c.id == cg_id for c in ws.caregivers):
        raise HTTPException(404, "Caregiver not found")
    ws.caregivers = [c for c in ws.caregivers if c.id != cg_id]
    ws.pins = {k: v for k, v in ws.pins.items() if v != cg_id}
    return save_ws(ctx, ws)


# ---------------------------------------------------------------- schedule


@app.post("/api/schedule/generate")
def generate(ctx: PCtx):
    return full_state(load_ws(ctx))


@app.get("/api/schedule")
def get_schedule(ctx: PCtx):
    return schedule_for(load_ws(ctx))


@app.post("/api/schedule/assign")
def manual_assign(req: AssignRequest, ctx: PCtx):
    ws = load_ws(ctx)
    task = next((t for t in ws.tasks if t.task_id == req.task_id), None)
    cg = next((c for c in ws.caregivers if c.id == req.caregiver_id), None)
    if not task or not cg:
        raise HTTPException(404, "Task or caregiver not found")
    pins = {k: v for k, v in ws.pins.items() if k != task.task_id}
    ev = check_assignment(task, cg, ws.tasks, ws.caregivers, pins)
    if not ev.eligible:
        return JSONResponse(status_code=409, content={"detail": ev.reason, "code": ev.code})
    ws.pins = {**pins, task.task_id: cg.id}
    return save_ws(ctx, ws)


@app.delete("/api/schedule/assign/{task_id}")
def clear_assign(task_id: str, ctx: PCtx):
    ws = load_ws(ctx)
    ws.pins.pop(task_id, None)
    return save_ws(ctx, ws)


# ---------------------------------------------------------------- gaps


@app.get("/api/gaps")
def get_gaps(ctx: PCtx):
    return gaps_for(load_ws(ctx))


@app.put("/api/gaps/{gap_id:path}")
def set_gap_status(gap_id: str, upd: GapStatusUpdate, ctx: PCtx):
    ws = load_ws(ctx)
    ws.gap_status[gap_id] = upd.status
    return save_ws(ctx, ws)


# ---------------------------------------------------------------- scenarios


@app.post("/api/scenarios/simulate", response_model=ScenarioResult)
def scenario_simulate(req: ScenarioRequest, ctx: PCtx):
    return simulate(load_ws(ctx), req.caregivers)


@app.post("/api/scenarios/apply")
def scenario_apply(req: ScenarioRequest, ctx: PCtx):
    ws = load_ws(ctx)
    ws.caregivers = req.caregivers
    ids = {c.id for c in req.caregivers}
    ws.pins = {k: v for k, v in ws.pins.items() if v in ids}
    return save_ws(ctx, ws)


# ---------------------------------------------------------------- assistant & report


@app.post("/api/assistant/chat", response_model=ChatResponse)
def chat(req: ChatRequest, ctx: PCtx):
    ws = load_ws(ctx)
    return assistant.chat(req, ws, schedule_for(ws), gaps_for(ws))


@app.get("/api/report")
def report(ctx: PCtx):
    return build_report(load_ws(ctx))


# ---------------------------------------------------------------- static frontend (production build)

_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        f = _dist / full_path
        if full_path and f.is_file():
            return FileResponse(f)
        return FileResponse(_dist / "index.html")
