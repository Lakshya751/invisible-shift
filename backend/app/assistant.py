"""Care Navigator — explains logistics using verified app data.

Calculations are always deterministic. When an AI key is configured the LLM
only rephrases the computed facts; otherwise a template answer is returned.
Questions about changing clinical instructions are always answered with a
fixed, safe redirection (never sent to the LLM for a decision).
"""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from typing import Dict, List, Tuple

from . import ai
from .models import CareTask, ChatRequest, ChatResponse, Gap, ScheduleResult, Workspace
from .scheduler import availability_windows
from .timeutil import DAY_NAMES, fmt12, fmt_range, from_min

CLINICAL_PAT = re.compile(
    r"\b(move|change|shift|skip|reschedul|adjust|delay|stop|double|reduce|increase)\b.*\b(medication|medicine|dose|pill|time|timing|treatment|dressing|diet)\b"
    r"|\b(dose|dosage|side effect|symptom|pain|fever|bleeding|infection|is it safe|should (he|she|they) take)\b",
    re.I,
)

CLINICAL_REPLY = (
    "Changes to medication timing, doses, diet or other treatment instructions need confirmation from the "
    "pharmacist or treating clinician — Invisible Shift never changes clinical instructions. I can help you "
    "flag the question for the care team: open Coverage Gaps and use “Flag for care team”, and it will appear "
    "under “Questions for clinician review” in the Care Report. For urgent symptoms, contact the care team or emergency services."
)


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def build_facts(ws: Workspace, schedule: ScheduleResult, gaps: List[Gap]) -> Dict:
    tasks = {t.task_id: t for t in ws.tasks}
    s = schedule.summary
    uncovered = [a for a in schedule.assignments if a.status == "uncovered"]
    clusters: Dict[Tuple[str, str, str], List[str]] = defaultdict(list)
    for a in uncovered:
        t = tasks[a.task_id]
        clusters[(t.title, t.scheduled_time or "flexible", "weekday" if t.weekday < 5 else "weekend")].append(DAY_NAMES[t.weekday])
    cluster_list = sorted(
        [
            {
                "task": k[0],
                "time": fmt12(k[1]) if k[1] != "flexible" else "flexible time",
                "days": v,
                "count": len(v),
            }
            for k, v in clusters.items()
        ],
        key=lambda c: -c["count"],
    )
    caregivers = []
    for cg in ws.caregivers:
        wins = []
        for d in range(7):
            for st, en, tent in availability_windows(cg, d):
                wins.append(f"{DAY_NAMES[d][:3]} {fmt_range(from_min(st), from_min(en))}{' (possibly)' if tent else ''}")
        caregivers.append(
            {
                "name": cg.name,
                "relationship": cg.relationship,
                "active": cg.active,
                "consent": cg.consent,
                "approved_for": cg.capabilities,
                "availability": wins,
                "max_hours_per_week": cg.max_hours_per_week,
            }
        )
    return {
        "patient": ws.patient.name + (" (fictional)" if ws.patient.synthetic else ""),
        "plan_period": f"{ws.plan.start_date}, {ws.plan.days} days",
        "summary": s.model_dump(),
        "uncovered_clusters": cluster_list,
        "uncovered_tasks": [
            {
                "task": tasks[a.task_id].title,
                "day": DAY_NAMES[tasks[a.task_id].weekday],
                "time": fmt12(a.start_time) if a.start_time else "flexible",
                "gap_type": a.gap_type,
                "why": a.explanation,
                "per_caregiver": [c.reason for c in a.candidates if c.code not in ("inactive",)],
            }
            for a in uncovered
        ],
        "professional_review": [tasks[a.task_id].title for a in schedule.assignments if a.status == "professional_review"],
        "workload": [w.model_dump() for w in schedule.workload],
        "caregivers": caregivers,
        "open_gaps": len([g for g in gaps if g.status != "resolved"]),
    }


def _join(items: List[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def deterministic_answer(msg: str, ws: Workspace, schedule: ScheduleResult, facts: Dict) -> Tuple[str, List[str]]:
    low = msg.lower()
    s = schedule.summary
    clusters = facts["uncovered_clusters"]
    tasks: Dict[str, CareTask] = {t.task_id: t for t in ws.tasks}

    if CLINICAL_PAT.search(msg):
        return CLINICAL_REPLY, ["Clinical-change question detected"]

    cluster_text = [
        f"{_plural(c['count'], c['task'].lower() + ' task')} at {c['time']} ({_join([d[:3] for d in c['days']])})" for c in clusters
    ]

    if re.search(r"\b(help|most|biggest|fix|improve|best|priorit)", low):
        if not clusters:
            return "Every schedulable task currently has an eligible caregiver — there are no uncovered tasks to fix.", []
        top = clusters[0]
        share = f"{top['count']} of the {s.uncovered}"
        reply = (
            f"Arranging help for {top['task'].lower()} at {top['time']} on {_join([d[:3] for d in top['days']])} "
            f"could address {share} uncovered tasks, assuming an eligible helper confirms availability."
        )
        if len(clusters) > 1:
            nxt = clusters[1]
            reply += (
                f" The next-largest gap is {nxt['task'].lower()} at {nxt['time']} on "
                f"{_join([d[:3] for d in nxt['days']])} ({nxt['count']} task{'s' if nxt['count'] != 1 else ''})."
            )
        reply += " You can test any change safely in the What-If Simulator before applying it."
        return reply, [f"{c['count']}× {c['task']} @ {c['time']}" for c in clusters]

    if re.search(r"\b(workload|busiest|most tasks|who (is )?doing|hours|capacity|burn)", low):
        parts = [
            f"{w.name.split(' ')[0]}: {_plural(w.tasks, 'task')}, {w.minutes} min of {w.max_minutes} ({w.utilization_percent:g}%)"
            for w in schedule.workload
        ]
        return "Current weekly workload — " + "; ".join(parts) + ".", parts

    day_match = next((i for i, d in enumerate(DAY_NAMES) if d.lower() in low or re.search(r"\b" + d[:3].lower() + r"\b", low)), None)
    if day_match is not None:
        day_tasks = [a for a in schedule.assignments if tasks[a.task_id].weekday == day_match]
        lines = []
        for a in day_tasks:
            t = tasks[a.task_id]
            who = a.caregiver_name.split(" ")[0] if a.caregiver_name else ("UNCOVERED" if a.status == "uncovered" else a.status.replace("_", " "))
            lines.append(f"{fmt12(a.start_time) if a.start_time else 'flexible'} {t.title} → {who}")
        unc = [a for a in day_tasks if a.status == "uncovered"]
        reply = f"{DAY_NAMES[day_match]}: " + "; ".join(lines) + "."
        if unc:
            reply += " " + " ".join(a.explanation for a in unc)
        return reply, lines

    if re.search(r"\b(why|uncovered|gap|missing|not covered)", low):
        if s.uncovered == 0:
            return f"No tasks are uncovered. {s.covered} of {s.total} are covered ({s.coverage_percent:g}%).", []
        reply = f"{_plural(s.uncovered, 'task')} {'is' if s.uncovered == 1 else 'are'} uncovered: " + "; ".join(cluster_text) + ". "
        by_type = Counter(a.gap_type for a in schedule.assignments if a.status == "uncovered")
        if by_type.get("availability"):
            reply += (
                "In each availability gap, every caregiver approved for the task is either outside their declared "
                "availability or has another commitment at that time."
            )
        others = {k: v for k, v in by_type.items() if k != "availability"}
        if others:
            reply += " Other gap types: " + ", ".join(f"{v} {k.replace('_', ' ')}" for k, v in others.items()) + "."
        return reply.strip(), cluster_text

    if re.search(r"\b(coverage|percent|status|summary|overview|how are we)", low):
        return (
            f"{s.covered} of {s.total} tasks are covered ({s.coverage_percent:g}%), {s.uncovered} uncovered, "
            f"{s.tentative} tentative and {s.professional_review} awaiting professional review.",
            [],
        )

    return (
        f"Here's where things stand: {s.covered} of {s.total} care tasks are covered ({s.coverage_percent:g}%) and "
        f"{s.uncovered} are uncovered. Try asking “Why are tasks uncovered?”, “What would help the most?”, "
        "“Who has the most work?” or “What happens on Wednesday?”.",
        [],
    )


NAVIGATOR_SYSTEM = """You are Care Navigator inside Invisible Shift, a logistics tool that helps families cover hospital discharge care tasks.
Answer ONLY using the JSON facts provided. Never invent caregivers, availability, times or numbers. All numbers must come from the facts.
You do not give medical advice. Never suggest changing medication, doses, timing of treatment, or clinical instructions — say that needs the pharmacist or treating clinician.
Do not predict health outcomes or assign medical risk. Be warm, concise (max ~120 words), and practical. Suggest nonclinical coordination steps (ask a caregiver, arrange a helper, flag for care team, test in the What-If Simulator)."""


def chat(req: ChatRequest, ws: Workspace, schedule: ScheduleResult, gaps: List[Gap]) -> ChatResponse:
    facts = build_facts(ws, schedule, gaps)
    fallback, fact_lines = deterministic_answer(req.message, ws, schedule, facts)
    if CLINICAL_PAT.search(req.message) or ai.provider() is None:
        return ChatResponse(reply=fallback, mode="deterministic", facts=fact_lines)
    history = "\n".join(f"{m.role}: {m.content}" for m in req.history[-6:])
    user = (
        f"FACTS (verified by the deterministic scheduler):\n{json.dumps(facts, indent=1)}\n\n"
        f"DETERMINISTIC DRAFT ANSWER (accurate; you may rephrase or expand using facts only):\n{fallback}\n\n"
        f"Conversation so far:\n{history}\n\nUser question: {req.message}"
    )
    try:
        reply = ai.complete(NAVIGATOR_SYSTEM, user, json_mode=False, timeout=30).strip()
        if not reply:
            raise ai.AIUnavailableError("empty reply")
        return ChatResponse(reply=reply, mode=f"ai:{ai.provider()}", facts=fact_lines)
    except ai.AIUnavailableError:
        return ChatResponse(reply=fallback, mode="deterministic", facts=fact_lines + ["AI provider unavailable — used deterministic answer"])
