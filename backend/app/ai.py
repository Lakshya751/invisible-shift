"""AI provider layer (OpenAI or Gemini) with strict JSON validation.

The LLM is used for (1) extracting reviewable tasks from discharge text and
(2) phrasing explanations from verified scheduling facts. It is never used to
build the schedule.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx
from pydantic import ValidationError

from .models import CATEGORIES, ExtractedTask


class AIUnavailableError(Exception):
    """No provider configured, or the provider failed."""


class AIOutputError(Exception):
    """Provider replied, but the output could not be validated."""


def provider() -> Optional[str]:
    forced = os.getenv("AI_PROVIDER", "").strip().lower()
    if forced in ("none", "off", "demo"):
        return None
    if forced == "openai" and os.getenv("OPENAI_API_KEY"):
        return "openai"
    if forced == "gemini" and os.getenv("GEMINI_API_KEY"):
        return "gemini"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    if os.getenv("GEMINI_API_KEY"):
        return "gemini"
    return None


def provider_label() -> str:
    p = provider()
    if p == "openai":
        return f"OpenAI · {os.getenv('OPENAI_MODEL', 'gpt-4o-mini')}"
    if p == "gemini":
        return f"Gemini · {os.getenv('GEMINI_MODEL', 'gemini-2.0-flash')}"
    return "Demo mode (no AI key)"


def complete(system: str, user: str, json_mode: bool = False, timeout: float = 45.0) -> str:
    """Single chat completion. Raises AIUnavailableError on any transport error."""
    p = provider()
    if p is None:
        raise AIUnavailableError("No AI provider configured")
    try:
        if p == "openai":
            body: Dict[str, Any] = {
                "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                "temperature": 0,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            }
            if json_mode:
                body["response_format"] = {"type": "json_object"}
            base = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
            r = httpx.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}"},
                json=body,
                timeout=timeout,
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        gen_cfg: Dict[str, Any] = {"temperature": 0}
        if json_mode:
            gen_cfg["responseMimeType"] = "application/json"
        r = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"x-goog-api-key": os.getenv("GEMINI_API_KEY", "")},
            json={
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": gen_cfg,
            },
            timeout=timeout,
        )
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        # Never echo credentials; just the class + status.
        raise AIUnavailableError(f"{p} request failed: {type(exc).__name__}") from exc


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

EXTRACTION_SYSTEM = """You convert hospital discharge instructions into a JSON list of home-care tasks for family-caregiver scheduling.

STRICT RULES
- Only extract what the document explicitly says. NEVER invent medications, dosages, times, frequencies, durations or clinical requirements.
- Do NOT include medication names or dosages in titles. Use generic titles like "Medication reminder".
- If a time is not stated, set "scheduled_time": null and "needs_review": true.
- If a frequency is not stated, set "frequency": null and "needs_review": true.
- "estimated_duration_minutes" is a logistical estimate; use a stated value if present, otherwise null and needs_review true.
- "source_text" MUST be an exact quote copied from the document.
- If an instruction happens at several times per day, output one task per time.
- eligibility: "self" (patient manages alone), "family" (explicitly appropriate for a family caregiver),
  "professional" (nurse/therapist/clinician must do it — e.g. dressing changes by a nurse, injections, IV care),
  "unknown" (unclear who may do it). When in doubt use "unknown".
- Never mark a clinical procedure as "family".

Return ONLY a JSON object: {"tasks": [ {
  "task_id": "task_001",
  "title": string,
  "category": one of %s,
  "scheduled_time": "HH:MM" 24h or null,
  "frequency": one of ["daily","weekdays","weekends","specific_days","once","as_needed"] or null,
  "days_of_week": [0-6, Monday=0] (for specific_days/once),
  "date": "YYYY-MM-DD" or null,
  "estimated_duration_minutes": integer or null,
  "caregiver_required": boolean,
  "professional_required": boolean,
  "eligibility": "self" | "family" | "professional" | "unknown",
  "requires_transport": boolean,
  "requires_physical_assist": boolean,
  "source_text": string,
  "source_page": integer or null,
  "needs_review": boolean,
  "review_notes": [string]
} ] }""" % json.dumps(CATEGORIES)


def _strip_fences(text: str) -> str:
    text = text.strip()
    m = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.S)
    return m.group(1) if m else text


def parse_extraction(raw: str) -> List[ExtractedTask]:
    """Parse + validate LLM output. Raises AIOutputError with a precise message."""
    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError as exc:
        raise AIOutputError(f"Output was not valid JSON: {exc.msg}") from exc
    items = data.get("tasks") if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise AIOutputError("Expected an object with a 'tasks' array")
    out: List[ExtractedTask] = []
    errors: List[str] = []
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"tasks[{i}] is not an object")
            continue
        item = dict(item)
        item.setdefault("task_id", f"task_{i + 1:03d}")
        item["task_id"] = f"task_{i + 1:03d}"  # enforce unique ids
        if item.get("category") not in CATEGORIES:
            item["category"] = "other"
        try:
            out.append(ExtractedTask(**item))
        except ValidationError as exc:
            errors.append(f"tasks[{i}]: {exc.errors()[0]['msg']}")
    if errors and not out:
        raise AIOutputError("; ".join(errors[:5]))
    return out


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def _time_variants(t: str) -> List[str]:
    h, m = map(int, t.split(":"))
    h12 = h % 12 or 12
    mer = "am" if h < 12 else "pm"
    v = [f"{h}:{m:02d}", f"{h:02d}:{m:02d}", f"{h12}:{m:02d}", f"{h12} {mer}", f"{h12}{mer}", f"{h12}:{m:02d} {mer}"]
    if h == 12 and m == 0:
        v += ["noon", "midday"]
    if h == 0 and m == 0:
        v += ["midnight"]
    return [_norm(x) for x in v]


def ground_tasks(tasks: List[ExtractedTask], document_text: str) -> List[ExtractedTask]:
    """Safety net: flag anything the model asserted that the document doesn't support."""
    doc = _norm(document_text)
    for t in tasks:
        notes = list(t.review_notes)
        if t.source_text and _norm(t.source_text)[:120] not in doc:
            notes.append("Source quote could not be matched to the document — verify against the original.")
        src = _norm(t.source_text)
        if t.scheduled_time and not any(v in src for v in _time_variants(t.scheduled_time)):
            notes.append(f"Time {t.scheduled_time} was not found in the quoted instruction — verify or clear it.")
        if t.scheduled_time is None and t.frequency not in ("as_needed",):
            notes.append("Time not specified in the document.")
        if t.frequency is None:
            notes.append("Frequency not specified in the document.")
        if t.estimated_duration_minutes is None:
            notes.append("Duration not specified — enter a realistic estimate.")
        if t.eligibility == "unknown":
            notes.append("Unclear who may perform this — clarify with the care team.")
        if notes != list(t.review_notes):
            t.needs_review = True
        t.review_notes = list(dict.fromkeys(notes))
        t.confirmed = False
    return tasks


def ai_extract(document_text: str, max_attempts: int = 2) -> Tuple[List[ExtractedTask], List[str]]:
    """Extract with retries. Raises AIUnavailableError / AIOutputError."""
    warnings: List[str] = []
    user = "Discharge document (pages delimited by [Page N]):\n\n" + document_text[:60_000]
    last_err: Optional[Exception] = None
    for attempt in range(max_attempts):
        prompt = user
        if last_err is not None:
            prompt += f"\n\nYour previous reply was rejected: {last_err}. Return valid JSON only, matching the schema."
        raw = complete(EXTRACTION_SYSTEM, prompt, json_mode=True)
        try:
            tasks = parse_extraction(raw)
            if attempt:
                warnings.append(f"AI output needed {attempt + 1} attempts to validate.")
            return ground_tasks(tasks, document_text), warnings
        except AIOutputError as exc:
            last_err = exc
    raise AIOutputError(str(last_err))
