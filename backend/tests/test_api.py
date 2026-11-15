"""API, simulation, AI-handling and upload tests (no AI key required)."""
import json

import pytest

from app import ai
from app.extraction import sample_pdf_bytes


def _maya_wed(caregivers):
    for c in caregivers:
        if c["id"] == "maya":
            c["availability"].append({"id": "maya-wed-eve", "weekday": 2, "start": "19:45", "end": "20:30", "status": "available"})
    return caregivers


def test_demo_loads_without_ai_key(client):
    r = client.get("/api/health").json()
    assert r["ai_provider"] is None
    st = client.post("/api/demo/reset").json()
    s = st["schedule"]["summary"]
    assert (s["total"], s["covered"], s["uncovered"], s["coverage_percent"]) == (28, 21, 7, 75.0)
    assert len([g for g in st["gaps"] if g["task_id"]]) == 7


def test_simulation_is_isolated_and_improves_to_22(client):
    st = client.post("/api/demo/reset").json()
    cgs = _maya_wed(st["workspace"]["caregivers"])
    sim = client.post("/api/scenarios/simulate", json={"caregivers": cgs}).json()
    assert sim["before"]["summary"]["covered"] == 21
    assert sim["after"]["summary"]["covered"] == 22
    assert sim["after"]["summary"]["uncovered"] == 6
    assert sim["after"]["summary"]["coverage_percent"] == 78.6
    assert sim["resolved"] == 1 and sim["regressed"] == 0
    (chg,) = sim["changes"]
    assert chg["task_id"] == "dressing-eve-2026-11-18"
    assert chg["before_status"] == "uncovered" and chg["after_status"] == "covered"
    assert chg["after_caregiver"] == "Maya Wilson"
    # Original schedule unchanged before apply
    assert client.get("/api/state").json()["schedule"]["summary"]["covered"] == 21
    # Apply persists
    applied = client.post("/api/scenarios/apply", json={"caregivers": cgs}).json()
    assert applied["schedule"]["summary"]["covered"] == 22
    assert client.get("/api/state").json()["schedule"]["summary"]["covered"] == 22


def test_simulation_remove_caregiver_regresses(client):
    st = client.post("/api/demo/reset").json()
    cgs = [c for c in st["workspace"]["caregivers"] if c["id"] != "daniel"]
    sim = client.post("/api/scenarios/simulate", json={"caregivers": cgs}).json()
    assert sim["after"]["summary"]["covered"] == 14
    assert sim["regressed"] == 7


def test_new_helper_without_consent_is_only_tentative(client):
    st = client.post("/api/demo/reset").json()
    cgs = st["workspace"]["caregivers"]
    cgs.append(
        {
            "id": "helper",
            "name": "Lunch helper",
            "consent": "pending",
            "capabilities": ["meals"],
            "max_hours_per_week": 5,
            "availability": [{"id": f"h{d}", "weekday": d, "start": "11:30", "end": "13:00"} for d in range(5)],
        }
    )
    sim = client.post("/api/scenarios/simulate", json={"caregivers": cgs}).json()
    a = sim["after"]["summary"]
    assert a["covered"] == 21 and a["tentative"] == 5 and a["uncovered"] == 2


def test_manual_assignment_conflict_explained(client):
    client.post("/api/demo/reset")
    r = client.post("/api/schedule/assign", json={"task_id": "meal-noon-2026-11-18", "caregiver_id": "daniel"})
    assert r.status_code == 409
    assert "not approved for meal assistance" in r.json()["detail"]
    r2 = client.post("/api/schedule/assign", json={"task_id": "meal-noon-2026-11-18", "caregiver_id": "maya"})
    assert r2.status_code == 409 and "Work (office)" in r2.json()["detail"]


def test_gap_status_update(client):
    st = client.post("/api/demo/reset").json()
    gid = next(g["gap_id"] for g in st["gaps"] if g["task_id"])
    out = client.put(f"/api/gaps/{gid}", json={"status": "flagged_for_care_team"}).json()
    assert next(g for g in out["gaps"] if g["gap_id"] == gid)["status"] == "flagged_for_care_team"
    rep = client.get("/api/report").json()
    assert any(q.startswith("Flagged by family") for q in rep["clinician_questions"])


def test_report_contents(client):
    client.post("/api/demo/reset")
    rep = client.get("/api/report").json()
    assert rep["title"] == "Invisible Shift — Home Care Coverage Assessment"
    assert rep["summary"]["covered"] == 21 and len(rep["uncovered"]) == 7
    assert "does not establish medical readiness" in rep["disclaimer"]
    assert rep["plan"]["start"] == "2026-11-16" and rep["plan"]["end"] == "2026-11-22"
    blob = json.dumps(rep).lower()
    assert "safe to discharge" not in blob and "unsafe" not in blob


def test_assistant_deterministic_answers(client):
    client.post("/api/demo/reset")
    why = client.post("/api/assistant/chat", json={"message": "Why are seven tasks uncovered?"}).json()
    assert why["mode"] == "deterministic"
    assert "7 tasks are uncovered" in why["reply"] and "meal assistance" in why["reply"].lower()
    best = client.post("/api/assistant/chat", json={"message": "What would help the most?"}).json()
    assert "5 of the 7" in best["reply"]
    med = client.post("/api/assistant/chat", json={"message": "Can we move the medication time?"}).json()
    assert "pharmacist or treating clinician" in med["reply"]


def test_confirm_requires_review(client):
    client.post("/api/demo/reset")
    sample = client.get("/api/discharge/sample").json()["tasks"]
    sample[0]["confirmed"] = False
    r = client.post("/api/discharge/confirm", json={"templates": sample})
    assert r.status_code == 422


def test_upload_sample_pdf_and_confirm(client):
    client.post("/api/demo/reset")
    r = client.post("/api/discharge/upload", files={"file": ("d.pdf", sample_pdf_bytes(), "application/pdf")})
    assert r.status_code == 200
    body = r.json()
    assert body["mode"] == "rules"
    cats = [t["category"] for t in body["tasks"]]
    assert cats.count("wound_care") == 1
    wound = next(t for t in body["tasks"] if t["category"] == "wound_care")
    assert wound["professional_required"] and wound["eligibility"] == "professional"
    for t in body["tasks"]:
        t["confirmed"] = True
        t["estimated_duration_minutes"] = t["estimated_duration_minutes"] or 30
    st = client.post("/api/discharge/confirm", json={"templates": body["tasks"], "source": "upload"}).json()
    s = st["schedule"]["summary"]
    # 28 core + 2 nurse-only dressing changes (professional review) + 1 appointment + self-managed shower
    assert s["professional_review"] == 2
    assert s["total"] >= 31


def test_invalid_uploads(client):
    r = client.post("/api/discharge/upload", files={"file": ("x.txt", b"hello", "text/plain")})
    assert r.status_code == 415
    r = client.post("/api/discharge/upload", files={"file": ("x.pdf", b"not a pdf at all", "application/pdf")})
    assert r.status_code == 422 and "not a PDF" in r.json()["detail"]
    r = client.post("/api/discharge/upload", files={"file": ("x.pdf", b"", "application/pdf")})
    assert r.status_code == 422
    r = client.post("/api/discharge/upload", files={"file": ("x.pdf", b"%PDF-1.4 garbage", "application/pdf")})
    assert r.status_code == 422


def test_validation_errors(client):
    r = client.post("/api/caregivers", json={"id": "x", "name": "X", "availability": [{"id": "a", "weekday": 0, "start": "10:00", "end": "09:00"}]})
    assert r.status_code == 422
    r = client.put("/api/tasks/nope", json={"title": "x"})
    assert r.status_code == 404


# ------------------------------------------------------------------ AI handling


def test_malformed_ai_output_rejected():
    with pytest.raises(ai.AIOutputError):
        ai.parse_extraction("this is not json")
    with pytest.raises(ai.AIOutputError):
        ai.parse_extraction('{"items": 3}')
    with pytest.raises(ai.AIOutputError):
        ai.parse_extraction('{"tasks": [{"title": "", "scheduled_time": "25:99"}]}')
    ok = ai.parse_extraction('```json\n{"tasks": [{"title": "Walk", "category": "bogus", "scheduled_time": "8:00"}]}\n```')
    assert ok[0].category == "other" and ok[0].scheduled_time == "08:00"


def test_ai_retries_then_succeeds(monkeypatch):
    calls = []

    def fake(system, user, json_mode=False, timeout=45):
        calls.append(user)
        if len(calls) == 1:
            return "oops"
        return json.dumps({"tasks": [{"title": "Medication reminder", "category": "medication", "scheduled_time": "08:00",
                                      "frequency": "daily", "estimated_duration_minutes": 15,
                                      "source_text": "Medications at 8:00 AM daily", "source_page": 1}]})

    monkeypatch.setattr(ai, "complete", fake)
    tasks, warnings = ai.ai_extract("[Page 1]\nMedications at 8:00 AM daily")
    assert len(calls) == 2 and "rejected" in calls[1]
    assert tasks[0].scheduled_time == "08:00" and not tasks[0].confirmed
    assert warnings


def test_grounding_flags_invented_details():
    from app.models import ExtractedTask

    t = ExtractedTask(task_id="t", title="Medication reminder", category="medication", scheduled_time="09:00",
                      frequency="daily", estimated_duration_minutes=10, source_text="Take medications daily")
    (g,) = ai.ground_tasks([t], "[Page 1]\nTake medications daily")
    assert g.needs_review and any("09:00" in n for n in g.review_notes)


def test_unavailable_ai_falls_back_to_rules(client, monkeypatch):
    monkeypatch.setattr(ai, "provider", lambda: "openai")

    def boom(*a, **k):
        raise ai.AIUnavailableError("openai request failed: ConnectError")

    monkeypatch.setattr(ai, "complete", boom)
    r = client.post("/api/discharge/extract", json={"text": "Lunch at 12:00 PM daily. A caregiver should help prepare a meal."})
    body = r.json()
    assert r.status_code == 200 and body["mode"] == "rules"
    assert any("AI extraction failed" in w for w in body["warnings"])
    assert body["tasks"][0]["category"] == "meals"
    chat = client.post("/api/assistant/chat", json={"message": "Why are tasks uncovered?"}).json()
    assert chat["mode"] == "deterministic"
