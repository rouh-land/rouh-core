"""Four genes for somebody using Rouh for the first time (night 51 of the ledger, 22 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
makes Rouh easier for a first-time user, technical or not. Each has its own switch:

- **A plain line under each part of the navigation** (`nav_plain`, shows up by itself). The rail's
  boxes say Guide, Now, Work, Memory, Evolution and Anatomy, words that tell a newcomer little.
  Now the column of a group's links starts with one plain sentence of what is in it
  (`GROUP_PLAIN`), with Got it, which puts it away for that person on every device.
- **Search forgives a misspelt word** (`search_typos`, invisible). Search finds Rouh's own pages
  only when every word typed begins a word of a page's name or of the words people use for it, so
  "calender" or "setings" found nothing. Now, when nothing matches that way, a page whose words
  are one or two letters from what was typed is offered (`near`).
- **Search finds the lesson that teaches it** (`search_lessons`, you ask for it). "How do I connect
  my calendar" found no page. Now Search also lists the Guide's lessons whose title or
  first lines hold every word that matters in what was typed (`lessons`), and opens the lesson.
- **? lists Rouh's keys** (`keys_list`, changes how you work). Rouh answers to keys (Ctrl+B for the
  navigation, Escape to stop a turn, Ctrl+Shift+Space for dictation, 1 to 4 on a conflict) that
  were said only in a tooltip. Now ? outside a text box lists every one, and what it does
  (`app/keys.js`).

The page is told which are on and what they need in `#rouhNewcomer` (`for_page`); Search asks
`near` and `lessons` on the server (`rouh/searching.py`), and each reports its use through
`POST /api/newcomer` (`rouh/web/newcomer.py`). No model is asked. The one thing kept is the groups
a person pressed Got it on, in `user_settings` (`SEEN`), scoped to the person.
"""
from __future__ import annotations

import json
import re
import time
from typing import Callable, Iterable

#: Each gene's switch, its title, and the one event it reports.
GENES: dict[str, tuple[str, str]] = {
    "nav_plain": ("A plain line under each part of the navigation", "got_it"),
    "search_typos": ("Search forgives a misspelt word", "opened"),
    "search_lessons": ("Search finds the Guide lesson that teaches it", "opened"),
    "keys_list": ("? lists the keys Rouh answers to", "opened"),
}

#: What each group of the navigation holds, in one plain sentence for somebody who has never seen it.
GROUP_PLAIN: dict[str, str] = {
    "handholding": "The Guide: short lessons that take you through Rouh one step at a time.",
    "now": "What needs you now: questions waiting for your answer and today's brief.",
    "work": "Your work: tasks with their steps and pages, goals, and what runs on a schedule.",
    "memory": "What Rouh keeps for you: your thoughts, the rules it follows, and people you trust.",
    "evolution": "How Rouh grows: the background work it does, and the new abilities it tries out.",
    "machine": "Rouh itself: your account, your connections, how it behaves, and what it costs.",
}

#: The groups a person pressed Got it on, in `user_settings`.
SEEN = "nav_plain"

#: Words that say nothing about what is wanted, left out when a lesson is matched.
STOP = frozenset("""
a an the i me my mine we our you your it its is are be do does did can could how what where when which
who why to of in on at for with and or from into about this that these those please want need get make
let lets use using show tell help way ways some any there here up out set setting""".split())


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def seen(who) -> list[str]:
    """The groups this person put the plain line away on."""
    from .models import UserSetting

    value = (UserSetting.objects.filter(user_id=str(who.user_id), org_id=str(who.org_id or ""), name=SEEN)
             .values_list("value", flat=True).first())
    try:
        got = json.loads(value) if value else []
    except (TypeError, ValueError):
        got = []
    return [g for g in got if g in GROUP_PLAIN] if isinstance(got, list) else []


def got_it(who, group: str) -> list[str]:
    """Keep that this person has read `group`'s plain line, on the server, for every device."""
    from .models import UserSetting

    now = [g for g in seen(who) if g != group] + ([group] if group in GROUP_PLAIN else [])
    UserSetting.objects.bulk_create(
        [UserSetting(user_id=str(who.user_id), org_id=str(who.org_id or ""), name=SEEN, value=json.dumps(now),
                     updated_at=time.time())],
        update_conflicts=True, unique_fields=["user_id", "name"], update_fields=["org_id", "value", "updated_at"])
    return now


def for_page(who) -> dict:
    """What `#rouhNewcomer` tells the page: which are on, and the plain lines still to show."""
    on = on_for(who)
    out: dict = {"on": on}
    if "nav_plain" in on:
        done = set(seen(who))
        out["plain"] = {g: line for g, line in GROUP_PLAIN.items() if g not in done}
    return out


def used(who, switch: str, detail: str = "") -> bool:
    """One of the four used: counted, and for nav_plain the group is kept as read.
    False for one not known or switched off."""
    from . import evolution, switches

    if switch not in GENES or who is None or not switches.on(switch, _org(who)):
        return False
    detail = str(detail or "")[:80]
    if switch == "nav_plain":
        if detail not in GROUP_PLAIN:
            return False
        got_it(who, detail)
        evolution.used("nav_plain", "got_it", who=who, detail=detail)
    elif switch == "search_typos":
        evolution.used("search_typos", "opened", who=who, detail=detail)
    elif switch == "search_lessons":
        evolution.used("search_lessons", "opened", who=who, detail=detail)
    else:
        evolution.used("keys_list", "opened", who=who, detail=detail)
    return True


# --- Search forgives a misspelt word (search_typos) -------------------------------------------


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", str(text or "").lower())


def _distance(a: str, b: str, most: int) -> int:
    """Letters to change, add, drop or swap to turn `a` into `b`, stopping past `most`."""
    if abs(len(a) - len(b)) > most:
        return most + 1
    prev2: list[int] | None = None
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
            if prev2 is not None and i > 1 and j > 1 and ca == b[j - 2] and a[i - 2] == cb:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        if min(cur) > most:
            return most + 1
        prev2, prev = prev, cur
    return prev[-1]


def _allowed(word: str) -> int:
    """How many letters a word typed may be off by: none under four letters, one to six, two after."""
    return 0 if len(word) < 4 else 1 if len(word) < 7 else 2


def _close(asked: str, said: str) -> bool:
    """Whether a word typed is a misspelling of a word, or of the start of one."""
    most = _allowed(asked)
    if not most:
        return said.startswith(asked)
    if said.startswith(asked):
        return True
    if _distance(asked, said, most) <= most:
        return True
    return len(said) > len(asked) and _distance(asked, said[:len(asked)], most) <= most


def near(words: Iterable[str], genes: Iterable[dict], switch_on: Callable[[str], bool], limit: int = 3) -> list[dict]:
    """The genes whose name or words a search's words are a letter or two from, best first: the
    fewest letters off, a name before an alias. Asked only when nothing matched exactly."""
    from .genes import shown

    asked = [w for w in (str(x).lower().strip() for x in words) if w]
    if len("".join(asked)) < 4 or not any(_allowed(w) for w in asked):
        return []
    found = []
    for m in genes:
        if not shown(m, switch_on):
            continue
        for rank, said in [(0, _words(m["name"]))] + [(1, _words(a)) for a in m.get("aliases") or ()]:
            if said and all(any(_close(a, w) for w in said) for a in asked):
                off = sum(min(_distance(a, w, 3) for w in said) for a in asked)
                found.append((off, rank, m["nav"]["place"] != "list", m["name"], m))
                break
    found.sort(key=lambda row: row[:4])
    return [row[-1] for row in found[:limit]]


# --- Search finds the lesson that teaches it (search_lessons) ---------------------------------


def lessons(query: str, limit: int = 3) -> list[dict]:
    """The Guide's lessons that hold every word that matters in `query`, in their title or first lines,
    best first (the most words in the title), as {id, title, route}. A tip has no line of what it
    teaches since 23 November 2026 (Petar)."""
    from . import handholding

    asked = [w for w in _words(query) if w not in STOP and len(w) >= 3]
    if not asked:
        return []
    found = []
    for at, les in enumerate(handholding.lessons()):
        title = _words(les.get("title", ""))
        rest = title + _words(" ".join(les.get("summary") or []))
        if not all(any(w.startswith(a) for w in rest) for a in asked):
            continue
        in_title = sum(1 for a in asked if any(w.startswith(a) for w in title))
        found.append((-in_title, at, les))
    found.sort(key=lambda row: row[:2])
    return [{"id": les["id"], "title": les.get("title", ""),
             "route": handholding.lesson_route(les["id"])} for _, _, les in found[:limit]]
