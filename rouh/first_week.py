"""Four genes for somebody in their first week with Rouh (night 55 of the ledger, 26 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
makes Rouh easier for a first-time user, technical or not. All four live in the page, in this
browser; the server only says which are on and counts their use. Each has its own switch:

- **Words you had not sent are still in the box** (`draft_kept`, invisible). What was typed in the
  chat's box and not sent went with a reload, a deploy that restarts the page, a closed tab or a
  phone that dropped the page. Now it is kept in this browser, per chat, and put back.
- **What you asked before chat was set up, answered with one press** (`ask_again`, shows up by
  itself). A newcomer's first message meets "Chat is not set up yet"; once they set it up, it sat
  unanswered. Now it is kept, and once chat is set up a card over the box offers Ask it now.
- **Chat text size** (`text_size`, you ask for it). The chat is set in 13 to 14 pixels, and a
  person who is not technical rarely knows the browser's zoom. Now About You has Chat text size,
  Normal, Bigger or Biggest, kept on this device.
- **Up arrow brings back your last message** (`last_again`, changes how you work). In the chat's
  empty box the Up arrow brings back the last message sent in that chat, to change and send again.

The page is told which are on in `#rouhFirstWeek` (`for_page`); each reports its use through
``POST /api/first-week`` (`rouh/web/first_week.py`). No model is asked, and nothing is kept on the
server.
"""
from __future__ import annotations

import logging

log = logging.getLogger("rouh.first_week")

#: Each gene's switch, its title, and the events the page reports.
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "draft_kept": ("Words you had not sent are still in the box", ("restored",)),
    "ask_again": ("What you asked before chat was set up, answered with one press", ("asked",)),
    "text_size": ("Chat text size", ("changed",)),
    "last_again": ("Up arrow brings back your last message", ("recalled",)),
}

#: The sizes Chat text size offers, by name, and how much bigger each draws the chat.
SIZES: list[dict] = [
    {"id": "normal", "name": "Normal", "scale": 1.0},
    {"id": "bigger", "name": "Bigger", "scale": 1.15},
    {"id": "biggest", "name": "Biggest", "scale": 1.3},
]


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation, for the page."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def for_page(who) -> dict:
    """What `#rouhFirstWeek` tells the page: which are on, and the sizes while `text_size` is."""
    on = on_for(who)
    return {"on": on, "sizes": SIZES if "text_size" in on else []}


def used(who, switch: str, event: str, detail: str = "") -> bool:
    """One of the four used: counted, nothing else. False for one not known, an event it does not
    report, or a switch that is off."""
    from . import evolution, switches

    if switch not in GENES or event not in GENES[switch][1] or who is None:
        return False
    if not switches.on(switch, _org(who)):
        return False
    detail = " ".join(str(detail or "").split())[:120]
    if switch == "draft_kept":
        evolution.used("draft_kept", "restored", who=who, detail=detail)
    elif switch == "ask_again":
        evolution.used("ask_again", "asked", who=who, detail=detail)
    elif switch == "text_size":
        evolution.used("text_size", "changed", who=who, detail=detail)
    else:
        evolution.used("last_again", "recalled", who=who, detail=detail)
    return True
