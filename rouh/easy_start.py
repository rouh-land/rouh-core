"""Four genes for somebody new to Rouh (night 56 of the ledger, 27 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
makes Rouh easier for a first-time user, technical or not. Each has its own switch:

- **Chat works the moment a key is saved** (`chat_ready`, invisible). The note "Chat is not set up
  yet" was drawn with the page and nothing took it away, so a newcomer who saved a key went on
  reading it until they thought to reload. Now, while it shows, the page asks whether chat can
  answer (`chat_state`) when the window comes back and every ten seconds, and takes it away the
  moment it can.
- **Rouh on your phone's home screen** (`home_screen`, shows up by itself). Rouh already works as an
  app of its own from a phone's home screen and never said so. On a phone, in the browser, from
  the second visit, a card offers it once: Install on a phone that can (Android), the two steps on
  an iPhone, and Not now.
- **Save this chat as a file** (`chat_save`, you ask for it). Chat Options has it at its foot: a
  plain text file of the whole chat, every message with who said it and when (`chat_file`).
- **Type / for what you can do here** (`slash_menu`, changes how you work). A slash in the chat's
  empty box opens a short list, in words, of what can be done from the chat, narrowed as you type.

The page is told which are on in `#rouhEasyStart` (`for_page`); each reports its use through
``POST /api/easy-start`` (`rouh/web/easy_start.py`). No model is asked.
"""
from __future__ import annotations

import logging
import time

log = logging.getLogger("rouh.easy_start")

#: Each gene's switch, its title, and the events the page reports.
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "chat_ready": ("Chat works the moment a key is saved", ("readied",)),
    "home_screen": ("Rouh on your phone's home screen", ("installed", "opened")),
    "chat_save": ("Save this chat as a file", ("saved",)),
    "slash_menu": ("Type / for what you can do here", ("done",)),
}

#: What the slash list offers, in the order it is shown: an id the page acts on, the words, and
#: the words it is also found by.
SLASH: list[dict] = [
    {"id": "attach", "name": "Attach a file", "also": "upload picture photo document pdf"},
    {"id": "incognito", "name": "Incognito: a chat Rouh forgets", "also": "private secret forget"},
    {"id": "model", "name": "Pick the model for this chat", "also": "ai claude gpt smarter cheaper"},
    {"id": "options", "name": "Chat Options: what this chat uses", "also": "memory rules tools settings"},
    {"id": "save", "name": "Save this chat as a file", "also": "download export keep text"},
    {"id": "setup", "name": "Set up chat", "also": "key connect ai service models"},
    {"id": "guide", "name": "Open the Guide", "also": "help learn tips how"},
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
    """What `#rouhEasyStart` tells the page: which are on, and the slash list while it is."""
    on = on_for(who)
    return {"on": on, "slash": SLASH if "slash_menu" in on else []}


def chat_state(who, cfg) -> dict:
    """Whether the chats can answer now (`providerkeys.chat_setup`), for `chat_ready`."""
    from . import providerkeys, switches

    if who is None or not switches.on("chat_ready", _org(who)):
        return {"on": False}
    try:
        need = providerkeys.chat_setup(_org(who), cfg)
    except Exception:  # noqa: BLE001 - not known is not ready
        log.warning("chat_ready: whether chat can answer could not be read", exc_info=True)
        return {"on": True, "ready": False}
    return {"on": True, "ready": need is None}


# --- chat_save -----------------------------------------------------------------------------------

#: The most messages a file holds, newest kept, so one press cannot read a year's chat at once.
MOST = 5000


def _stamp(ts) -> str:
    try:
        return time.strftime("%d %b %Y, %H:%M", time.localtime(float(ts)))
    except (TypeError, ValueError):
        return ""


def _words(row: dict) -> str:
    text = str(row.get("text") or "").strip()
    if text:
        return text
    parts = row.get("parts")
    said = []
    if isinstance(parts, list):
        for p in parts:
            if isinstance(p, dict) and p.get("type") == "text" and str(p.get("text") or "").strip():
                said.append(str(p["text"]).strip())
    return "\n\n".join(said)


def chat_file(who, memory, chat: str, name: str = "") -> tuple[str, str] | None:
    """The whole chat as a plain text file: (its file name, its words), titled `name`, the name the
    screen shows it by, else its own. None when the switch is off or the chat is not there."""
    from . import evolution, switches

    if who is None or not switches.on("chat_save", _org(who)):
        return None
    found = memory.chat(chat)
    if found is None:
        return None
    rows: list[dict] = []
    before = None
    while len(rows) < MOST:
        page, older = memory.transcript_page(chat, 200, before)
        rows = page + rows
        if not older:
            break
        exchange, row = (int(x) for x in older.split(".", 1))
        before = (exchange, row)
    title = " ".join(str(name or found.get("title") or "Chat").split())[:120] or "Chat"
    lines = [title, f"Saved from Rouh on {_stamp(time.time())}", ""]
    count = 0
    for r in rows[-MOST:]:
        role = r.get("role")
        if role not in ("user", "assistant") or r.get("note") or r.get("notice"):
            continue
        words = _words(r)
        if not words:
            continue
        who_said = "You" if role == "user" else "Rouh"
        lines += [f"{who_said}, {_stamp(r.get('ts'))}", words, ""]
        count += 1
    if not count:
        lines.append("Nothing has been said in this chat yet.")
    safe = "".join(c if c.isalnum() or c in " -_" else " " for c in title)
    name = ("-".join(safe.split())[:60] or "chat") + ".txt"
    evolution.used("chat_save", "saved", who=who, detail=f"{count} messages")
    return name, "\n".join(lines).rstrip() + "\n"


# --- what the page reports -----------------------------------------------------------------------


def used(who, switch: str, event: str, detail: str = "") -> bool:
    """One of the four used, as the page saw it: counted, nothing else. False for one not known, an
    event the page does not report, or a switch that is off. (`chat_save` counts on the server.)"""
    from . import evolution, switches

    if switch not in GENES or switch == "chat_save" or event not in GENES[switch][1] or who is None:
        return False
    if not switches.on(switch, _org(who)):
        return False
    detail = " ".join(str(detail or "").split())[:120]
    if switch == "chat_ready":
        evolution.used("chat_ready", "readied", who=who, detail=detail)
    elif (switch, event) == ("home_screen", "installed"):
        evolution.used("home_screen", "installed", who=who, detail=detail)
    elif switch == "home_screen":
        evolution.used("home_screen", "opened", who=who, detail=detail)
    else:
        evolution.used("slash_menu", "done", who=who, detail=detail)
    return True


__all__ = ["GENES", "SLASH", "chat_file", "chat_state", "for_page", "on_for", "used"]
