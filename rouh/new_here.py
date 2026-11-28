"""Four genes for somebody new to Rouh (night 57 of the ledger, 28 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
makes Rouh easier for a first-time user, technical or not. Each has its own switch:

- **A refused key stays in its box, with the reason beside it** (`key_kept`, invisible). On the
  Models page a key Rouh refused was taken out of its box, and why was said at the top of the page,
  far from the box on a phone, so a newcomer had to paste it again without knowing what was wrong.
  Now it stays where it was typed, the reason is under that company's row, and the box has the
  cursor, ready to be put right.
- **Caps Lock is on** (`caps_lock`, shows up by itself). A password typed with Caps Lock on is
  refused with no clue why. Now every password box of the pages in front of the sign-in says
  "Caps Lock is on" under it while it is.
- **Show the password** (`show_password`, you ask for it). Each of those password boxes has Show,
  which shows what was typed, and Hide again, so a newcomer on a phone can see a mistyped letter.
- **Answer with a press** (`tap_choices`, changes how you work). When Rouh's newest answer asks
  which of a short list you want, each choice is a button under it, and a press sends it as your
  answer, so a newcomer does not have to know they can type "the second one".

The main page is told which are on in `#rouhNewHere` (`for_page`); the pages in front of the
sign-in by `{% new_here_signin %}` (`rouh/templatetags/rouh_new_here.py`), which reads the
install's own switches, because nobody is signed in there yet. Uses reach ``POST /api/new-here``
(`rouh/web/new_here.py`); a sign-in page's are kept in the browser's session and sent by the main
page once the person is in. No model is asked.
"""
from __future__ import annotations

import logging

log = logging.getLogger("rouh.new_here")

#: Each gene's switch, its title, and the events the page reports.
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "key_kept": ("A refused key stays in its box, with the reason beside it", ("kept", "saved")),
    "caps_lock": ("Caps Lock is on", ("warned",)),
    "show_password": ("Show the password", ("shown",)),
    "tap_choices": ("Answer with a press", ("tapped",)),
}

#: The two that work on the pages in front of the sign-in.
SIGNIN = ("caps_lock", "show_password")


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation, for the page."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def for_page(who) -> dict:
    """What `#rouhNewHere` tells the page: which are on."""
    return {"on": on_for(who)}


def for_signin() -> list[str]:
    """Which of the two sign-in genes are on, by the install's own switches (nobody is in yet)."""
    from . import switches

    out = []
    for name in SIGNIN:
        try:
            if switches.on(name):
                out.append(name)
        except Exception:  # noqa: BLE001 - a sign-in page is never held back for this
            log.warning("new_here: the switch %s could not be read for a sign-in page", name, exc_info=True)
    return out


def used(who, switch: str, event: str, detail: str = "") -> bool:
    """One of the four used, as the page saw it: counted, nothing else. False for one not known, an
    event the page does not report, or a switch that is off."""
    from . import evolution, switches

    if switch not in GENES or event not in GENES[switch][1] or who is None:
        return False
    if not switches.on(switch, _org(who)):
        return False
    detail = " ".join(str(detail or "").split())[:120]
    if (switch, event) == ("key_kept", "kept"):
        evolution.used("key_kept", "kept", who=who, detail=detail)
    elif switch == "key_kept":
        evolution.used("key_kept", "saved", who=who, detail=detail)
    elif switch == "caps_lock":
        evolution.used("caps_lock", "warned", who=who, detail=detail)
    elif switch == "show_password":
        evolution.used("show_password", "shown", who=who, detail=detail)
    else:
        evolution.used("tap_choices", "tapped", who=who, detail=detail)
    return True


__all__ = ["GENES", "SIGNIN", "for_page", "for_signin", "on_for", "used"]
