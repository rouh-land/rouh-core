"""A finished case's entry in a chat, as the model is sent it: one line, with a link to its whole record.

Petar, 25 November 2026 (task 182, step 182-19), of a message in a contact's case chat that cost $2.02,
83% of it the chat's own history and most of that Rouh's own working record of her earlier messages:
"do the suggested fix and don't dig into why the case is long ... also obviously have the tools to explore
the case when necessary".

When somebody else writes - an email, a Telegram or a Slack message - its case (`rouh/mail_cases.py`)
works in the chat it belongs to: a long note from Rouh's own software (the brief of its reading, or of its
start), then the model's tool calls, their results and its few words of what it found. That is about
15,000 characters around a message of about 250, and every later message of that chat sent all of it again.

So in what is sent, never in what is stored, each entry of a case that is finished becomes one note:

    [A note from Rouh's own software, not the person: Case 25, Irena on Telegram, 5 Oct 2026: "her own
    words, cut to about 300 characters". What Rouh did: read it (answered); started job c72557d8,
    "Venue research". Rouh's own words then: "...". Full record: https://.../mail/case/<key>]

- **An entry** is a case's note (`is_case_note`) and everything after it up to the next message that is
  not a set of tool results: the person's next words, the next note, a job's report. Nothing else of the
  chat is touched: the person's own words and Rouh's replies to them go whole, as before.
- **Which case**, from the note's own words: every turn of a case keeps the very brief it was started
  with (`MailCaseTrace`, kind "turn"), so the note is found by its hash; a note older than that by the
  message id it names. A note whose case cannot be found goes whole.
- **Only finished cases** (Petar: "while a case is still being handled ... that case's entry goes in
  whole"): a case at one of the steps of a run (`case_state.IN_FLIGHT`), which includes the turn handling
  it now, goes whole, so its own turns read their reading exactly as before.
- **The line never changes once made** (the prompt cache reads a chat back only while what is in front of
  the new message is the same): it is made only of what a case keeps from the start (its number, key,
  sender, channel, the message's date and words) and of the entry's own stored messages.
- **The whole record is one call away**: the link is the case's page, which `read_rouh_link` reads
  (`rouhlinks._mail_case`), and the case page itself.

The hash finds only the case whose brief is word for word in this chat already, so nothing of another
case or another person's is reached through it.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
from email.utils import parsedate_to_datetime

log = logging.getLogger(__name__)

#: How much of their own words the line keeps, and of Rouh's own few words of what it did.
WORDS_MOST = 300
SAID_MOST = 240

#: The two heads a case's note starts with, after the note's own mark: the reading's ("A new email has
#: arrived in <inbox>, from <kind>", the inbox an address or "the inbox"; its reading for the owner's own mail
#: says "<inbox>, the inbox you read for" instead, and is no case), and the start's (`mail_cases.CASE_MARK`).
_READING = re.compile(r"A new email has arrived in [^,\]]{1,200}, from ")
_START = "An email case, "
#: The message id a reading names: "The message, id X:" since 11 October 2026, "The email, message id X:"
#: before.
_MESSAGE_ID = re.compile(r"\nThe (?:message, id|email, message id) (\S+?):\n")

#: What each outcome of a case_report says, in a few words.
OUTCOMES = {
    "asks": "read its asks", "no_action": "nothing to do", "junk": "junk", "done": "answered",
    "needs_work": "it needed more than they hold", "needs_approval": "asked for your approval",
    "blocked": "declined", "started": "started the work", "waiting_on_job": "handed to a job",
}

_lock = threading.Lock()
#: Note hash to case id, once found: a note's case never changes.
_FOUND: dict[str, int] = {}


def _note_text(message: dict) -> str:
    """The note a user message starts with, or ""."""
    from . import turnmarks

    if not isinstance(message, dict) or message.get("role") != "user":
        return ""
    content = message.get("content")
    if isinstance(content, str):
        text = content
    elif isinstance(content, list) and content and isinstance(content[0], dict) \
            and content[0].get("type") == "text":
        text = str(content[0].get("text") or "")
    else:
        return ""
    return text if text.startswith(turnmarks.NOTE) else ""


def is_case_note(text: str) -> bool:
    """Whether a note is the brief a case's turn was started with."""
    from . import turnmarks

    if not text.startswith(turnmarks.NOTE):
        return False
    head = text[len(turnmarks.NOTE):len(turnmarks.NOTE) + 200].lstrip()
    return head.startswith(_START) or bool(_READING.match(head))


def _starts_turn(message: dict) -> bool:
    """Whether a message begins something new: a user message with no tool result in it. One that carries a
    result belongs to the call before it, so an entry is never cut between a call and its result."""
    if not isinstance(message, dict) or message.get("role") != "user":
        return False
    content = message.get("content")
    if not isinstance(content, list):
        return True
    return not any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content)


def entries(history: list) -> list[tuple[int, int, str]]:
    """Each case's entry in a conversation: (where it starts, where it ends, exclusive; its note)."""
    out = []
    i, n = 0, len(history)
    while i < n:
        note = _note_text(history[i])
        if note and is_case_note(note):
            j = i + 1
            while j < n and not _starts_turn(history[j]):
                j += 1
            out.append((i, j, note))
            i = j
            continue
        i += 1
    return out


def _digest(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()  # noqa: S324 - matching, not security


def _cases_for(notes: list[str]) -> dict[str, dict]:
    """Each note's case, by the note's hash: {hash: the case's row}. A note whose case is not found is not
    in it."""
    from django.db.models.fields.json import KT
    from django.db.models.functions import MD5

    from .models import MailCase, MailCaseTrace

    hashes = {_digest(t): t for t in notes}
    with _lock:
        found = {h: _FOUND[h] for h in hashes if h in _FOUND}
    missing = [h for h in hashes if h not in found]
    if missing:
        for row in (MailCaseTrace.objects.filter(kind="turn").annotate(h=MD5(KT("data__brief")))
                    .filter(h__in=missing).values("h", "case_id")):
            found[row["h"]] = row["case_id"]
        # A note from before its turn's brief was kept: the message id it names.
        by_message = {}
        for h in missing:
            if h in found:
                continue
            m = _MESSAGE_ID.search(hashes[h])
            if m:
                by_message[m.group(1)] = h
        if by_message:
            for row in MailCase.objects.filter(message_id__in=list(by_message)).values("id", "message_id"):
                found.setdefault(by_message[row["message_id"]], row["id"])
        with _lock:
            if len(_FOUND) > 20_000:
                _FOUND.clear()
            _FOUND.update({h: found[h] for h in missing if h in found})
    if not found:
        return {}
    rows = {r["id"]: r for r in MailCase.objects.filter(id__in=set(found.values())).values(
        "id", "key", "stage", "sender", "sender_name", "message_id", "email")}
    return {h: rows[c] for h, c in found.items() if c in rows}


def _finished(case: dict) -> bool:
    from . import case_state

    return case.get("stage") not in case_state.IN_FLIGHT


def _channel(case: dict) -> str:
    from . import telegram_guests

    if telegram_guests.on_telegram(str(case.get("message_id") or "")):
        return "Telegram"
    said = str((case.get("email") or {}).get("channel") or "email")
    return {"slack": "Slack", "email": "email"}.get(said, said)


def _date(case: dict) -> str:
    raw = str((case.get("email") or {}).get("date") or "").strip()
    if not raw:
        return ""
    try:
        d = parsedate_to_datetime(raw)
        return f"{d.day} {d.strftime('%b %Y')}"
    except (TypeError, ValueError, IndexError):
        return raw[:40]


def _cut(text: str, most: int) -> str:
    text = " ".join(str(text or "").split())
    if len(text) <= most:
        return text
    return text[:most].rsplit(" ", 1)[0].rstrip(",.;:") + " ..."


def _link(key: str) -> str:
    from .mail_cases import case_path

    base = (os.environ.get("ROUH_PUBLIC_URL") or "").rstrip("/")
    return base + case_path(key)


def _did(span: list, start: bool) -> str:
    """What Rouh did in an entry, from its own stored messages: what it reported, the jobs it started, and its
    own last words."""
    outcome, jobs, last, names = "", [], "", {}
    for m in span:
        content = m.get("content") if isinstance(m, dict) else None
        for b in content if isinstance(content, list) else []:
            if not isinstance(b, dict):
                continue
            kind = b.get("type")
            if kind == "tool_use":
                names[str(b.get("id") or "")] = str(b.get("name") or "")
                if b.get("name") == "case_report" and isinstance(b.get("input"), dict):
                    outcome = str(b["input"].get("outcome") or outcome)
            elif kind == "tool_result" and names.get(str(b.get("tool_use_id") or "")) == "assistant_job":
                c = b.get("content")
                if isinstance(c, list):
                    c = "".join(str(x.get("text") or "") for x in c if isinstance(x, dict))
                try:
                    got = json.loads(str(c or ""))
                except ValueError:
                    got = None
                if isinstance(got, dict) and got.get("id"):
                    jobs.append(f'started job {got["id"]}' + (f', "{got["title"]}"' if got.get("title") else ""))
            elif kind == "text" and m.get("role") == "assistant" and str(b.get("text") or "").strip():
                last = str(b["text"])
    step = "started the work it was let do" if start else "read it"
    parts = [step + (f" ({OUTCOMES.get(outcome, outcome.replace('_', ' '))})" if outcome else "")] + jobs
    said = f' Rouh\'s own words then: "{_cut(last, SAID_MOST)}"' if last else ""
    return "; ".join(parts) + "." + said


def line(case: dict, note: str, span: list) -> str:
    """The one line a finished case's entry is sent as."""
    from . import turnmarks

    name = str(case.get("sender_name") or case.get("sender") or "somebody")
    when = _date(case)
    words = _cut((case.get("email") or {}).get("body") or "", WORDS_MOST) or "(nothing written)"
    start = note[len(turnmarks.NOTE):].lstrip().startswith(_START)
    return (f"{turnmarks.NOTE} Case {case['id']}, {name} on {_channel(case)}" + (f", {when}" if when else "")
            + f': "{words}". What Rouh did: {_did(span, start)} '
            f"Full record, with everything it read and did: {_link(case['key'])}]")


def shorten(history: list) -> tuple[list, dict]:
    """The conversation with every finished case's entry as one line (module docstring). Returns the new list
    and what it did: {"cases": entries shortened, "whole": entries of open cases or of no case found,
    "characters": characters left out}. The caller's list is never changed: it is the database's."""
    did = {"cases": 0, "whole": 0, "characters": 0}
    found = entries(history)
    if not found:
        return history, did
    try:
        cases = _cases_for([note for _i, _j, note in found])
    except Exception:  # noqa: BLE001 - a chat is sent whole rather than not at all
        log.exception("the cases in a chat's history could not be looked up; sent whole")
        did["whole"] = len(found)
        return history, did
    out, at = [], 0
    for i, j, note in found:
        case = cases.get(_digest(note))
        if case is None or not _finished(case):
            did["whole"] += 1
            continue
        out += history[at:i]
        span = history[i:j]
        said = line(case, note, span)
        out.append({"role": "user", "content": [{"type": "text", "text": said}]})
        did["cases"] += 1
        did["characters"] += max(0, len(json.dumps(span, ensure_ascii=False)) - len(said))
        at = j
    out += history[at:]
    return out, did


def open_at(history: list) -> list[int]:
    """Where each entry of a case still being handled starts in this conversation: a case found, at one of
    the steps of a run (`chat_window` keeps these out of a summary). A note whose case is not found is not
    open: an old one would otherwise hold a chat's window back for ever."""
    found = entries(history)
    if not found:
        return []
    try:
        cases = _cases_for([note for _i, _j, note in found])
    except Exception:  # noqa: BLE001 - not known to be open
        log.exception("the cases in a chat's history could not be looked up")
        return []
    return [i for i, _j, note in found
            if (case := cases.get(_digest(note))) is not None and not _finished(case)]


def sized(history: list) -> dict:
    """What a conversation's case entries come to as they are sent, for the strip's panel (`reading`):
    {"short": entries sent as one line, "short_tokens", "whole": entries sent whole (a case still being
    handled, or none found), "whole_tokens"}, counted by `tokencount` on what goes."""
    from . import tokencount

    out = {"short": 0, "short_tokens": 0, "whole": 0, "whole_tokens": 0}
    found = entries(history)
    if not found:
        return out
    try:
        cases = _cases_for([note for _i, _j, note in found])
    except Exception:  # noqa: BLE001 - a size on a panel
        log.exception("the cases in a chat's history could not be looked up to size them")
        cases = {}
    for i, j, note in found:
        case = cases.get(_digest(note))
        if case is None or not _finished(case):
            out["whole"] += 1
            out["whole_tokens"] += tokencount.messages(history[i:j])
        else:
            out["short"] += 1
            out["short_tokens"] += tokencount.messages(
                [{"role": "user", "content": [{"type": "text", "text": line(case, note, history[i:j])}]}])
    return out
