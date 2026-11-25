"""Rouh's built-in rules in three tiers: always told, told with their tool, told with a message about them.

Petar, 25 November 2026 (task 182, step 182-23): "okay let's do this, you have my green light for the tiered
approach then". Step 182-18 found that one $2 message sent about 24,000 tokens of instructions and tools before a
word of the conversation, about 9,700 of them built-in rules, most about one tool or one corner of Rouh that the
message never touched. So a built-in rule is now told in one of three ways:

1. **Always** (tier 1), in the cached part of every turn's system prompt, as before: who Rouh is, asking versus
   assuming, where work goes, research becomes a task, text that is not from the person, how rules rank, the
   stop button, checking a job before saying how it stands, and every rule about permission, privacy and safety,
   whatever it costs. With them, one rule of its own (`INDEX_KEY`): one line for every topic that moved, saying
   which tool to load for it and the part of it that must hold even before the tool is loaded.
2. **With its tool** (tier 2): a rule about one tool, or one corner of Rouh a tool serves, is put at the end of
   that tool's description (`rouh/tool_rules.py`, a rule's `when.with`), so it arrives the moment the tool is
   loaded, and a turn that never loads it never pays for it. A rule that guards an action sits in the tool that
   performs the action, so the rule is always in front of the act.
3. **With a message about it** (tier 3): the code spots a topic in the person's message (`TOPICS`, by keywords;
   `detect`) and tells that topic's rules for this turn alone, in the part of the prompt told after the
   conversation (`brain.Brain._system`, the turn part), never in the cached part. A rule's `when.topics` says
   which topics it is told for. A miss falls back on the index line of tier 1.

**The cache.** Neither tier 2 nor tier 3 ever changes the cached part: a tool's description goes into the turn
where the tool was loaded, and the turn part is sent after the conversation. So the cached part is the same, byte
for byte, from one message to the next, as it was.

**Only this Rouh, and one step back.** The tiers are data, the rules' own `when`, so code alone changes nothing
on any Rouh. `apply` moves this Rouh's rules into their tiers (`PLAN`, versioned `VERSION`), keeping what each
rule was before in `app_state` (`STATE`), and `revert` puts every one back exactly as it was, in one step
(`manage.py rule_tiers apply|revert|status`). The words of the rules are not changed by either, so a rule taken in
from the defaults keeps taking newer words (`ruledefaults.take`, which keeps a rule's `with`). Nothing here
publishes the defaults to rouh.land: that is its own step, after a week of `TurnTiers` says it holds.

**What each message was given** (`TurnTiers`, `note_turn`): the topics spotted in the person's words, the rules of
tier 3 told and their tokens, the tools loaded in the turn and the topics whose rules came with them, and a flag
for each topic the turn touched (spotted in the message or in the reply, or a tool of that topic called) with
none of its rules in front of the model. The page of one call on the stats screen says it (`for_call`).
"""
from __future__ import annotations

import contextvars
import json
import logging
import re
import time

log = logging.getLogger("rouh.rule_tiers")

#: The plan's version: what `apply` puts in place, and what a turn's record says it ran on.
VERSION = "tiers-1"
#: Where this Rouh keeps which plan is applied and what every rule it moved was before (`app_state`).
STATE = "rule_tiers"
#: The key of the one rule of tier 1 that says what moved.
INDEX_KEY = "tier-index"
#: Where tier 3 is told in the turn part: after the live context, before the rules for the reply (910).
TURN_AT = 905
#: The key of a rule's `when` that says which topics it is told for.
KEY = "topics"

#: Each topic a message can be about: its title, and the words that spot it. Whole words, any case. A topic is
#: only ever a reason to tell more rules: a false hit costs a few hundred tokens of this turn, never the cache.
TOPICS: dict[str, tuple[str, tuple[str, ...]]] = {
    "orb": ("the orb", (r"\borbs?\b",)),
    "screen": ("the screen and its cards", (r"\bcards?\b", r"\bcanvas\b", r"\bon (?:the |your )?screen\b",
                                            r"\btranscript\b", r"\bpanels?\b", r"\bshow (?:it|that|me) again\b")),
    "rouh_links": ("a link to Rouh itself", (r"https?://\S*\brouh\b\S*", r"\brouh\.(?:is|land|page|ccfor\.me)\b",
                                             r"/(?:mail/case|task|chat|decisions?|run)/\S+")),
    "workspace": ("the workspace", (r"\bworkspace\b", r"\bAGENTS\.md\b")),
    "tasks": ("tasks, threads and the canvas", (
        r"\btasks?\s*#?\d+", r"\bsteps?\s*\d+(?:-\d+)?", r"\b\d{1,4}\s*-\s*\d{1,3}\b", r"\bmake (?:a|it a|this a) task\b",
        r"\bthis is work now\b", r"\bfile (?:that|this)(?: one)?\b", r"\bput (?:that|this) on the record\b",
        r"\bmove (?:task|this|it|that)\b", r"\b(?:un)?pin\b", r"\bprioriti[sz]e\b", r"\bcontrol room\b",
        r"\brename (?:this|the) chat\b", r"\bcall this chat\b")),
    "waiting": ("a task waiting on the person", (r"\bis waiting on me\b", r"\bis done, and it asked me this\b",
                                                 r"\bmy answer:", r"\bwhat does it need from me\b")),
    "decisions": ("decisions, delegates and silos", (
        r"\bdecisions?\b", r"\bdecide\b", r"\bwaiting on me\b", r"\banything for me\b", r"\bdelegates?\b",
        r"\bsilos?\b", r"\bapprov\w*\b", r"\bauthority\b", r"\bsnooze\b")),
    "remember": ("keeping rules, notes and words", (
        r"\bremember\b", r"\bforget\b", r"\bkeep (?:this|that|it|in mind)\b", r"\brules?\b", r"\bnotes?\b",
        r"\bvocabulary\b", r"\bnickname\b", r"\bwhat (?:do )?you know about\b")),
    "thoughts": ("the person's thoughts", (r"\bthoughts?\b", r"\bideas?\b", r"\bnote to self\b", r"\bmusings?\b",
                                           r"^\s*(?:thought|idea)\s*:")),
    "boxes": ("boxes", (r"\bbox(?:es)?\b", r"\bpasswords?\b", r"\bkeep (?:it|this|that) from you\b")),
}

#: Which topic each tool serves: a tool called in a turn touches its topic, and a tool loaded brings its rules.
TOOL_TOPICS: dict[str, str] = {
    "show_on_screen": "screen", "revise_on_screen": "screen", "show_again": "screen",
    "what_was_on_screen": "screen", "read_card": "screen", "set_panels": "screen",
    "what_is_running": "orb",
    "read_rouh_link": "rouh_links",
    "read_workspace": "workspace", "show_workspace_page": "workspace",
    "show_canvas": "tasks", "make_a_task": "tasks", "move_task": "tasks", "pin": "tasks",
    "rename_this_chat": "tasks",
    "decisions": "decisions", "delegate": "decisions",
    "remember": "remember", "forget": "remember",
    "capture_thought": "thoughts", "thoughts": "thoughts",
    "new_box": "boxes", "open_box": "boxes",
}

#: Every built-in rule that moves, by its key: the tools it is told with (tier 2) and the topics it is told for
#: (tier 3). Every other built-in rule stays where it is: always told, or told on its own conditions.
PLAN: dict[str, dict] = {
    "screen": {"with": ["show_on_screen", "revise_on_screen", "show_again", "what_was_on_screen", "read_card",
                        "set_panels"], "topics": ["screen"]},
    "orb": {"with": ["what_is_running", "set_panels"], "topics": ["orb"]},
    "rouh-links": {"with": ["read_rouh_link"], "topics": ["rouh_links"]},
    "workspace": {"with": ["read_workspace", "show_workspace_page"], "topics": ["workspace"]},
    "threads": {"with": ["show_canvas", "make_a_task", "move_task", "pin", "rename_this_chat"],
                "topics": ["tasks"]},
    "waiting": {"with": [], "topics": ["waiting"]},
    "decisions": {"with": ["decisions", "delegate"], "topics": ["decisions"]},
    "remember": {"with": ["remember", "forget"], "topics": ["remember"]},
    "thoughts": {"with": ["capture_thought", "thoughts"], "topics": ["thoughts"]},
    "boxes": {"with": ["new_box", "open_box"], "topics": ["boxes"]},
    # Told with their tools already on the Creator Rouh since 15 November 2026 (`rouh/tool_rules.py`); in the
    # plan so a Rouh that takes it has them in the same place.
    "youtube": {"with": ["youtube_transcript", "youtube_search"], "topics": []},
    "linkedin": {"with": ["linkedin_search", "linkedin_profile"], "topics": []},
    "pictures": {"with": ["make_picture", "change_picture"], "topics": []},
    "browser": {"with": ["browser"], "topics": []},
    "shipping": {"with": ["browser", "shipping"], "topics": []},
    "job-mail": {"with": ["assistant_job", "worker_outbox"], "topics": []},
    "helper": {"with": ["look_into"], "topics": []},
    "publishing": {"with": ["publish_task", "check_task_sharing"], "topics": []},
    "one-program": {"with": ["one"], "topics": []},
    "contacts": {"with": ["contacts"], "topics": []},
    "meeting-people": {"with": ["meeting_people"], "topics": []},
    "telegram": {"with": ["send_telegram"], "topics": []},
    "slack": {"with": ["slack"], "topics": []},
    "yourself": {"with": ["self"], "topics": []},
    "this-machine": {"with": ["self"], "topics": []},
    "time-and-goals": {"with": ["reminders"], "topics": []},
}

#: The one rule of tier 1 the plan adds: what moved, a line each, with what must hold before the tool is loaded.
#: Placed just before "How these rules rank", which says "Everything above is Rouh's built-in rules".
INDEX_TITLE = "Rules that come when they are needed"
INDEX_PLACE = {"part": "cached", "position": 185}
INDEX_TEXT = """Rules that come when they are needed:
Some of your built-in rules are not in these instructions every turn. Each comes with the tool it is about, at the end of that tool's description, the moment you load it, and with a message that is about its topic. Load the tool before you act on any of these or explain them, and follow the rules that come with it as you would any rule here:
- The screen: a list, a table, a number worth reading twice, code, a chart or a link goes on a card with show_on_screen, then one sentence about what is there; never read a table aloud. Its rules come with show_on_screen, revise_on_screen, show_again, what_was_on_screen, read_card and set_panels.
- The orb, the small circle in the bottom-left corner, is the live picture of the work running now: load what_is_running before you say what it shows or what any part of it means, and set_panels opens or closes it.
- A link to Rouh itself (an address on {hosts}this server's own address) is read with read_rouh_link, never with web_fetch or the browser.
- A question about the person's company, people, tasks or decisions is answered from their workspace with read_workspace, never from memory.
- A thread about a numbered task is that task, and show_canvas moves the canvas. Nothing makes a task unless the person asks for one: then make_a_task.
- A message that opens "Task 58 is waiting on me for this:" is their answer to that task: hand it to assistant_job at once, with the task's number, its question and their answer in their words.
- What waits on the person is one list, the decisions tool. Answer a decision only with the person's own words, and one that spends money, sends, publishes or cannot be undone needs their yes to that risk first.
- Keeping something: remember keeps a rule, a note or a word, and you say which and where. Their own thought or idea goes to capture_thought, never to remember.
- A box keeps something from you: never ask or guess what is in one, and one is opened only with open_box when their own words name it."""


# --- what a rule says about its tier -------------------------------------------------------------------


def topics_of(r: dict) -> list[str]:
    got = (r.get("when") or {}).get(KEY)
    if isinstance(got, str):
        got = [got]
    return [str(x) for x in got or [] if str(x) in TOPICS] if isinstance(got, list) else []


def on_demand(r: dict) -> bool:
    """Whether a rule is told only with its tools or with a message about it, never in every turn."""
    from . import tool_rules

    return tool_rules.told_with_tools(r) or bool(topics_of(r))


def for_page(r: dict) -> str:
    """The "Conditions:" line of a rule told with a message about its topics, for the Rules page."""
    names = [TOPICS[t][0] for t in topics_of(r)]
    said = names[0] if len(names) == 1 else ", ".join(names[:-1]) + " or " + names[-1]
    return f"In chats: also told for one turn when the person's message is about {said}, after the conversation"


# --- spotting what a message is about --------------------------------------------------------------------

_COMPILED = {k: [re.compile(p, re.IGNORECASE | re.MULTILINE) for p in pats] for k, (_t, pats) in TOPICS.items()}

#: The topics spotted in this turn's message, and the rules of tier 3 it was told: set by `Brain._system`, read
#: when the turn is written down (`note_turn`).
TURN: contextvars.ContextVar[dict | None] = contextvars.ContextVar("rouh_rule_tiers_turn", default=None)


def detect(text: str) -> list[str]:
    """The topics a piece of text is about, in `TOPICS` order."""
    text = str(text or "")
    if not text.strip():
        return []
    return [k for k, pats in _COMPILED.items() if any(p.search(text) for p in pats)]


def on_demand_topics(ds: dict | None) -> list[str]:
    """The topics whose rules are told on demand here now: only those can be missed by a turn."""
    if not ds:
        return []
    from . import rules

    return sorted({t for r in rules.rules(ds) if not r.get("for") for t in topics_of(r)})


def applied() -> bool:
    """Whether this Rouh runs on the plan now."""
    try:
        return _state().get("version") == VERSION
    except Exception:  # noqa: BLE001 - said as not applied
        return False


def turn_rules(ds: dict | None, topics: list[str], situation=None) -> list[dict]:
    """Copies of the rules told for these topics, placed in the turn part (`TURN_AT`), in their own order."""
    if not ds or not topics:
        return []
    from . import rules

    out = []
    for r in rules.rules(ds):
        mine = [t for t in topics_of(r) if t in topics]
        if not mine or r.get("for") or not rules.in_chat(r, situation):
            continue
        place = dict(r.get("place") or {})
        out.append({**r, "place": {"part": "turn", "position": TURN_AT},
                    "told_for": ", ".join(TOPICS[t][0] for t in mine),
                    "order": int(place.get("position") or 0)})
    return sorted(out, key=lambda r: (r["order"], r["made_at"], r["id"]))


# --- applying the plan to this Rouh, and taking it back --------------------------------------------------


def _state() -> dict:
    from .models.memory import AppState

    raw = AppState.objects.filter(key=STATE).values_list("value", flat=True).first()
    if not raw:
        return {}
    try:
        got = json.loads(raw) if isinstance(raw, str) else raw
    except ValueError:
        return {}
    return got if isinstance(got, dict) else {}


def _keep(value: dict) -> None:
    from .models.memory import AppState

    AppState.objects.update_or_create(key=STATE, defaults={"value": json.dumps(value)})


def _rows(ds: dict) -> dict[str, dict]:
    from .synapse import db

    out: dict[str, dict] = {}
    for r in db.rows("SELECT id, raw, meta, source_key FROM synapse.item WHERE dataset_id = %s AND kind = 'rule' "
                     "AND deleted_at IS NULL", (ds["id"],)):
        if r.get("source_key"):
            out.setdefault(str(r["source_key"]), r)
    return out


def _set_meta(row_id, meta: dict) -> None:
    from .synapse import db
    from .synapse.db import Json

    db.run("UPDATE synapse.item SET meta = %s::jsonb, updated_at = now() WHERE id = %s::uuid", (Json(meta), str(row_id)))


def status(ds: dict | None = None) -> dict:
    """Which plan is applied here, since when, and where each rule of the plan is told now."""
    from . import rules

    ds = ds or rules.master()
    got = _state()
    out = {"applied": got.get("version") or "", "at": got.get("at") or 0, "plan": VERSION, "rules": {}}
    if not ds:
        return out
    have = _rows(ds)
    for key in [*PLAN, INDEX_KEY]:
        row = have.get(key)
        if row is None:
            out["rules"][key] = "missing"
            continue
        when = (row.get("meta") or {}).get("when") or {}
        out["rules"][key] = {"with": when.get("with") or [], "topics": when.get(KEY) or [],
                             "every_turn": not (when.get("with") or when.get(KEY)),
                             "off": bool((row.get("meta") or {}).get("off"))}
    return out


def apply(ds: dict | None = None, *, by: str = "rule tiers") -> dict:
    """Move this Rouh's built-in rules into their tiers (`PLAN`), keeping each rule's `when` as it was so
    `revert` can put it back. Applying the same version again changes nothing."""
    from . import rules

    ds = ds or rules.master()
    if not ds:
        return {"done": False, "why": "this Rouh has no Synapse Master"}
    got = _state()
    if got.get("version") == VERSION:
        return {"done": False, "why": f"{VERSION} is applied already", "status": status(ds)}
    if got.get("version"):
        revert(ds, by=by)
    have = _rows(ds)
    # Where every rule of the plan is told now, written down before anything moves, so a move that fails half
    # way is still taken back whole by `revert`.
    before: dict[str, dict] = {}
    for key in PLAN:
        row = have.get(key)
        if row is not None:
            meta = row.get("meta") or {}
            before[key] = {"id": str(row["id"]), "when": meta.get("when"), "had_when": "when" in meta}
    index = have.get(INDEX_KEY) or _deleted_index(ds)
    if index is not None:
        before[INDEX_KEY] = {"id": str(index["id"]), "off": bool((index.get("meta") or {}).get("off"))}
    _keep({"version": VERSION, "at": time.time(), "by": by, "before": before, "moved": [],
           "index": {"id": str(index["id"]) if index is not None else ""}})
    moved = []
    for key, plan in PLAN.items():
        row = have.get(key)
        if row is None:
            continue
        meta = dict(row.get("meta") or {})
        when = dict(meta.get("when") or {})
        if plan["with"]:
            when["with"] = list(plan["with"])
        else:
            when.pop("with", None)
        if plan["topics"]:
            when[KEY] = list(plan["topics"])
        else:
            when.pop(KEY, None)
        meta["when"] = when
        meta["history"] = rules._with(meta.get("history"), rules._event(
            "where", by, said=f"{VERSION}: told with {', '.join(plan['with']) or 'no tool'}"
                              + (f" and for {', '.join(plan['topics'])}" if plan["topics"] else "")
                              + ", not in every turn"))
        _set_meta(row["id"], meta)
        moved.append(key)
    from .synapse import db
    from .synapse.db import Json

    if index is None:
        made = rules.add_rule(ds, INDEX_TEXT, by=by, group="rouh", origin=rules.origin_of(
            "agents", f"Added by the tiered rules ({VERSION}), {rules._day(time.time())}."))
        db.run("UPDATE synapse.item SET source_key = %s, meta = meta || %s::jsonb WHERE id = %s::uuid",
               (INDEX_KEY, Json({"title": INDEX_TITLE, "place": INDEX_PLACE, "when": {"in": ["chats"]},
                                 "fills": True, "guard": True}), made["id"]))
        index_id = str(made["id"])
    else:
        # Kept from an earlier apply, turned off by `revert`: on again, with this plan's words and place.
        meta = dict(index.get("meta") or {})
        meta.pop("off", None)
        meta.update({"title": INDEX_TITLE, "place": INDEX_PLACE, "when": {"in": ["chats"]}, "fills": True,
                     "guard": True})
        db.run("UPDATE synapse.item SET raw = %s, meta = %s::jsonb, deleted_at = NULL, updated_at = now() "
               "WHERE id = %s::uuid", (INDEX_TEXT, Json(meta), str(index["id"])))
        index_id = str(index["id"])
    got = _state()
    _keep({**got, "moved": moved, "index": {"id": index_id}})
    _forget_cache()
    return {"done": True, "version": VERSION, "moved": moved, "status": status(ds)}


def _deleted_index(ds: dict) -> dict | None:
    from .synapse import db

    got = db.rows("SELECT id, raw, meta, source_key FROM synapse.item WHERE dataset_id = %s AND kind = 'rule' "
                  "AND source_key = %s ORDER BY stored_at DESC LIMIT 1", (ds["id"], INDEX_KEY))
    return got[0] if got else None


def revert(ds: dict | None = None, *, by: str = "rule tiers") -> dict:
    """Put every rule the applied plan moved back exactly where it was told before, in one step, and the index
    rule away, turned off."""
    from . import rules

    ds = ds or rules.master()
    got = _state()
    if not ds or not got.get("version"):
        return {"done": False, "why": "no plan is applied here"}
    have = _rows(ds)
    back = []
    for key, was in (got.get("before") or {}).items():
        row = have.get(key)
        if row is None or key == INDEX_KEY:
            continue
        meta = dict(row.get("meta") or {})
        if was.get("had_when"):
            meta["when"] = was.get("when")
        else:
            meta.pop("when", None)
        meta["history"] = rules._with(meta.get("history"), rules._event(
            "where", by, said=f"{got.get('version')} taken back: told where it was before"))
        _set_meta(row["id"], meta)
        back.append(key)
    # The index rule is kept, turned off, so applying again turns it back on rather than making a second.
    index = have.get(INDEX_KEY)
    if index is not None:
        meta = dict(index.get("meta") or {})
        meta["off"] = True
        _set_meta(index["id"], meta)
    _keep({"version": "", "at": time.time(), "by": by, "reverted": got.get("version"), "back": back})
    _forget_cache()
    return {"done": True, "reverted": got.get("version"), "back": back, "status": status(ds)}


def _forget_cache() -> None:
    """Whatever this process keeps of the rules is read again on the next turn."""
    try:
        from . import rules

        clear = getattr(rules, "forget_cache", None)
        if callable(clear):
            clear()
    except Exception:  # noqa: BLE001 - the next read is fresh anyway
        log.debug("the rules' cache could not be cleared", exc_info=True)


# --- what each message was given, and what it missed ----------------------------------------------------


def _loaded_tools(messages) -> set[str]:
    """Every tool a request has the definition of: what a search loaded (`tool_reference`) and what was called,
    anywhere in the conversation, this turn's own rounds included."""
    from . import context_editing

    out: set[str] = set()
    for m in messages or []:
        content = context_editing._field(m, "content")
        for b in content if isinstance(content, list) else []:
            kind = context_editing._field(b, "type")
            if kind == "tool_use":
                out.add(str(context_editing._field(b, "name") or ""))
            elif kind == "tool_result":
                inner = context_editing._field(b, "content")
                for x in inner if isinstance(inner, list) else []:
                    if context_editing._field(x, "type") == "tool_reference":
                        out.add(str(context_editing._field(x, "tool_name") or ""))
    out.discard("")
    return out


def _called(messages, start: int) -> list[str]:
    """The tools this turn called: the tool_use blocks after the history it began with."""
    from . import context_editing

    out = []
    for m in list(messages or [])[start:]:
        if context_editing._field(m, "role") != "assistant":
            continue
        content = context_editing._field(m, "content")
        for b in content if isinstance(content, list) else []:
            if context_editing._field(b, "type") == "tool_use":
                out.append(str(context_editing._field(b, "name") or ""))
    return out


def judge(*, topics: list[str], told: list[str], loaded: set[str], called: list[str], reply: str,
          always: set[str] = frozenset(), on_demand: set[str] | None = None) -> dict:
    """What a turn touched and what it had in front of it. A topic is touched when the message spoke of it, the
    reply did, or a tool of it was called; it is covered when its tier 3 rules were told or a tool that carries
    them was loaded. A touched topic not covered is a flag: the turn may have answered it without its rules."""
    with_tools = {t for name, t in TOOL_TOPICS.items() if name in loaded or name in always}
    covered = set(told) | with_tools
    touched = set(topics) | set(detect(reply)) | {TOOL_TOPICS[n] for n in called if n in TOOL_TOPICS}
    # Only a topic whose rules are told on demand here can be missed; one told every turn is always in front.
    moved = set(on_demand) if on_demand is not None else {t for plan in PLAN.values() for t in plan["topics"]}
    flags = sorted(t for t in touched - covered if t in moved)
    return {"touched": sorted(touched & moved), "covered": sorted(covered & moved), "flags": flags,
            "tier2": sorted(with_tools & moved)}


def note_turn(*, turn_id: str, chat_id: str, messages, start: int, reply: str) -> None:
    """Write down what this turn was given and what it missed (`TurnTiers`), off the turn's way. Never raises."""
    got = TURN.get()
    if not got or not turn_id:
        return
    try:
        from . import config as _cfg

        always = set(getattr(_cfg.config, "tools_always_loaded", ()) or ())
        verdict = judge(topics=got.get("topics") or [], told=got.get("told") or [],
                        loaded=_loaded_tools(messages), called=_called(messages, start), reply=reply or "",
                        always=always, on_demand=set(got.get("on_demand") or []))
        row = {"turn_id": str(turn_id)[:64], "chat_id": str(chat_id or "")[:64], "at": time.time(),
               "version": got.get("version") or "", "topics": got.get("topics") or [],
               "tier3": got.get("rules") or [], "tier3_chars": int(got.get("chars") or 0),
               "tier2": verdict["tier2"], "touched": verdict["touched"], "flags": verdict["flags"]}
    except Exception:  # noqa: BLE001 - a record is never worth a turn
        log.exception("what turn %s was told could not be worked out", turn_id)
        return

    def write():
        from .models.llmlog import TurnTiers

        TurnTiers.objects.update_or_create(turn_id=row["turn_id"], defaults={
            k: v for k, v in row.items() if k != "turn_id"})

    try:
        from . import llmlog

        llmlog.WRITER.put(write)
    except Exception:  # noqa: BLE001
        log.warning("what turn %s was told could not be written down", turn_id, exc_info=True)


def for_call(turn_id: str) -> dict | None:
    """What the page of one call says of the rules its message was given (`usage_drill.call`)."""
    if not turn_id:
        return None
    try:
        from .models.llmlog import TurnTiers

        row = TurnTiers.objects.filter(turn_id=str(turn_id)[:64]).values().first()
    except Exception:  # noqa: BLE001 - the page works without it
        log.exception("what turn %s was told could not be read", turn_id)
        return None
    if not row:
        return None
    title = lambda keys: [TOPICS[k][0] for k in keys or [] if k in TOPICS]  # noqa: E731
    return {"version": row["version"], "topics": title(row["topics"]), "tier3": row["tier3"] or [],
            "tier3_tokens": int(round((row["tier3_chars"] or 0) / 3.6)), "tier2": title(row["tier2"]),
            "flags": title(row["flags"]), "touched": title(row["touched"])}
