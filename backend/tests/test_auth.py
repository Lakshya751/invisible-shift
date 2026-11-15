"""Accounts, sessions, patient management and per-user isolation."""
from fastapi.testclient import TestClient

from app import main
from app.auth import hash_password, verify_password

NEW = {"template": "blank", "patient": {"name": "Ana Lopez", "age": 81, "situation": "Hip replacement", "plan_start_date": "2026-11-23"}}


def _signup(c, email="pat@example.com", pw="correct-horse", name="Pat"):
    return c.post("/api/auth/signup", json={"name": name, "email": email, "password": pw})


def test_password_hashing():
    h = hash_password("s3cret-pass")
    assert h.startswith("pbkdf2_sha256$") and "s3cret-pass" not in h
    assert verify_password("s3cret-pass", h)
    assert not verify_password("wrong", h)
    assert not verify_password("x", None)


def test_unauthenticated_requests_rejected(anon):
    assert anon.get("/api/auth/me").status_code == 401
    assert anon.get("/api/state").status_code == 401
    assert anon.post("/api/assistant/chat", json={"message": "hi"}).status_code == 401
    assert anon.get("/api/health").status_code == 200  # public


def test_signup_login_logout(anon):
    r = _signup(anon)
    assert r.status_code == 200
    me = r.json()
    assert me["user"]["email"] == "pat@example.com" and me["patients"] == [] and me["active_patient_id"] is None
    # signed in but no patient yet
    assert anon.get("/api/state").status_code == 409
    assert anon.post("/api/auth/logout").status_code == 200
    assert anon.get("/api/auth/me").status_code == 401
    # wrong password, then right one
    assert anon.post("/api/auth/login", json={"email": "pat@example.com", "password": "nope-nope"}).status_code == 401
    r = anon.post("/api/auth/login", json={"email": "PAT@example.com", "password": "correct-horse"})
    assert r.status_code == 200 and r.json()["user"]["name"] == "Pat"


def test_signup_validation(anon):
    assert _signup(anon, pw="short").status_code == 422
    assert _signup(anon, email="not-an-email").status_code == 422
    assert _signup(anon).status_code == 200
    anon.post("/api/auth/logout")
    assert _signup(anon).status_code == 409  # duplicate email


def test_add_select_edit_delete_patients(anon):
    _signup(anon)
    me = anon.post("/api/patients", json=NEW).json()
    ana = me["active_patient_id"]
    assert me["patients"][0]["patient"]["name"] == "Ana Lopez"
    st = anon.get("/api/state").json()
    assert st["workspace"]["patient"]["age"] == 81 and st["schedule"]["summary"]["total"] == 0
    assert st["workspace"]["plan"]["start_date"] == "2026-11-23"

    me = anon.post("/api/patients", json={"template": "demo"}).json()
    demo = me["active_patient_id"]
    assert demo != ana and len(me["patients"]) == 2
    assert anon.get("/api/state").json()["schedule"]["summary"]["covered"] == 21

    # switching patients switches all data
    anon.post(f"/api/patients/{ana}/select")
    assert anon.get("/api/state").json()["workspace"]["patient"]["name"] == "Ana Lopez"

    # edit details; changing plan start re-dates tasks of the demo patient
    upd = {"name": "Robert Wilson", "age": 72, "plan_start_date": "2026-11-30"}
    anon.put(f"/api/patients/{demo}", json=upd)
    anon.post(f"/api/patients/{demo}/select")
    st = anon.get("/api/state").json()
    assert st["workspace"]["tasks"][0]["date"] == "2026-11-30"
    assert st["schedule"]["summary"]["covered"] == 21  # same weekdays → same coverage

    me = anon.delete(f"/api/patients/{demo}").json()
    assert me["active_patient_id"] is None and len(me["patients"]) == 1
    assert anon.get("/api/state").status_code == 409


def test_patient_validation(anon):
    _signup(anon)
    assert anon.post("/api/patients", json={"template": "blank"}).status_code == 422
    bad = {"template": "blank", "patient": {"name": " ", "plan_start_date": "2026-11-23"}}
    assert anon.post("/api/patients", json=bad).status_code == 422


def test_users_cannot_see_each_others_patients(anon):
    _signup(anon, email="a@example.com")
    pid = anon.post("/api/patients", json=NEW).json()["active_patient_id"]
    other = TestClient(main.app)
    _signup(other, email="b@example.com")
    assert other.get("/api/patients").json() == []
    assert other.post(f"/api/patients/{pid}/select").status_code == 404
    assert other.delete(f"/api/patients/{pid}").status_code == 404
    assert other.put(f"/api/patients/{pid}", json=NEW["patient"]).status_code == 404


def test_guest_demo_then_create_account_keeps_patients(client):
    me = client.get("/api/auth/me").json()
    assert me["user"]["is_guest"] and len(me["patients"]) == 1
    pid = me["active_patient_id"]
    me = _signup(client, email="judge@example.com").json()
    assert not me["user"]["is_guest"] and me["patients"][0]["id"] == pid and me["active_patient_id"] == pid


def test_launch_demo_reuses_demo_patient(client):
    client.post("/api/patients", json=NEW)
    me = client.post("/api/demo/launch").json()
    assert len(me["patients"]) == 2  # demo reused, not duplicated
    assert client.get("/api/state").json()["workspace"]["is_demo"]


def test_reset_only_allowed_for_demo_patient(client):
    client.post("/api/patients", json=NEW)
    assert client.post("/api/demo/reset").status_code == 400
