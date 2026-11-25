"""Once, early on: what Unrestricted means, and the choice to switch to Restricted (task 98, gaps G1 and G5).

The owner, 25 November 2026, on a new Rouh starting Unrestricted: "I want people to experience the
opened up Rouh by default, otherwise they will get a series of NO's which is exactly why they are
even trying something other than claude". So new installs stay Unrestricted (`unrestricted.current`),
and in the first hours of use, at about the owner's `AT`th message, the page shows one window, once:
what Unrestricted lets Rouh do, what it costs in safety (a misleading email or web page could steer
it; what it does touches real accounts, data and services), and a press to switch to Restricted.
Either way the choice stays on the Permissions page.

**Who sees it.** Only the installation's owner (`unrestricted._is_owner`), only while their mode is
still the default nobody pressed (`unrestricted.DEFAULT_BY`: no row, never flipped), only if they
have not seen it, and only before `LATE` messages: a Rouh that has long been in use, the first
owner's own included, keeps its setting and is never shown it.

**What is kept.** `{"seen": when, "chose": "kept" | "restricted" | "closed"}` in `user_settings`
(`NAME`), scoped to the person (AGENTS.md, "Whose data is it").

**The switch itself** is the one Permissions has: `POST /api/mode-intro {act: "restricted"}` is a
signed-in POST through Django's CSRF check, made into an `unrestricted.OwnerPress` and given to
`unrestricted.flip` (`rouh/web/mode_intro.py`), so nothing but the owner's press changes the mode.

The words are the Guide's: the lesson `restricted` (What Rouh may do without asking) in `rouh/handholding.json`, beside the privacy lesson,
holds the long form, and this window links to it.
"""
from __future__ import annotations

import json
import logging
import time

log = logging.getLogger("rouh.mode_intro")

#: Where the person's answer is kept, in `user_settings`.
NAME = "mode_intro"
#: The owner's message at which the window shows (about the tenth).
AT = 10
#: Past this many messages the Rouh is no longer new: the window is never shown.
LATE = 150
#: What the person did with it.
CHOICES = ("kept", "restricted", "closed")
#: The Guide's lesson with the long form.
LESSON = "restricted"

#: The window's words, in one place. The page draws them as they are.
WORDS = {
    "title": "Rouh is running unbound",
    "lede": "You are on Unrestricted, the mode every new Rouh starts in. Here is what that means, "
            "so the choice is yours.",
    "pros_head": "What you get",
    "pros": [
        "Fewer interruptions: Rouh does what you ask without stopping for a yes at every step.",
        "It acts freely through what you connected: mail, calendar, files, chat apps, and the jobs it runs for you.",
    ],
    "cons_head": "What it costs",
    "cons": [
        "A misleading email or web page could steer it: words hidden in what it reads can look like instructions.",
        "What it does is real: it changes your accounts, your data and the services you connected.",
    ],
    "still": "In every mode it still asks before spending above your limits, deleting for good, "
             "or giving anyone outside access.",
    "restricted": "Restricted asks you first before it sends, shares, changes a service or runs a command.",
    "later": "You can change this any time in Permissions.",
    "keep": "Keep Unrestricted",
    "switch": "Switch to Restricted",
    "guide": "Read the lesson",
    "done_restricted": "Restricted is on. Rouh asks you first. Change it in Permissions.",
    "done_kept": "Unrestricted stays on. Change it any time in Permissions.",
}


def _held(who) -> dict:
    from .models import UserSetting

    value = (UserSetting.objects.filter(user_id=str(who.user_id), org_id=str(who.org_id or ""), name=NAME)
             .values_list("value", flat=True).first())
    try:
        got = json.loads(value) if value else {}
    except (TypeError, ValueError):
        got = {}
    return got if isinstance(got, dict) else {}


def _keep(who, held: dict) -> None:
    from .models import UserSetting

    UserSetting.objects.bulk_create(
        [UserSetting(user_id=str(who.user_id), org_id=str(who.org_id or ""), name=NAME,
                     value=json.dumps(held), updated_at=time.time())],
        update_conflicts=True, unique_fields=["user_id", "name"], update_fields=["org_id", "value", "updated_at"])


def said(most: int = LATE) -> int:
    """The owner's own messages so far, counted up to `most`. Chats belong to the one owner of a
    Rouh (as `handholding._said` says), so the person's words in any chat count; a row Rouh's
    software wrote (`note`) and a tool's result are not words of theirs."""
    from .models import TranscriptMessage

    rows = (TranscriptMessage.objects.filter(role="user", note=False)
            .exclude(content__contains='"tool_result"').values_list("id", flat=True)[:most])
    return len(list(rows))


def _owner_default(who) -> bool:
    from . import unrestricted

    if who is None or not getattr(who, "is_admin", False) or not unrestricted._is_owner(who):
        return False
    mode = unrestricted.current(who)
    return mode.unrestricted and mode.set_by == unrestricted.DEFAULT_BY


def state(who) -> dict:
    """What the page is told, `#rouhModeIntro`: {show: False}, or {show, at, said, words, guide}.
    `said` is the count when the page was drawn; the page counts on from it as the owner sends."""
    if who is None or _held(who).get("seen"):
        return {"show": False}
    if not _owner_default(who):
        return {"show": False}
    count = said()
    if count >= LATE:
        return {"show": False}
    from . import handholding

    return {"show": True, "at": AT, "said": count, "words": WORDS,
            "guide": handholding.lesson_route(LESSON), "permissions": "/anatomy/behaviour/permissions"}


def answered(who, chose: str) -> dict:
    """Kept once: the window is never shown again to this person."""
    if chose not in CHOICES:
        raise ValueError("Keep, switch or close.")
    held = _held(who)
    if not held.get("seen"):
        _keep(who, {"seen": time.time(), "chose": chose})
    return {"show": False, "chose": chose}


def for_page(who) -> dict:
    try:
        return state(who)
    except Exception:  # noqa: BLE001 - the page works without it
        log.exception("mode_intro: not read for the page")
        return {"show": False}
