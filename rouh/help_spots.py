"""Help icons on the screen: a small ? beside a word of Rouh's own, put away once read.

The owner, 25 November 2026, preparing Rouh to be released: newcomers meet Rouh's own words (the
orb, the canvas, Clockwork, Synapse, Mutations, the Incubator, a run, Decisions) on screen without
reading the Guide. "Maybe one icon setting everywhere with hover/tap a sentence and a link to the
full guide? If we click 'done' this icon disappears from that specific location ... as people start
reading them, they clear up."

- **The words are the Guide's.** Every spot is in `rouh/handholding.json` under `spots`, beside the
  Guide's `terms`: its name, its one sentence (`say`, or `term`, which takes the sentence the Guide
  already uses for that word, so the two never drift), the tip it opens (`lesson`) and the heading in
  that tip (`section`). A spot with a `heading` sits beside the page of that name, and its sentence is
  that page's plain line too (`first_help.PLAIN` reads it here), so What is this page? and this are one.
- **Where each sits is the page's** (`rouh/static/app/help_spots.js`): an element on screen, or the
  heading of a page by its name.
- **What is put away is kept per person, on the server** (`user_settings`, `NAME`), so it holds on
  every device: `{"done": {spot: [when, how]}, "off": when, "again": when}`. `how` is `got_it` (pressed Got it),
  `used` (the thing it sits on was pressed `USES` times in one browser) or `guide` (shown as read
  because the tip it opens is ticked done in the Guide, which is not kept here at all). `off` is Hide
  all help; Show help again (`again`) clears both, and a Guide tick older than it no longer counts. Both ids are in every query (AGENTS.md, "Whose data is it").

One switch, `help_spots`. While it is on, the (?) of `page_what` steps aside for this one.
"""
from __future__ import annotations

import json
import logging
import time

log = logging.getLogger("rouh.help_spots")

#: The switch, and the events the page reports (`rouh/genes/owners.json`, signals).
SWITCH = "help_spots"
EVENTS = ("opened", "got_it", "guide", "hid_all", "shown_again")
#: Where each person's put-away spots are kept, in `user_settings`.
NAME = "help_spots"
#: Presses of the thing a spot sits on, in one browser, after which its icon goes by itself.
USES = 5
#: How many show at once on the main screen, at a desk and on a phone; a page's own heading always shows.
MOST = {"desk": 3, "phone": 2}
#: How a spot was put away.
HOWS = ("got_it", "used")


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on(who) -> bool:
    from . import switches

    return who is not None and switches.on(SWITCH, _org(who))


def spots(data: dict | None = None) -> dict[str, dict]:
    """Every spot of the Guide's data file, its sentence filled in from `terms` where it names one,
    and its tip's title and address: {id: {name, say, lesson, title, route, section, rank, heading}}. One whose
    sentence cannot be found is left out, never shown empty."""
    from . import handholding

    data = data if data is not None else handholding.content()
    terms = data.get("terms") or {}
    titles = {les["id"]: les.get("title", "") for les in handholding.lessons(data)}
    out: dict[str, dict] = {}
    for sid, raw in (data.get("spots") or {}).items():
        if not isinstance(raw, dict):
            continue
        say = str(raw.get("say") or (terms.get(raw.get("term") or "") or {}).get("means") or "").strip()
        name = str(raw.get("name") or "").strip()
        if not say or not name:
            continue
        lesson = raw.get("lesson") if raw.get("lesson") in titles else ""
        out[str(sid)] = {
            "name": name, "say": say, "lesson": lesson or "", "title": titles.get(lesson, "") if lesson else "",
            "route": handholding.lesson_route(lesson) if lesson else "/guide",
            "section": str(raw.get("section") or ""), "rank": int(raw.get("rank") or 2),
            "heading": str(raw.get("heading") or ""),
        }
    return out


def plain() -> dict[str, str]:
    """Each page's plain line, by the name its heading says: the spots with a `heading`."""
    try:
        return {s["heading"]: s["say"] for s in spots().values() if s["heading"]}
    except Exception:  # noqa: BLE001 - a page with no plain line still works
        log.exception("help_spots: the Guide's spots could not be read")
        return {}


# --- what is kept ---------------------------------------------------------------------------------


def _held(who) -> dict:
    from .models import UserSetting

    value = (UserSetting.objects.filter(user_id=str(who.user_id), org_id=str(who.org_id or ""), name=NAME)
             .values_list("value", flat=True).first())
    try:
        got = json.loads(value) if value else {}
    except (TypeError, ValueError):
        got = {}
    if not isinstance(got, dict):
        got = {}
    done = got.get("done") if isinstance(got.get("done"), dict) else {}
    return {"done": {str(k): v for k, v in done.items() if isinstance(v, list) and len(v) == 2},
            "off": float(got.get("off") or 0) or 0, "again": float(got.get("again") or 0) or 0}


def _keep(who, held: dict) -> None:
    from .models import UserSetting

    UserSetting.objects.bulk_create(
        [UserSetting(user_id=str(who.user_id), org_id=str(who.org_id or ""), name=NAME,
                     value=json.dumps(held), updated_at=time.time())],
        update_conflicts=True, unique_fields=["user_id", "name"], update_fields=["org_id", "value", "updated_at"])


def _by_guide(who, every: dict[str, dict], since: float = 0) -> set[str]:
    """The spots whose tip the person ticked done in the Guide (after Show help again, if pressed)."""
    from . import handholding

    try:
        ticked = {k for k, when in handholding.progress(who).items() if abs(float(when or 0)) > since}
    except Exception:  # noqa: BLE001 - the icons still show
        log.exception("help_spots: the Guide's ticks could not be read")
        return set()
    return {sid for sid, s in every.items() if s["lesson"] and s["lesson"] in ticked}


def state(who) -> dict:
    """What the page is told: {on, spots, done: [ids], off, read, total, most, uses}. `read` counts
    every spot put away for any reason, so the count in About you agrees with what is on screen."""
    if not on(who):
        return {"on": False}
    every = spots()
    held = _held(who)
    done = (set(held["done"]) | _by_guide(who, every, held["again"])) & set(every)
    return {"on": True, "spots": every, "done": sorted(done), "off": bool(held["off"]),
            "read": len(done), "total": len(every), "most": MOST, "uses": USES}


def act(who, what: str, spot: str = "") -> dict | None:
    """One thing the person did: `got_it` or `used` on a spot, `opened` one, followed its `guide` link,
    `hide_all`, its Undo (`unhide`), or `show_again`. Returns the new state, or None for something not known."""
    from . import evolution

    if not on(who):
        return None
    every = spots()
    if what in HOWS or what in ("opened", "guide"):
        if spot not in every:
            return None
    elif what not in ("hide_all", "unhide", "show_again"):
        return None
    if what in HOWS:
        held = _held(who)
        held["done"].setdefault(spot, [time.time(), what])
        _keep(who, held)
        if what == "got_it":
            evolution.used(SWITCH, "got_it", who=who, detail=spot)
    elif what == "hide_all":
        held = _held(who)
        held["off"] = time.time()
        _keep(who, held)
        evolution.used(SWITCH, "hid_all", who=who)
    elif what == "unhide":
        held = _held(who)
        held["off"] = 0
        _keep(who, held)
    elif what == "show_again":
        _keep(who, {"done": {}, "off": 0, "again": time.time()})
        evolution.used(SWITCH, "shown_again", who=who)
    elif what == "opened":
        evolution.used(SWITCH, "opened", who=who, detail=spot)
    else:
        evolution.used(SWITCH, "guide", who=who, detail=spot)
    return state(who)


def for_page(who) -> dict:
    """`#rouhHelpSpots`: the state, or {on: False} when the switch is off or nothing can be read."""
    try:
        return state(who)
    except Exception:  # noqa: BLE001 - the page works without its help icons
        log.exception("help_spots: not read for the page")
        return {"on": False}
