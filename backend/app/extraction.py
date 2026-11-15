"""PDF text extraction, deterministic rule-based extraction (no-key mode),
and generation of the synthetic sample discharge PDF."""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Tuple

import fitz  # PyMuPDF

from .models import ExtractedTask

MAX_PDF_BYTES = 10 * 1024 * 1024


class InvalidUpload(Exception):
    pass


def pdf_to_text(data: bytes) -> Tuple[str, int]:
    """Return ('[Page 1]\\n...\\n[Page 2]...', page_count)."""
    if not data:
        raise InvalidUpload("The uploaded file is empty.")
    if len(data) > MAX_PDF_BYTES:
        raise InvalidUpload("PDF is larger than 10 MB.")
    if not data.lstrip()[:5].startswith(b"%PDF"):
        raise InvalidUpload("This file is not a PDF. Please upload a .pdf discharge document or paste the text instead.")
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # PyMuPDF raises various types
        raise InvalidUpload("The PDF could not be opened (it may be corrupted).") from exc
    if doc.needs_pass:
        raise InvalidUpload("The PDF is password-protected.")
    parts = []
    for i, page in enumerate(doc, start=1):
        parts.append(f"[Page {i}]\n{page.get_text('text').strip()}")
    text = "\n\n".join(parts)
    if len(re.sub(r"\[Page \d+\]|\s", "", text)) < 20:
        raise InvalidUpload(
            "No readable text was found. The PDF may be a scanned image — please paste the instruction text instead."
        )
    return text, doc.page_count


# ---------------------------------------------------------------------------
# Rule-based extraction (used when no AI key is configured)
# ---------------------------------------------------------------------------

CATEGORY_KEYWORDS: List[Tuple[str, List[str]]] = [
    ("appointment", ["appointment", "follow-up visit", "follow up visit", "clinic visit", "see dr", "see your surgeon"]),
    ("wound_care", ["dressing change", "change the dressing", "change the surgical dressing", "incision care", "wound care", "staple"]),
    ("monitoring", ["observe", "check", "monitor", "record", "log", "temperature", "weigh", "blood pressure", "dressing"]),
    ("medication", ["medication", "medicine", "pill", "dose", "tablet", "prescription"]),
    ("meals", ["meal", "lunch", "breakfast", "dinner", "diet", "eat", "food", "fluids", "drink"]),
    ("mobility", ["walk", "mobility", "exercise", "ambulat", "stairs", "physical therapy", "transfer"]),
    ("personal_care", ["shower", "bath", "dress", "toilet", "hygiene", "groom"]),
    ("transportation", ["drive", "ride", "transport"]),
]
TITLES = {
    "appointment": "Follow-up appointment",
    "wound_care": "Wound-care-related task",
    "monitoring": "Observation & logging",
    "medication": "Medication reminder",
    "meals": "Meal assistance",
    "mobility": "Mobility activity",
    "personal_care": "Personal care",
    "transportation": "Transportation",
    "other": "Care task",
}
PROFESSIONAL_PAT = re.compile(
    r"\b(nurse|home health|clinician|therapist will|injection|iv\b|infusion|catheter|drain removal|by a professional)\b", re.I
)
SELF_PAT = re.compile(r"\b(patient may|you may|independently|on (his|her|their) own|self-manage)\b", re.I)
FAMILY_PAT = re.compile(r"\b(caregiver|family|helper|someone should|assist)\b", re.I)
TIME_PAT = re.compile(r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)|\b(noon|midday)\b", re.I)
DUR_PAT = re.compile(r"\b(\d{1,3})\s*(?:-|to)?\s*(?:\d{1,3}\s*)?(min|minute|minutes|hour|hours|hr|hrs)\b", re.I)
DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]
DATE_PAT = re.compile(r"\b(" + "|".join(MONTHS) + r")\s+(\d{1,2}),?\s+(\d{4})\b", re.I)
NUM_DATE_PAT = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
ACTION_HINT = re.compile(
    r"\b(daily|every|each|at \d|remind|assist|help|should|must|may|take|walk|observe|record|appointment|follow-up|prepare|nurse will|check)\b",
    re.I,
)


def _segments(text: str) -> List[Tuple[str, int]]:
    """Split document into instruction-sized segments with page numbers."""
    segs: List[Tuple[str, int]] = []
    page = 1
    buf: List[str] = []

    def flush():
        if buf:
            s = re.sub(r"\s+", " ", " ".join(buf)).strip()
            if s:
                segs.append((s, page))
            buf.clear()

    for line in text.splitlines():
        m = re.match(r"^\[Page (\d+)\]$", line.strip())
        if m:
            flush()
            page = int(m.group(1))
            continue
        stripped = line.strip()
        if not stripped:
            flush()
            continue
        if re.match(r"^([-•*·]|\d+[.)])\s+", stripped):
            flush()
            stripped = re.sub(r"^([-•*·]|\d+[.)])\s+", "", stripped)
        buf.append(stripped)
    flush()
    return segs


def _times(seg: str) -> List[str]:
    out = []
    for m in TIME_PAT.finditer(seg):
        if m.group(4):
            out.append("12:00")
            continue
        h = int(m.group(1))
        mi = int(m.group(2) or 0)
        pm = m.group(3).lower().startswith("p")
        if h == 12:
            h = 12 if pm else 0
        elif pm:
            h += 12
        if 0 <= h < 24 and 0 <= mi < 60:
            out.append(f"{h:02d}:{mi:02d}")
    return list(dict.fromkeys(out))


def _frequency(seg: str) -> Tuple[Optional[str], List[int], Optional[str]]:
    low = seg.lower()
    date: Optional[str] = None
    m = DATE_PAT.search(seg)
    if m:
        date = f"{int(m.group(3)):04d}-{MONTHS.index(m.group(1).lower()) + 1:02d}-{int(m.group(2)):02d}"
    else:
        m2 = NUM_DATE_PAT.search(seg)
        if m2:
            date = f"{int(m2.group(3)):04d}-{int(m2.group(1)):02d}-{int(m2.group(2)):02d}"
    if re.search(r"\b(as needed|prn|if needed)\b", low):
        return "as_needed", [], date
    if re.search(r"\b(daily|every day|each day|once a day|twice a day|twice daily|every (morning|evening|night))\b", low):
        return "daily", [], date
    if re.search(r"\bweekdays?\b", low):
        return "weekdays", [], date
    if re.search(r"\bweekends?\b", low):
        return "weekends", [], date
    days = [i for i, d in enumerate(DAY_NAMES) if re.search(r"\b" + d + r"s?\b", low)]
    if date:
        return "once", [], date
    if days:
        return ("specific_days" if len(days) > 1 or re.search(r"every|each", low) else "once"), days, date
    return None, [], date


def rule_extract(text: str) -> List[ExtractedTask]:
    tasks: List[ExtractedTask] = []
    for seg, page in _segments(text):
        low = seg.lower()
        if len(seg) < 15 or not ACTION_HINT.search(seg):
            continue
        category = next((c for c, kws in CATEGORY_KEYWORDS if any(k in low for k in kws)), None)
        if category is None:
            continue
        # observation of a dressing is monitoring, a dressing *change* is wound care
        if category == "wound_care" and re.search(r"do not (remove|change)", low) and "observe" in low:
            category = "monitoring"
        professional = bool(PROFESSIONAL_PAT.search(seg)) and not (
            category == "monitoring" and re.search(r"do not (remove|change)", low)
        )
        if professional:
            eligibility = "professional"
        elif SELF_PAT.search(seg) and not FAMILY_PAT.search(seg):
            eligibility = "self"
        elif FAMILY_PAT.search(seg):
            eligibility = "family"
        else:
            eligibility = "unknown"
        freq, days, date = _frequency(seg)
        dur_m = DUR_PAT.search(seg)
        duration = None
        if dur_m:
            n = int(dur_m.group(1))
            duration = n * 60 if dur_m.group(2).lower().startswith("h") else n
            duration = max(1, min(duration, 600))
        times = _times(seg) or [None]
        for t in times:
            notes: List[str] = ["Extracted by rule-based parser (no AI key) — review carefully."]
            tasks.append(
                ExtractedTask(
                    task_id=f"task_{len(tasks) + 1:03d}",
                    title=TITLES[category],
                    category=category,  # type: ignore[arg-type]
                    scheduled_time=t,
                    frequency=freq,  # type: ignore[arg-type]
                    days_of_week=days,
                    date=date,
                    estimated_duration_minutes=duration,
                    caregiver_required=eligibility != "self",
                    professional_required=eligibility == "professional",
                    eligibility=eligibility,  # type: ignore[arg-type]
                    requires_transport=category == "appointment",
                    requires_physical_assist=category == "mobility" and bool(re.search(r"assist|standby|support", low)),
                    source_text=seg,
                    source_page=page,
                    needs_review=True,
                    review_notes=notes,
                )
            )
    return tasks


# ---------------------------------------------------------------------------
# Sample PDF (synthetic)
# ---------------------------------------------------------------------------

SAMPLE_LINES: List[Tuple[int, str]] = [
    (1, "RIVERSIDE GENERAL HOSPITAL (FICTIONAL) — DISCHARGE INSTRUCTIONS"),
    (1, "SYNTHETIC DEMONSTRATION DOCUMENT — NOT A REAL PATIENT"),
    (1, ""),
    (1, "Patient: Robert Wilson (fictional), age 72. Discharged November 15, 2026 after abdominal surgery."),
    (1, ""),
    (1, "HOME CARE INSTRUCTIONS"),
    (1, "1. Morning medications at 8:00 AM daily as listed on the attached medication schedule. A family caregiver should remind the patient and confirm the dose was taken. Allow about 15 minutes."),
    (1, "2. Lunch at 12:00 PM daily. A caregiver should help prepare a soft, low-sodium meal and stay with the patient while eating. Allow about 30 minutes."),
    (2, "3. Supervised walk at 3:00 PM daily, as taught by physical therapy. A caregiver who has been shown the technique should provide standby assistance. About 20 minutes."),
    (2, "4. At 8:00 PM daily, a family caregiver should observe the outer surgical dressing and record any drainage or changes in the care log. Do not remove or change the dressing. About 15 minutes."),
    (2, "5. The home health nurse will change the surgical dressing on Wednesday and Saturday."),
    (2, "6. Follow-up appointment with the surgical clinic on November 20, 2026 at 10:30 AM. Someone should drive the patient. Plan for 2 hours."),
    (2, "7. The patient may shower independently after 48 hours."),
    (2, ""),
    (2, "Call the clinic or 911 for emergencies. This document is synthetic and for demonstration only."),
]


def sample_pdf_bytes() -> bytes:
    doc = fitz.open()
    pages: Dict[int, List[str]] = {}
    for p, line in SAMPLE_LINES:
        pages.setdefault(p, []).append(line)
    for p in sorted(pages):
        page = doc.new_page(width=612, height=792)
        rect = fitz.Rect(56, 56, 556, 740)
        page.insert_textbox(rect, "\n".join(pages[p]), fontsize=11, fontname="helv", lineheight=1.5)
    data = doc.tobytes()
    doc.close()
    return data
