"""Four genes for somebody using Rouh for the first time (night 53 of the ledger, 24 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
makes Rouh easier for a first-time user, technical or not. Each has its own switch:

- **The Guide's search reads a question** (`guide_search`, invisible). The Guide's Search tips box
  found a tip only when every word typed was in it, so a newcomer who typed the way they would ask
  ("where are my reminders") found nothing, though "reminder" finds Set a reminder. Now, when no
  tip holds every word, the Guide searches again with the words that matter (`STOP`), forgiving an
  ending ("reminders" finds "reminder"), in `handholdingpage.js`. A search that found tips before
  finds the same.
- **The Guide answers while chat is not set up** (`guide_answers`, shows up by itself). A
  newcomer's first message, sent before any AI service is connected, was met by the note "Chat is
  not set up yet" and nothing else. Now the note also lists the Guide's lessons about the words
  they asked (`guide_for`), and Start here when none is about them, so the first question gets an
  answer of a kind with no model at all.
- **What is this page?** (`page_what`, you ask for it). Metabolism, Synapse, Anatomy, Clockwork,
  Quests: a newcomer cannot tell from the name what the page is for. Now a (?) beside the name of
  one of Rouh's own pages says, in one or two plain sentences, what it holds and what to do
  there (`PLAIN`).
- **Ask Rouh about words you select** (`select_ask`, changes how you work). The workspace's pages
  have Ask AI on a selection; Rouh's own pages had nothing. Now words selected on one of them
  offer Ask Rouh, which asks in the conversation what they mean, there.

The page is told which are on, and the plain lines, in `#rouhFirstHelp` (`for_page`); the turn that
could not be answered asks `guide_for` (`rouh/runtime.py`); each reports its use through
`POST /api/first-help` (`rouh/web/first_help.py`). No model is asked, and nothing is kept.
"""
from __future__ import annotations

import logging
import re
from collections.abc import Iterator, Mapping

log = logging.getLogger("rouh.first_help")

#: Each gene's switch, its title, and the events it reports.
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "guide_search": ("The Guide's search reads a question, not only its key words", ("found",)),
    "guide_answers": ("While chat is not set up, the Guide answers what you asked", ("opened", "shown")),
    "page_what": ("What is this page? Rouh's own pages say what they are for, in plain words", ("opened",)),
    "select_ask": ("Ask Rouh about words you select on Rouh's own pages", ("asked",)),
}

class _Plain(Mapping):
    """What each of Rouh's own pages is for, by the name its heading says, for somebody who has never
    seen it: the Guide's help spots with a `heading` (`rouh/help_spots.py`), read whenever asked, so the
    plain line and the help icon beside a page's name are one sentence in one place (25 November 2026)."""

    def _now(self) -> dict[str, str]:
        from . import help_spots

        return help_spots.plain()

    def __getitem__(self, name: str) -> str:
        return self._now()[name]

    def __iter__(self) -> Iterator[str]:
        return iter(self._now())

    def __len__(self) -> int:
        return len(self._now())


#: What each of Rouh's own pages is for, by the name its heading says. Plain words, no Rouh terms.
PLAIN: Mapping[str, str] = _Plain()

#: The words of a question that only frame it ("What does ... mean, on the ... page?", select_ask's own),
#: left out when the Guide's lessons are matched.
FRAME = frozenset({"mean", "means", "meaning", "page", "pages", "word", "words", "here", "this"})

#: The fewest letters a selected word or phrase may have, and the most words, for Ask Rouh.
SELECT_LEAST = 2
SELECT_MOST_WORDS = 12


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation, for the page."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def stop_words() -> list[str]:
    """The words that only carry a question, for the Guide's search (guide_search): Search's own
    (`newcomer.STOP`, and the verbs of `first_steps.ASKING`) and the question's frame (`FRAME`)."""
    from . import first_steps, newcomer

    return sorted(set(newcomer.STOP) | set(first_steps.ASKING) | FRAME)


def for_page(who) -> dict:
    """What `#rouhFirstHelp` tells the page: which are on, the plain lines while `page_what` is,
    the words a question carries while `guide_search` is, and how much a selection may hold."""
    on = on_for(who)
    return {"on": on, "plain": dict(PLAIN) if "page_what" in on else {},
            "stop": stop_words() if "guide_search" in on else [],
            "select": {"least": SELECT_LEAST, "most_words": SELECT_MOST_WORDS}}


# --- guide_answers -----------------------------------------------------------------------------


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", str(text or "").lower())


def _same(asked: str, word: str) -> bool:
    """Whether a word asked is a word of a lesson: the start of it ("remind" of "reminder"), or the
    lesson's word with an ending on it ("reminders" of "reminder")."""
    return word.startswith(asked) or (len(word) >= 4 and asked.startswith(word) and len(asked) - len(word) <= 3)


def guide_for(asked: str, who=None, limit: int = 3) -> dict | None:
    """The Guide's lessons about what was asked, for the note "Chat is not set up yet", while
    `guide_answers` is on: {head, lessons: [{id, title, route, start}]}, best first, or Start here
    (the first lesson of the path) when none is about the words. None while it is off.

    A lesson is about the words when at least half of the words that matter (never fewer than
    one) are words of its title or its first lines (`_same`); one with more of them in its title
    comes first, then one with more of them at all."""
    from . import first_steps, handholding, newcomer, switches

    if not switches.on("guide_answers", _org(who)):
        return None
    try:
        every = handholding.lessons()
    except Exception:  # noqa: BLE001 - the note still says chat is not set up
        log.exception("guide_answers: the Guide's lessons could not be read")
        return None
    if not every:
        return None
    left: list[str] = []
    for word in first_steps.what_matters(_words(asked)):
        for part in _words(first_steps.OTHER_APPS.get(word, word)):
            if len(part) >= 3 and part not in newcomer.STOP and part not in FRAME and part not in left:
                left.append(part)
    found = []
    if left:
        need = max(1, (len(left) + 1) // 2)
        for at, les in enumerate(every):
            title = _words(les.get("title", ""))
            rest = title + _words(" ".join(les.get("summary") or []))
            hits = [w for w in left if any(_same(w, x) for x in rest)]
            if len(hits) < need:
                continue
            in_title = sum(1 for w in hits if any(_same(w, x) for x in title))
            found.append((-in_title, -len(hits), at, les))
        found.sort(key=lambda row: row[:3])
        # A lesson named for what was asked says it better than one that only mentions it.
        if found and found[0][0] < 0:
            found = [row for row in found if row[0] < 0]
    if found:
        lessons = [{"id": les["id"], "title": les.get("title", ""), "route": handholding.lesson_route(les["id"]),
                    "start": False} for *_, les in found[:limit]]
        head = "While it is not set up, the Guide has lessons about this:"
    else:
        first = every[0]
        lessons = [{"id": first["id"], "title": first.get("title", ""),
                    "route": handholding.lesson_route(first["id"]), "start": True}]
        head = "While it is not set up, the Guide can show you around. Start here:"
    from . import evolution

    evolution.used("guide_answers", "shown", who=who, detail=", ".join(les["id"] for les in lessons))
    return {"head": head, "lessons": lessons}


# --- what the page reports ---------------------------------------------------------------------


def used(who, switch: str, event: str, detail: str = "") -> bool:
    """One of the page's four used: counted, nothing else. False for one not known, an event it
    does not report, or a switch that is off."""
    from . import evolution, switches

    if switch not in GENES or event not in GENES[switch][1] or who is None:
        return False
    if (switch, event) == ("guide_answers", "shown"):
        return False  # the server's own, never the page's
    if not switches.on(switch, _org(who)):
        return False
    detail = " ".join(str(detail or "").split())[:120]
    if switch == "guide_answers":
        evolution.used("guide_answers", "opened", who=who, detail=detail)
    elif switch == "page_what":
        evolution.used("page_what", "opened", who=who, detail=detail)
    elif switch == "guide_search":
        evolution.used("guide_search", "found", who=who, detail=detail)
    else:
        evolution.used("select_ask", "asked", who=who, detail=detail)
    return True
