"""What fed Memory a model call: the source of the item it was working on, written on the call's row.

Petar, 23 November 2026 (task 182, step 182-15): "can we split it by source so we can make that analysis
at a later time?" Memory's own cost was about $7 a day, and nobody could say how much of it was mail, the
calendar, the workspace or the chats. So every model call Memory makes (the X-ray, its parts, the
fingerprints, the decision calls, the thread summaries, dreaming, the judge) says which source caused it
and, where there is one, the item's own `source_key`, in `llm_requests.source` and `llm_requests.source_key`
(migration 0277). The stats screen splits Memory's cost by them (`rouh/usage_drill.py`).

How it travels: whoever works on an item says so with `about_item`, which is `llmlog.about` with the two
fields, around the whole of the work: `ingest.store` and `ingest.edit` for code's part, the worker's
`run_job` for the model's part, `layers.build` for a thread's summary. Memory's model calls are sent
from an event loop of their own, on another thread, so `ai._about` reads the two fields where the call
is asked for and hands them on itself. A call made with no item in hand (a question asked of memory,
dreaming, the map, the judge) is named by its use (`of_purpose`). A call made before 23 November 2026
has neither, and the screen says "Source not recorded".
"""
from __future__ import annotations

import contextlib

#: Each item source (`synapse.item.source`), as the source a person knows it by.
OF_ITEM = {
    "gmail": "mail",
    "gcal": "calendar",
    "icloud": "contacts",
    "address": "contacts",
    "meeting-library": "meetings",
    "slack": "slack",
    "rouh-thoughts": "thoughts",
    "rouh-task": "tasks",
    "rouh-file": "files",
    "rouh-chat": "chats",
    "rouh-card": "cards",
    "rouh-rules": "rules",
    "rouh-memory": "remembered",
    "rouh-vocabulary": "vocabulary",
    "synapse": "memory",
    "lab": "lab",
}

#: Every source as the stats screen says it.
NAMES = {
    "mail": "Mail",
    "calendar": "Calendar",
    "contacts": "Contacts",
    "meetings": "Meetings",
    "slack": "Slack",
    "thoughts": "Thoughts",
    "tasks": "Tasks",
    "files": "Workspace files",
    "chats": "Chats",
    "cards": "Cards",
    "rules": "Rules",
    "remembered": "Things Rouh was asked to remember",
    "vocabulary": "Vocabulary",
    "memory": "Memory's own people and topics",
    "profiles": "Profiles of people and topics",
    "dreaming": "Dreaming at night",
    "questions": "Questions asked of memory",
    "map": "The map of areas",
    "selftest": "Memory self-tests",
    "vectors": "Search fingerprints made again",
    "lab": "Test data",
}

#: A call with no item in hand, named by its use (`purpose` without its `synapse_`).
OF_USE = {
    "dream": "dreaming",
    "recall_pick": "questions",
    "answer": "questions",
    "understand": "questions",
    "embed_query": "questions",
    "message_seeds": "questions",
    "explain": "questions",
    "map_areas": "map",
    "judge": "selftest",
    "chat_recall_judge": "selftest",
    "chat_recall_answer": "selftest",
    "bench_facts": "selftest",
    "test_data": "selftest",
    "layer_profile": "profiles",
    "layer_person": "profiles",
    "layer_topic": "profiles",
    "decisions_probe": "selftest",
}

#: What a stats row says for a memory call that carries no source: made before 23 November 2026.
NOT_RECORDED = "Source not recorded"


def of_item(source: str) -> str:
    """The source an item source is, or the item source itself when it is a new one, so none is hidden."""
    source = str(source or "").strip()
    return OF_ITEM.get(source, source[:40])


def of_purpose(purpose: str) -> str:
    """The source a memory call with no item in hand is named by, from its use; "" when it says nothing."""
    use = str(purpose or "").removeprefix("synapse_").removeprefix("decide_")
    return OF_USE.get(use, "")


def named(key: str) -> str:
    """A source as the screen says it."""
    if not key:
        return NOT_RECORDED
    return NAMES.get(key, key[:1].upper() + key[1:].replace("-", " "))


def about_item(source: str = "", source_key: str = "", *, feed: str = ""):
    """`llmlog.about` saying which source the calls made inside are for: an item's (`source`, its raw
    `synapse.item.source`) or one given as it is (`feed`, such as "dreaming"). Never raises: a call is
    never stopped for want of a label."""
    try:
        from rouh import llmlog
    except Exception:  # noqa: BLE001 - outside Rouh (a check of Synapse alone): nothing is written down
        return contextlib.nullcontext()
    label = feed or of_item(source)
    said = {k: v for k, v in (("source", label), ("source_key", str(source_key or "")[:300])) if v}
    return llmlog.about(**said) if said else contextlib.nullcontext()


def about_job(job: dict):
    """The source of one queued job of Memory's (`worker.run_job`): its item's, or its kind's."""
    from . import db

    kind = str(job.get("kind") or "")
    if job.get("item_id"):
        try:
            row = db.row("SELECT source, source_key FROM synapse.item WHERE id = %s", (job["item_id"],))
        except Exception:  # noqa: BLE001
            row = None
        if row:
            return about_item(row.get("source") or "", row.get("source_key") or "")
    feed = {"dream": "dreaming", "map": "map", "eval": "selftest", "seed": "lab", "revector": "vectors",
            "icloud_push": "contacts", "icloud_delete": "contacts", "mail_add": "mail", "mail_delete": "mail",
            "mail_labels": "mail"}.get(kind, "")
    return about_item(feed=feed) if feed else contextlib.nullcontext()
