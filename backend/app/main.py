"""Invisible Shift API."""
from __future__ import annotations

import logging
import os
import uuid
from pathlib import Path
from typing import Dict, List

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from . import ai, assistant  # noqa: E402
from .db import Store  # noqa: E402
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
    ScenarioRequest,
    ScenarioResult,
    TaskUpdate,
    Workspace,
)
from .plan import expand_templates  # noqa: E402
from .scheduler import check_assignment  # noqa: E402
from .services import build_report, full_state, gaps_for, schedule_for, simulate  # noqa: E402

log = logging.getLogger("invisible_shift")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Invisible Shift API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

_store = Store(os.getenv("DATABASE_URL", f"sqlite:///{Path(__file__).resolve().parent.parent / 'invisible_shift.db'}"))


def get_store() -> Store:
    return _store


def set_store(store: Store) -> None:
    global _store
    _store = store


def load_ws() -> Workspace:
    ws = get_store().load()
    if ws is None:
        ws = demo_workspace()
        get_store().save(ws)
    return ws


def save_ws(ws: Workspace) -> Dict:
    get_store().save(ws)
    return full_state(ws)


# ---------------------------------------------------------------- meta / demo


@app.get("/api/health")
def health():
    return {"status": "ok", "ai_provider": ai.provider(), "ai_label": ai.provider_label()}


@app.get("/api/state")
def state():
    return full_state(load_ws())


@app.get("/api/demo")
def get_demo():
    """Describe the synthetic demo scenario (does not modify state)."""
    ws = demo_workspace()
    return {"patient": ws.patient.model_dump(), "caregivers": [c.name for c in ws.caregivers], "tasks": len(ws.tasks)}


@app.post("/api/demo/reset")
def reset_demo():
    return save_ws(demo_workspace())


@app.post("/api/workspace/blank")
def blank():
    return save_ws(blank_workspace())


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
async def upload(file: UploadFile = File(...)):
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
def extract_text(req: ExtractTextRequest):
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
def confirm_plan(req: ConfirmPlanRequest):
    unconfirmed = [t.title for t in req.templates if not t.confirmed]
    if unconfirmed:
        raise HTTPException(422, f"Every task must be reviewed and confirmed first. Unconfirmed: {', '.join(unconfirmed[:5])}")
    ids = [t.task_id for t in req.templates]
    if len(ids) != len(set(ids)):
        raise HTTPException(422, "Duplicate task ids in plan.")
    ws = load_ws()
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
    return save_ws(ws)


# ---------------------------------------------------------------- tasks


@app.get("/api/tasks", response_model=List[CareTask])
def list_tasks():
    return load_ws().tasks


@app.put("/api/tasks/{task_id}")
def update_task(task_id: str, upd: TaskUpdate):
    ws = load_ws()
    t = next((t for t in ws.tasks if t.task_id == task_id), None)
    if not t:
        raise HTTPException(404, "Task not found")
    data = upd.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(t, k, v)
    return save_ws(ws)


# ---------------------------------------------------------------- caregivers


@app.get("/api/caregivers", response_model=List[Caregiver])
def list_caregivers():
    return load_ws().caregivers


@app.post("/api/caregivers")
def add_caregiver(cg: Caregiver):
    ws = load_ws()
    if not cg.id or any(c.id == cg.id for c in ws.caregivers):
        cg.id = f"cg-{uuid.uuid4().hex[:8]}"
    ws.caregivers.append(cg)
    return save_ws(ws)


@app.put("/api/caregivers/{cg_id}")
def update_caregiver(cg_id: str, cg: Caregiver):
    ws = load_ws()
    idx = next((i for i, c in enumerate(ws.caregivers) if c.id == cg_id), None)
    if idx is None:
        raise HTTPException(404, "Caregiver not found")
    cg.id = cg_id
    ws.caregivers[idx] = cg
    return save_ws(ws)


@app.delete("/api/caregivers/{cg_id}")
def delete_caregiver(cg_id: str):
    ws = load_ws()
    if not any(c.id == cg_id for c in ws.caregivers):
        raise HTTPException(404, "Caregiver not found")
    ws.caregivers = [c for c in ws.caregivers if c.id != cg_id]
    ws.pins = {k: v for k, v in ws.pins.items() if v != cg_id}
    return save_ws(ws)


# ---------------------------------------------------------------- schedule


@app.post("/api/schedule/generate")
def generate():
    return full_state(load_ws())


@app.get("/api/schedule")
def get_schedule():
    return schedule_for(load_ws())


@app.post("/api/schedule/assign")
def manual_assign(req: AssignRequest):
    ws = load_ws()
    task = next((t for t in ws.tasks if t.task_id == req.task_id), None)
    cg = next((c for c in ws.caregivers if c.id == req.caregiver_id), None)
    if not task or not cg:
        raise HTTPException(404, "Task or caregiver not found")
    pins = {k: v for k, v in ws.pins.items() if k != task.task_id}
    ev = check_assignment(task, cg, ws.tasks, ws.caregivers, pins)
    if not ev.eligible:
        return JSONResponse(status_code=409, content={"detail": ev.reason, "code": ev.code})
    ws.pins = {**pins, task.task_id: cg.id}
    return save_ws(ws)


@app.delete("/api/schedule/assign/{task_id}")
def clear_assign(task_id: str):
    ws = load_ws()
    ws.pins.pop(task_id, None)
    return save_ws(ws)


# ---------------------------------------------------------------- gaps


@app.get("/api/gaps")
def get_gaps():
    return gaps_for(load_ws())


@app.put("/api/gaps/{gap_id:path}")
def set_gap_status(gap_id: str, upd: GapStatusUpdate):
    ws = load_ws()
    ws.gap_status[gap_id] = upd.status
    return save_ws(ws)


# ---------------------------------------------------------------- scenarios


@app.post("/api/scenarios/simulate", response_model=ScenarioResult)
def scenario_simulate(req: ScenarioRequest):
    return simulate(load_ws(), req.caregivers)


@app.post("/api/scenarios/apply")
def scenario_apply(req: ScenarioRequest):
    ws = load_ws()
    ws.caregivers = req.caregivers
    ids = {c.id for c in req.caregivers}
    ws.pins = {k: v for k, v in ws.pins.items() if v in ids}
    return save_ws(ws)


# ---------------------------------------------------------------- assistant & report


@app.post("/api/assistant/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    ws = load_ws()
    sched = schedule_for(ws)
    return assistant.chat(req, ws, sched, gaps_for(ws))


@app.get("/api/report")
def report():
    return build_report(load_ws())


# ---------------------------------------------------------------- static frontend (production build)

_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        f = _dist / full_path
        if full_path and f.is_file():
            return FileResponse(f)
        return FileResponse(_dist / "index.html")
