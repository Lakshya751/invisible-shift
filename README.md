# Invisible Shift

**Because care doesn't end when the hospital says goodbye.**

Invisible Shift checks whether a family can actually carry out a hospital discharge plan. It turns discharge instructions into dated care tasks. It matches each task against what family caregivers have said about their availability, skills, commitments and limits. Then it shows which tasks are left without a helper, and why, before those gaps cause problems at home.

> It is a logistics tool. It never changes clinical instructions, invents dosages, diagnoses, or predicts patient outcomes.

---

## The problem

A discharge plan says *what* has to happen at home: medication reminders, meals, supervised walks, dressing checks. It rarely knows *who will be there* when each task is due. A patient can have three caring relatives and still go without help every weekday lunch, because all three have commitments at noon.

The question nobody asks is: **"Who is actually available to do every required care task?"**

## Main features

| Feature | What it does |
|---|---|
| **AI Discharge Plan Reader** | Upload a PDF (or paste text). Tasks are extracted with the original wording kept, classified into 9 categories, and labeled *family / self-managed / professional-only / unclear*. Details the document doesn't state stay blank and are flagged for review. The family must confirm **every** task before anything is scheduled. |
| **Care Team** | Caregiver profiles with a drag-to-paint weekly calendar (available / possibly available / unavailable), exact-time form, approved task types, physical-assist and transport abilities, commitments, weekly hour limits, and whether they've agreed to help. |
| **Deterministic scheduling engine** | Real constraint matching (no LLM involved). Every assignment and every gap comes with a plain-language explanation and a per-caregiver breakdown. |
| **Live coverage dashboard** | Totals, coverage ring, coverage-by-day chart, workload meters, alerts and upcoming tasks. All of it is computed from the live schedule. |
| **Care Gap Detection** | Availability, scheduling-conflict, capability, transportation, workload, professional-care and needs-confirmation gaps. Each has a reason, a nonclinical next step, a *scheduling* urgency (not clinical urgency), and a status you can track (open / acknowledged / flagged for care team / handled). |
| **What-If Simulator** | Try changes on an isolated copy: extend someone's availability, remove a caregiver, cancel a commitment, change hour limits, add a helper (who stays *tentative* until they agree). You see before/after numbers and a matrix where changed cells animate from red to green. Nothing is saved until you press **Apply Changes**. |
| **Care Navigator** | A chat assistant grounded in the app's data. The numbers always come from the scheduler. An LLM, if configured, only rephrases them. Questions about changing medication or treatment always get a fixed answer that sends you to the pharmacist or clinician. |
| **Care Report** | A printable *Home Care Coverage Assessment* for a care coordinator: summary, workload, uncovered tasks with reasons, coordination actions, questions for the clinician, and a disclaimer. Use the browser's Print → Save as PDF to export it. |
| **Explain / conflict checks** | Click any task to see how each caregiver was evaluated. If you try a manual assignment that can't work, the app shows the exact conflict (e.g. *"Maya Wilson is not available 12:00–12:30 PM on Wednesday (Work (office), 9:30 AM–6:00 PM)"*). |
| **Guided demo** | "Show How Invisible Shift Works" walks through a 4-step, roughly 2-minute story from the problem to the fix. |

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui-style components (Radix + CVA), Lucide icons, Recharts, Framer Motion
- **Backend:** Python 3.9+, FastAPI, Pydantic v2, SQLAlchemy + SQLite, PyMuPDF
- **AI (optional):** OpenAI (`gpt-4o-mini` by default) or Gemini (`gemini-2.0-flash`) over REST with JSON mode

## Architecture

```
┌─────────────────────────── React SPA (Vite) ───────────────────────────┐
│ Landing · Overview · Discharge · Team · Schedule · Gaps · Simulator ·   │
│ Report · Care Navigator · Guided tour      (shared AppState context)    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ /api (JSON)
┌───────────────────────────────▼─────────────────────────────────────────┐
│ FastAPI (app/main.py)                                                   │
│  ├─ extraction.py   PDF → text (PyMuPDF) · rule-based extractor ·       │
│  │                  synthetic sample PDF                                │
│  ├─ ai.py           provider layer · extraction prompt · JSON parse +   │
│  │                  Pydantic validation · retry w/ error feedback ·     │
│  │                  grounding checks (flags invented times/quotes)      │
│  ├─ plan.py         confirmed templates → dated task instances          │
│  ├─ scheduler.py    ★ deterministic constraint scheduler + explanations │
│  ├─ gaps.py         Care Gap Detection Engine                           │
│  ├─ services.py     scenario simulation diff · report builder           │
│  ├─ assistant.py    Care Navigator (deterministic facts → optional LLM) │
│  ├─ db.py           SQLite via SQLAlchemy (validated JSON workspace)    │
│  └─ demo.py         fictional Wilson family fixture                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### How the scheduler decides

A caregiver can take a task only if **all** of these hold:

1. They are active and haven't declined.
2. They are approved for the task's category, and can provide physical help or transport if the task needs it.
3. They have **explicitly declared** availability covering the whole task window. An empty calendar never counts as available. Blocks marked "unavailable" cut time out of their availability.
4. No commitment overlaps the window.
5. No other assignment overlaps it on the same date.
6. The assignment keeps them within their weekly hour limit.
7. The task isn't professional-only, unclear, or self-managed. Those are never given to family.

Tasks are processed most-constrained first. When several caregivers qualify, ties are broken in this order: confirmed over tentative, then stated time-of-day preference, then lowest workload. **Time-sensitive tasks are never moved.** If nobody qualifies at the required time, the task stays uncovered and is classified by the reason it failed.

Statuses: **Covered** (green), **Tentative** (amber: "possibly available" or the caregiver hasn't confirmed yet), **Uncovered** (red), **Requires professional review** (amber), **Self-managed**.

Coverage % = covered ÷ (total − self-managed).

## Setup

Prerequisites: **Python 3.9+** and **Node 18+**.

### Option A — one command (serves everything on :8000)

```bash
./start.sh
# → http://localhost:8000
```

### Option B — dev mode with hot reload (two terminals)

```bash
# Terminal 1 — API
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000

# Terminal 2 — UI
cd frontend
npm install
npm run dev
# → http://localhost:5173   (proxies /api to :8000)
```

### Tests

```bash
cd backend && .venv/bin/python -m pytest -q      # 42 tests
cd frontend && npm run typecheck
```

The tests cover: creating exactly 28 weekly tasks, 21 covered / 7 uncovered / 75 % for the fixture (and *which* tasks), availability matching, the full-duration window, overlap prevention (and that the same time on different days is fine), commitments, capability / physical-assist / transport constraints, weekly hour limits, professional-only and unclear tasks, self-managed tasks left out of the coverage denominator, unconfirmed and "possibly available" caregivers counted as tentative, workload balancing, flexible-time placement, never moving time-sensitive tasks, coverage math, a scenario that leaves the original schedule untouched, the **Maya Wednesday scenario → 22 covered / 6 uncovered / 78.6 %**, apply persistence, removing a caregiver, manual-assignment conflicts, the report contents, Care Navigator answers, malformed AI output, AI retries, grounding checks, falling back when the AI is unavailable, and invalid uploads (wrong type, not a PDF, empty, corrupt).

## AI configuration

Copy `backend/.env.example` to `backend/.env` and set **one** key:

```bash
OPENAI_API_KEY=sk-...        # optional OPENAI_MODEL, OPENAI_BASE_URL
# or
GEMINI_API_KEY=...           # optional GEMINI_MODEL
```

Keys are read only by the server and never sent to the browser. With no key (or `AI_PROVIDER=none`) the app runs in **Demo Mode**:

- The sample discharge plan loads instantly.
- Uploaded PDFs go through a transparent **rule-based extractor**. It is labeled as such, and every task is flagged for review.
- Care Navigator answers come from deterministic templates built on the same scheduling facts.

The header badge always shows which mode is active, and each Navigator reply is labeled *Deterministic explanation* or *AI phrasing*.

**AI safeguards:** temperature 0, JSON-only output, Pydantic validation, one retry that tells the model what was wrong, then a fallback to the rule-based extractor. After extraction, a **grounding pass** checks each quoted source against the document and each time against its quote. Anything that can't be verified is flagged for human review.

## Demo instructions (≈ 2 minutes)

1. Open the app and click **Launch Live Demo**. This loads the fictional patient Robert Wilson (72) with caregivers Maya, Daniel and Sarah.
2. **Overview:** 28 tasks, **21 covered, 7 uncovered, 75 %**.
3. **Coverage Gaps:** five weekday lunches and the Wednesday/Friday 8 PM dressing observations. Expand "Why each caregiver couldn't help".
4. **Care Schedule:** click the red Wednesday 8 PM block to see each caregiver's evaluation and the original instruction. Try assigning Daniel and watch the exact conflict appear.
5. **What-If Simulator:** click **"Maya helps Wednesday evening"** (Wed 7:45–8:30 PM). The result goes to **22 covered / 6 uncovered / 78.6 %**, and the Wednesday cell turns from red to green with the explanation. Press **Apply Changes**.
6. **Care Report:** Print → Save as PDF.

Or click **Show How Invisible Shift Works** on the Overview for the guided four-step version. It ends with:

> *"We didn't change the patient's treatment. We made the family's ability to deliver care visible."*

To try upload: on **Discharge Plan**, click *Download sample PDF*, then upload it. It also contains a nurse-only dressing change, a follow-up appointment and a self-managed instruction, which shows how eligibility is classified.

## Safety & limitations

- **Logistics only.** It doesn't diagnose, doesn't predict deterioration or readmission, doesn't score medical risk, and never labels a patient "safe" or "unsafe" to discharge.
- **Clinical instructions are never changed automatically.** The original wording is kept. Questions about timing or medication are sent to the pharmacist or clinician.
- **Professional-only care is never assigned to family.** It is flagged for the care team.
- **Human in the loop.** The family must confirm every extracted task. Missing times, frequencies and durations are flagged, never made up.
- **Consent.** Caregivers who haven't agreed to help only ever provide *tentative* coverage.
- **Urgency means scheduling urgency** (how soon the gap occurs), not clinical risk.
- **Prototype.** Not certified and **not HIPAA-compliant**. Single local workspace, no authentication. Use fictional or de-identified data only. API keys stay on the server, and no patient data is logged.
- The rule-based extractor is a keyword heuristic. Scanned (image-only) PDFs need OCR, which isn't included, so paste the text instead.

## Future improvements

- Multi-family accounts, authentication and per-caregiver invitations (SMS/email accept or decline)
- Recurring plans longer than one week; calendar sync (Google/iCal) to import commitments
- Optimal assignment (ILP / max-flow) as an option alongside the explainable greedy scheduler
- OCR for scanned discharge documents; multilingual extraction and explanations
- Care-team portal for coordinators reviewing many patients; FHIR CarePlan import
- Audit trail and the security/compliance work needed before using real patient data

---

*All demo data is synthetic. Robert Wilson and his family are fictional.*
