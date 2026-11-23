"""Four genes for somebody using Rouh for the first time, around Search and the keyboard (night 52 of
the ledger, 23 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
makes Rouh easier for a first-time user, technical or not. Each has its own switch:

- **Search reads a question** (`search_words`, invisible). Search finds Rouh's own pages only when
  every word typed begins a word of a page's name or of the words people use for it, so a newcomer
  who types the way they would ask ("how do I change my password", "where are my reminders")
  found nothing, though "change password" and "reminders" each find their page. Now, when nothing
  matches, the words that only carry the question (`newcomer.STOP`, and the verbs of `ASKING`) are
  left out, a word from other apps is read as Rouh's own (`OTHER_APPS`: "billing", "logout",
  "todo"), and Search tries again.
- **Ask Rouh instead** (`search_ask`, shows up by itself). Search that found nothing said only
  "Nothing matches", and a newcomer who had typed a question into it was left with nowhere to go.
  Now, under that line, Ask Rouh carries the same words to the conversation and sends them.
- **Search finds a setting** (`search_settings`, you ask for it). Anatomy's sections hold cards a
  newcomer looks for by name (Password, Email signatures, Location, Voice detection), and Search
  knew only the sections. Now Search lists the card whose heading or first line holds what was
  typed (`settings`), and opening it goes to its section, scrolled to the card, which is lit for a
  moment.
- **Type anywhere** (`type_anywhere`, changes how you work). A newcomer who starts typing while
  nothing has the cursor (after pressing a link, or closing a page) typed into nothing. Now a
  letter typed with nothing focused, no dialog open and the conversation on screen goes into the
  conversation's box, with the letter.

The page is told which are on in `#rouhFirstSteps` (`for_page`); Search asks `plain_find` and
`settings` on the server (`rouh/searching.py`), and each reports its use through
`POST /api/first-steps` (`rouh/web/first_steps.py`). No model is asked, and nothing is kept.
"""
from __future__ import annotations

import html
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Callable, Iterable

log = logging.getLogger("rouh.first_steps")

#: Each gene's switch, its title, and the one event it reports.
GENES: dict[str, tuple[str, str]] = {
    "search_words": ("Search reads a question, not only its key words", "opened"),
    "search_ask": ("Ask Rouh instead, when Search finds nothing", "asked"),
    "search_settings": ("Search finds a setting inside Anatomy's pages, and opens it there", "opened"),
    "type_anywhere": ("Type anywhere: a letter typed with nothing focused goes into the conversation's box", "typed"),
}

#: Verbs that ask for a place rather than name it, left out after the words of `newcomer.STOP`.
ASKING = frozenset("""
change changing edit update open find see view look go turn switch manage put add remove delete check
where whats is was am rouh rouhs set setup configure adjust start stop enable disable not working broken wrong
problem problems issue doesnt dont wont cant list screen menu section button tab""".split())

#: A word a newcomer brings from other apps, read as the words Rouh's own pages answer to.
OTHER_APPS: dict[str, str] = {
    "billing": "payments", "bill": "payments", "logout": "log out", "signout": "sign out",
    "login": "sign in", "todo": "tasks", "todos": "tasks", "upgrade": "update rouh",
    "mobile": "phone", "iphone": "phone", "android": "phone", "tutorials": "tutorial",
    "faq": "help", "onboarding": "help", "preference": "preferences", "config": "settings",
    "integration": "integrations", "notification": "notifications", "alert": "alerts",
    "timezone": "time zone", "calender": "calendar", "e-mail": "email", "mail": "email",
}

#: Where the settings' cards are drawn.
PAGE = Path(__file__).resolve().parent / "templates" / "rouh" / "index.html"


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def for_page(who) -> dict:
    """What `#rouhFirstSteps` tells the page: which are on."""
    return {"on": on_for(who)}


def what_matters(words: Iterable[str]) -> list[str]:
    """The words of a question that name what is wanted: the question's own words left out, and a
    word from other apps put in Rouh's (`OTHER_APPS`)."""
    from .newcomer import STOP

    out: list[str] = []
    for w in words:
        w = str(w).lower().strip()
        if not w or w in STOP or w in ASKING:
            continue
        out.extend(OTHER_APPS.get(w, w).split())
    return out


def plain_find(asked: list[str], switch_on: Callable[[str], bool], extra: Iterable[dict] = ()) -> list[dict]:
    """Rouh's pages for a question Search found nothing for, while `search_words` is on: the words
    that matter, then, if that finds nothing and there are two or more, each on its own."""
    from . import genes

    if not switch_on("search_words"):
        return []
    left = what_matters(asked)
    if not left or left == [str(w).lower() for w in asked]:
        return []
    found = genes.find(left, switch_on, extra=extra)
    if found or len(left) < 3:
        return found
    # Word by word, a page must be named by at least two of three or more. One word on its own
    # ("end", "mode") is a guess, not an answer: Ask Rouh instead is then offered.
    need = 2
    hits: dict[str, list] = {}
    for w in left:
        for m in genes.find([w], switch_on, limit=3, extra=extra):
            hits.setdefault(m["id"], [m, 0])[1] += 1
    return [m for m, n in sorted(hits.values(), key=lambda h: -h[1]) if n >= need][:4]


def _text(fragment: str) -> str:
    """Words a reader sees in a piece of the template: tags, Django's own and HTML's, taken out."""
    fragment = re.sub(r"\{%.*?%\}|\{\{.*?\}\}|\{#.*?#\}", " ", fragment, flags=re.S)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return " ".join(html.unescape(fragment).split())


@lru_cache(maxsize=1)
def cards() -> tuple[dict, ...]:
    """Every card of Anatomy's sections with a heading of its own: its section, the heading's id
    and words, and the first line of help under it. Read once from the page's template."""
    try:
        page = PAGE.read_text(encoding="utf-8")
    except OSError:
        log.warning("first_steps: the page's template could not be read")
        return ()
    page = re.sub(r"\{% comment %\}.*?\{% endcomment %\}", " ", page, flags=re.S)
    out = []
    starts = [(m.start(), m.group(1)) for m in re.finditer(r'<div class="settings-section" data-section="([a-z0-9-]+)"', page)]
    for i, (at, section) in enumerate(starts):
        # A section ends where the next starts, and the last where Anatomy's layer does.
        layer = page.find("<article", at)
        end = min(starts[i + 1][0] if i + 1 < len(starts) else len(page), layer if layer > 0 else len(page))
        body = page[at:end]
        for h in re.finditer(r'<h4[^>]*\bid="([A-Za-z0-9_-]+)"[^>]*>(.*?)</h4>', body, flags=re.S):
            head = _text(h.group(2))
            if not head:
                continue
            rest = body[h.end():h.end() + 3000]
            nxt = re.search(r"<h4\b", rest)
            rest = rest[:nxt.start()] if nxt else rest
            helpm = re.search(r'<p class="settings-help"[^>]*>(.*?)</p>', rest, flags=re.S)
            out.append({"section": section, "card": h.group(1), "head": head,
                        "help": _text(helpm.group(1))[:220] if helpm else ""})
    return tuple(out)


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", str(text or "").lower())


def settings(query: str, switch_on: Callable[[str], bool], limit: int = 4) -> list[dict]:
    """The cards of Anatomy a search names, while `search_settings` is on: every word that matters
    begins a word of the card's heading or of its first line of help, and at least one begins a
    word of its heading. Each with its section's page, so the row can open it there."""
    from . import genes

    if not switch_on("search_settings"):
        return []
    left = what_matters(_words(query))
    if not left or len("".join(left)) < 3:
        return []
    where = {}
    for m in genes.GENES:
        placed = genes.section_of(m)
        if placed and genes.shown(m, switch_on):
            where[placed[1]] = m
    found = []
    for c in cards():
        m = where.get(c["section"])
        if m is None:
            continue
        head, said = _words(c["head"]), _words(c["help"])
        if not all(any(w.startswith(a) for w in head + said) for a in left):
            continue
        in_head = sum(1 for a in left if any(w.startswith(a) for w in head))
        if not in_head:
            continue
        found.append((-in_head, len(head), {**c, "route": m["route"], "page": m["name"],
                                            "whole": in_head == len(left)}))
    found.sort(key=lambda row: row[:2])
    return [row[-1] for row in found[:limit]]


def used(who, switch: str, detail: str) -> bool:
    """One of the four used: counted, nothing else. False for one not known, or switched off."""
    from . import evolution, switches

    if switch not in GENES or who is None or not switches.on(switch, _org(who)):
        return False
    detail = str(detail or "")[:120]
    if switch == "search_words":
        evolution.used("search_words", "opened", who=who, detail=detail)
    elif switch == "search_ask":
        evolution.used("search_ask", "asked", who=who, detail=detail)
    elif switch == "search_settings":
        evolution.used("search_settings", "opened", who=who, detail=detail)
    else:
        evolution.used("type_anywhere", "typed", who=who, detail=detail)
    return True
