"""What a person a page is shared with may spend in a month, and what they have spent.

Petar's brief, 23 November 2026 (task 182, point 6): "every guest's turns are attributed to that person in the usage
logs ... Each guest gets a monthly cap with a conservative default the owner can change ..., a warning near the cap,
and work stopping politely at it."

A guest's turns are written down under the guest's own id (`llmlog.about(who=...)` in `rouh/rooms.py`), with the
page's owner's organisation, so what they spent this month is the sum of those calls' prices. The cap is the owner's
setting (`UserSetting` "guest_caps": a default for everybody, and one for any person he set apart), changed on the
stats screen's split by person (`rouh/usage_drill.py`, `orb_costs.js`). A visitor to a public link is capped per link.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone

log = logging.getLogger("rouh.guest_caps")

SETTING = "guest_caps"
#: Dollars a month for each guest when the owner has set nothing. Conservative: a few dozen questions and changes on
#: a large page with the prompt cache, and far under what one busy guest cost in November (task 182).
DEFAULT = 10.0
#: The share of the cap at which the guest is told they are close.
WARN_AT = 0.8
#: The most a cap may be set to.
MOST = 1000.0


@dataclass(frozen=True)
class Cap:
    spent: float
    cap: float
    stopped: bool
    warn: bool
    words: str


def month_start(now: float | None = None) -> float:
    at = datetime.fromtimestamp(now or time.time(), tz=timezone.utc)
    return datetime(at.year, at.month, 1, tzinfo=timezone.utc).timestamp()


def settings(owner_id: str, org_id: str) -> dict:
    """{"default": dollars, "people": {user_id: dollars}}."""
    from .models import UserSetting

    value = (UserSetting.objects.filter(user_id=str(owner_id), org_id=str(org_id or ""), name=SETTING)
             .values_list("value", flat=True).first())
    try:
        held = json.loads(value) if value else {}
    except (TypeError, ValueError):
        held = {}
    if not isinstance(held, dict):
        held = {}
    people = held.get("people") if isinstance(held.get("people"), dict) else {}
    try:
        default = float(held.get("default", DEFAULT))
    except (TypeError, ValueError):
        default = DEFAULT
    return {"default": default, "people": {str(k): float(v) for k, v in people.items()
                                            if isinstance(v, (int, float))}}


def put(owner_id: str, org_id: str, *, default: float | None = None, person: str = "",
        amount: float | None = None) -> dict:
    """Change the default, or one person's cap (`amount` None takes theirs back to the default)."""
    from django.db import transaction

    from .models import UserSetting

    def dollars(v) -> float:
        v = float(v)
        if not 0 <= v <= MOST:
            raise ValueError(f"A monthly cap is between $0 and ${MOST:,.0f}.")
        return round(v, 2)

    with transaction.atomic():
        held = settings(owner_id, org_id)
        if default is not None:
            held["default"] = dollars(default)
        if person:
            if amount is None:
                held["people"].pop(str(person), None)
            else:
                held["people"][str(person)] = dollars(amount)
        UserSetting.objects.bulk_create(
            [UserSetting(user_id=str(owner_id), org_id=str(org_id or ""), name=SETTING,
                         value=json.dumps(held), updated_at=time.time())],
            update_conflicts=True, unique_fields=["user_id", "name"], update_fields=["org_id", "value", "updated_at"])
    return held


def spent(user_id: str, org_id: str, since: float | None = None) -> float:
    """What this person's calls on this organisation's pages cost since the start of the month."""
    from django.db.models import Sum

    from .models import LLMRequest

    got = (LLMRequest.objects.filter(user_id=str(user_id), org_id=str(org_id or ""),
                                     started_at__gte=since or month_start())
           .aggregate(n=Sum("cost_usd"))["n"])
    return float(got or 0.0)


def cap_of(owner_id: str, org_id: str, user_id: str) -> float:
    held = settings(owner_id, org_id)
    return float(held["people"].get(str(user_id), held["default"]))


def check(owner_id: str, org_id: str, who) -> Cap:
    """Where this guest stands against their cap this month."""
    user_id = str(getattr(who, "user_id", "") or "")
    try:
        cap = cap_of(owner_id, org_id, user_id)
        used = spent(user_id, org_id)
    except Exception:  # noqa: BLE001 - a cap that cannot be read stops nothing, and says so in the log
        log.exception("the monthly cap of %s could not be read", user_id)
        return Cap(0.0, DEFAULT, False, False, "")
    if used >= cap:
        return Cap(used, cap, True, False,
                   f"This page's conversation has used this month's allowance for you (${cap:,.2f}), so Rouh "
                   "cannot answer more here until next month. The page's owner can raise it.")
    if cap > 0 and used >= cap * WARN_AT:
        return Cap(used, cap, False, True,
                   f"You have used ${used:,.2f} of this month's ${cap:,.2f} for this page's conversation. "
                   "When it is used up, Rouh stops answering here until next month, unless the page's owner "
                   "raises it.")
    return Cap(used, cap, False, False, "")
