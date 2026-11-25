"""Rouh's own spending limit: what may be paid per use in a day and in a month, told before, kept at.

Petar, 25 November 2026, preparing Rouh for its public release: "a spending limit". New people
need a cost they can predict: a cap they set, a day and a month, on everything Rouh pays per use
through their API keys; today's cost always in sight; a warning as the cap comes near; a clear stop
at it, rather than spending on silently; and a warning before anything unusually expensive.

**What is counted.** Every request made of a model is written down with its price by
`rouh/llmlog.py` (`llm_requests`, `cost_usd`), so what an organisation spent today and this month
is the sum of its rows since midnight and since the 1st, on the person's own clock
(`rouh/clock.py`). Runs of Claude Code and Codex on a plan cost nothing by the token and are not in
it; a run that pays by the token has its own cap (`one/costcap.py`, ONE_RUN_COST_MAX).

**Where it is kept.** Every model call passes `llmlog._Recording.send`, which asks `gate` first.
At the limit, with "Stop and ask" (the default), the call is not sent: it is answered at once with
a refusal of Rouh's own (`refusal`), which every caller already handles as a refused call, and a
chat's turn says it in plain words (`words_of`, read by `brain._friendly`, `luna.friendly` and
`compat.friendly`). The person carries on by allowing more for today (`allow_more`) or raising the
limit, on the cost screen. With "Only warn" the calls go on and the person is told.

**Told before.** At `warn_at` (80%) of either limit, once a day or a month, a notice; at the limit,
an alarm that reaches the phone at once; and a call that would cost about `expensive` dollars or
more at full input price is told as it goes out (`dear`), once a day for each use. All are notices
(`rouh/notices.py`) with unique keys, so a restart never says one twice.

**The starting limit.** A new Rouh starts at `DAILY` and `MONTHLY`. One that already spends more
than that would be stopped the morning this lands, so the first time its limit is read with none
saved, it starts above what it has really spent (`_starting`): half again over its dearest day and
its last 30 days, rounded up, and the person is told the figures and where to change them. An
installer may start every new Rouh at other figures with `ROUH_SPENDING_DAILY` and
`ROUH_SPENDING_MONTHLY` in its settings file.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import re
import threading
import time
from datetime import datetime

log = logging.getLogger("rouh.spending_limit")

SETTING = "spending_limit"
#: Dollars a day and a month for a new Rouh. A day of ordinary chatting, mail and briefs is a few
#: dollars; twenty leaves room for a busy one, and three hundred for a month of busy ones.
DAILY = 20.0
MONTHLY = 300.0
#: The share of a limit at which the person is told it is near.
WARN_AT = 0.8
#: A call that would cost this many dollars or more, at full input price, is told as it goes out.
EXPENSIVE = 1.0
#: What "Allow more today" adds unless the person says another amount.
MORE = 5.0
#: The most a limit may be set to.
MOST = 100_000.0
#: "stop": at the limit nothing more is sent until more is allowed. "warn": calls go on, told.
STOP, WARN = "stop", "warn"
#: How long the figures are trusted before the log is added up again, in seconds.
FRESH = 20.0
#: The error type and code a refused call carries, for every company's shape.
REFUSED = "rouh_spending_limit"


def _key(org_id: str) -> str:
    """The `UserSetting` row an organisation's limit is kept in: it is the organisation's, not one
    person's, so its "user" is the organisation."""
    return f"org:{org_id}"


def _round_up(dollars: float, step: float) -> float:
    return float(math.ceil(dollars / step) * step)


def day_start(now: float | None = None) -> float:
    from . import clock

    at = datetime.fromtimestamp(now or time.time(), tz=clock.zone())
    return at.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()


def month_start(now: float | None = None) -> float:
    from . import clock

    at = datetime.fromtimestamp(now or time.time(), tz=clock.zone())
    return at.replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()


def today(now: float | None = None) -> str:
    from . import clock

    return datetime.fromtimestamp(now or time.time(), tz=clock.zone()).date().isoformat()


def _clean(held: dict) -> dict:
    """Whatever was saved, as the five settings and today's allowance, each in range."""
    def number(name, default, most=MOST):
        try:
            v = float(held.get(name, default))
        except (TypeError, ValueError):
            return default
        return min(max(v, 0.0), most)

    extra = held.get("extra") if isinstance(held.get("extra"), dict) else {}
    try:
        extra = {"date": str(extra.get("date") or ""), "usd": max(0.0, float(extra.get("usd") or 0))}
    except (TypeError, ValueError):
        extra = {"date": "", "usd": 0.0}
    at = held.get("at_limit")
    return {"daily": number("daily", DAILY), "monthly": number("monthly", MONTHLY),
            "warn_at": number("warn_at", WARN_AT, 1.0) or WARN_AT,
            "expensive": number("expensive", EXPENSIVE),
            "at_limit": at if at in (STOP, WARN) else STOP,
            "extra": extra, "started": str(held.get("started") or ""),
            "set_at": float(held.get("set_at") or 0)}


def _read(org_id: str) -> dict | None:
    from .models import UserSetting

    value = (UserSetting.objects.filter(user_id=_key(org_id), name=SETTING)
             .values_list("value", flat=True).first())
    if not value:
        return None
    try:
        held = json.loads(value)
    except (TypeError, ValueError):
        return None
    return held if isinstance(held, dict) else None


def _write(org_id: str, held: dict) -> None:
    from .models import UserSetting

    UserSetting.objects.bulk_create(
        [UserSetting(user_id=_key(org_id), org_id=str(org_id), name=SETTING,
                     value=json.dumps(held), updated_at=time.time())],
        update_conflicts=True, unique_fields=["user_id", "name"],
        update_fields=["org_id", "value", "updated_at"])


def _spent_both(org_id: str, day: float, month: float) -> tuple[float, float]:
    """Today's and this month's, in one pass over the log."""
    from django.db import connection

    since = min(day, month)
    with connection.cursor() as cur:
        cur.execute("SELECT COALESCE(SUM(cost_usd) FILTER (WHERE started_at >= %s), 0),"
                    " COALESCE(SUM(cost_usd) FILTER (WHERE started_at >= %s), 0)"
                    " FROM llm_requests WHERE org_id = %s AND started_at >= %s",
                    [day, month, str(org_id), since])
        a, b = cur.fetchone()
    return float(a or 0), float(b or 0)


def _from_env(name: str, default: float) -> float:
    """An installer's own starting figure (`ROUH_SPENDING_DAILY`, `ROUH_SPENDING_MONTHLY` in the
    settings file), or the default."""
    import os

    try:
        got = float(os.environ.get(name) or default)
    except ValueError:
        return default
    return min(max(got, 0.0), MOST)


def _starting(org_id: str, now: float) -> dict:
    """The limit an organisation starts with: the defaults, or, for one that already spends more,
    half again over its dearest day and its last 30 days, so nothing that works today stops."""
    from django.db import connection

    from . import clock

    base_daily, base_monthly = _from_env("ROUH_SPENDING_DAILY", DAILY), _from_env("ROUH_SPENDING_MONTHLY", MONTHLY)
    since = day_start(now) - 30 * 86400
    with connection.cursor() as cur:
        cur.execute("SELECT to_char(to_timestamp(started_at) AT TIME ZONE %s, 'YYYY-MM-DD'),"
                    " COALESCE(SUM(cost_usd), 0), COALESCE(MAX(cost_usd), 0) FROM llm_requests"
                    " WHERE org_id = %s AND started_at >= %s GROUP BY 1",
                    [getattr(clock.zone(), "key", "UTC"), str(org_id), since])
        rows = cur.fetchall()
    days = {d: float(c or 0) for d, c, _ in rows}
    month = sum(days.values())
    dearest = max((float(m or 0) for _, _, m in rows), default=0.0)
    peak = max(days.values(), default=0.0)
    daily = base_daily if peak * 1.5 <= base_daily else _round_up(peak * 1.5, 10)
    monthly = base_monthly if month * 1.5 <= base_monthly else _round_up(month * 1.5, 100)
    monthly = max(monthly, daily)
    expensive = EXPENSIVE if dearest <= EXPENSIVE else _round_up(dearest * 1.25, 1)
    return {"daily": daily, "monthly": monthly, "warn_at": WARN_AT, "expensive": expensive,
            "at_limit": STOP, "extra": {"date": "", "usd": 0.0},
            "started": "history" if (daily, monthly) != (base_daily, base_monthly) else "default",
            "set_at": now}


def settings(org_id: str, *, now: float | None = None) -> dict:
    """The organisation's limit, made and saved the first time it is asked for."""
    now = time.time() if now is None else now
    held = _read(org_id)
    if held is not None:
        return _clean(held)
    start = _starting(org_id, now)
    _write(org_id, start)
    _told_start.append((org_id, start))
    return _clean(start)


#: Organisations whose limit was just made, to be told about it on the loop (`_tell`).
_told_start: list = []


def put(org_id: str, **changes) -> dict:
    """Change the limit. Takes any of daily, monthly, warn_at, expensive, at_limit; 0 turns a limit
    off. Raises ValueError with words for the person on a value out of range."""
    from django.db import transaction

    def dollars(name, v) -> float:
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise ValueError("A limit is a number of dollars.") from None
        if not 0 <= v <= MOST:
            raise ValueError(f"A limit is between $0 (off) and ${MOST:,.0f}.")
        return round(v, 2)

    with transaction.atomic():
        held = settings(org_id)
        for name in ("daily", "monthly", "expensive"):
            if changes.get(name) not in (None, ""):
                held[name] = dollars(name, changes[name])
        if changes.get("warn_at") not in (None, ""):
            w = float(changes["warn_at"])
            w = w / 100 if w > 1 else w
            if not 0.1 <= w <= 1:
                raise ValueError("The warning comes at between 10% and 100% of a limit.")
            held["warn_at"] = round(w, 2)
        if changes.get("at_limit") not in (None, ""):
            if changes["at_limit"] not in (STOP, WARN):
                raise ValueError("At the limit Rouh either stops and asks, or only warns.")
            held["at_limit"] = changes["at_limit"]
        held["started"] = "person"
        held["set_at"] = time.time()
        _write(org_id, held)
    forget(org_id)
    return held


def allow_more(org_id: str, usd: float = MORE, now: float | None = None) -> dict:
    """Let today go on past the limit by `usd` more, on the day limit and the month's alike; another
    press today adds to it. Gone at midnight."""
    try:
        usd = float(usd)
    except (TypeError, ValueError):
        raise ValueError("Say how many dollars more.") from None
    if not 0 < usd <= 10_000:
        raise ValueError("Allow between $1 and $10,000 more.")
    held = settings(org_id, now=now)
    day = today(now)
    got = held["extra"]["usd"] if held["extra"].get("date") == day else 0.0
    held["extra"] = {"date": day, "usd": round(got + usd, 2)}
    _write(org_id, held)
    forget(org_id)
    return held


def status(org_id: str, *, now: float | None = None) -> dict:
    """Where the organisation stands today and this month, with the words to say it in."""
    now = time.time() if now is None else now
    held = settings(org_id, now=now)
    day, month = _spent_both(org_id, day_start(now), month_start(now))
    extra = held["extra"]["usd"] if held["extra"].get("date") == today(now) else 0.0
    daily = held["daily"] + extra if held["daily"] else 0.0
    monthly = held["monthly"] + extra if held["monthly"] else 0.0
    reached = near = ""
    for which, spent, cap in (("day", day, daily), ("month", month, monthly)):
        if cap <= 0:
            continue
        if spent >= cap and not reached:
            reached = which
        elif spent >= cap * held["warn_at"] and not near:
            near = which
    state = "reached" if reached else "near" if near else "ok"
    which = reached or near
    out = {"today": round(day, 4), "month": round(month, 4), "daily": daily, "monthly": monthly,
           "extra": extra, "state": state, "which": which, "stops": held["at_limit"] == STOP,
           "settings": held, "date": today(now),
           "said": {"today": _money(day), "month": _money(month),
                    "daily": _money(daily) if daily else "no limit",
                    "monthly": _money(monthly) if monthly else "no limit"}}
    out["words"] = words(out)
    return out


def _money(d: float) -> str:
    return f"${d:,.2f}"


def _midnight_said(which: str) -> str:
    return "midnight" if which == "day" else "the 1st of next month"


def words(st: dict) -> str:
    """The state, in one or two sentences for the screen, the phone and the voice."""
    if st["state"] == "ok":
        return ""
    which = st["which"]
    spent = st["today"] if which == "day" else st["month"]
    cap = st["daily"] if which == "day" else st["monthly"]
    period = "today" if which == "day" else "this month"
    limit = "daily" if which == "day" else "monthly"
    if st["state"] == "near":
        then = ("it pauses everything it pays for per use and asks you" if st["stops"]
                else "it only warns you and carries on")
        return (f"Rouh has spent {_money(spent)} of your {_money(cap)} {limit} spending limit {period}. "
                f"At the limit {then}.")
    if st["stops"]:
        return (f"Rouh has reached your {limit} spending limit: {_money(spent)} of {_money(cap)} {period}. "
                f"It has paused everything it pays for per use, chats included, until {_midnight_said(which)}. "
                f"To carry on, press Allow ${MORE:,.0f} more today, or raise the limit, on What the models cost.")
    return (f"Rouh is over your {limit} spending limit: {_money(spent)} of {_money(cap)} {period}. "
            "It carries on because the limit is set to only warn.")


# --- kept on every call ---------------------------------------------------------------------------

#: org id -> (when read, status). Read again in a thread when older than FRESH.
_cache: dict[str, tuple[float, dict]] = {}
_lock = threading.Lock()
#: Notice keys this process has already said, so the database is not asked again for each.
_said: set[str] = set()


def forget(org_id: str = "") -> None:
    with _lock:
        if org_id:
            _cache.pop(str(org_id), None)
        else:
            _cache.clear()


def _fresh(org_id: str) -> dict | None:
    with _lock:
        got = _cache.get(org_id)
    if got and time.monotonic() - got[0] < FRESH:
        return got[1]
    return None


async def current(org_id: str) -> dict | None:
    """The status, from the cache or worked out again in a thread; None when it cannot be read,
    which stops nothing and says so in the log."""
    org_id = str(org_id or "")
    if not org_id:
        return None
    got = _fresh(org_id)
    if got is not None:
        await _tell(org_id, got)        # each notice once (`_said`); the readout fills the cache too
        return got
    try:
        got = await asyncio.to_thread(_status_closed, org_id)
    except Exception:  # noqa: BLE001 - a limit that cannot be read stops nothing
        log.exception("the spending limit of %s could not be read", org_id)
        return None
    with _lock:
        _cache[org_id] = (time.monotonic(), got)
    await _tell(org_id, got)
    return got


#: The organisation of the one person, for a call made with nobody named (`only_org`).
_ONLY: list = []


async def only_org() -> str:
    """The organisation of an installation's one person, read once; "" when there are several."""
    if _ONLY:
        return _ONLY[0]

    def read() -> str:
        from django.db import close_old_connections

        from .tenancy import Tenancy

        close_old_connections()
        who = Tenancy().only_person()
        return str(getattr(who, "org_id", "") or "") if who is not None else ""

    try:
        got = await asyncio.to_thread(read)
    except Exception:  # noqa: BLE001
        return ""
    if got:
        _ONLY[:] = [got]
    return got


def _status_closed(org_id: str) -> dict:
    from django.db import close_old_connections

    close_old_connections()
    return status(org_id)


async def _notify(key: str, title: str, body: str, *, alarm: bool = False) -> None:
    if key in _said:
        return
    _said.add(key)
    from . import notices

    try:
        await notices.notify(title=title, body=body, kind="alarm" if alarm else "rouh", key=key,
                             link="/?costs=1", link_label="What the models cost",
                             phone_text=body if alarm else "", at_once=alarm)
    except Exception:  # noqa: BLE001 - the log has it either way
        log.exception("a spending-limit notice could not be said")


async def _tell(org_id: str, st: dict) -> None:
    """The notices the status calls for: the starting limit once, near once, reached once."""
    while _told_start:
        org, start = _told_start.pop()
        if start.get("started") == "history":
            body = (f"Rouh now keeps a spending limit on what it pays per use: {_money(start['daily'])} a day "
                    f"and {_money(start['monthly'])} a month, set half again over what it has really spent "
                    "lately, so nothing that works today stops. Change it on What the models cost.")
        else:
            body = (f"Rouh keeps a spending limit on what it pays per use: {_money(start['daily'])} a day and "
                    f"{_money(start['monthly'])} a month. Change it on What the models cost.")
        await _notify(f"spending-limit:start:{org}", "Your spending limit", body)
    if st["state"] == "ok":
        return
    period = st["date"] if st["which"] == "day" else st["date"][:7]
    level = int(st["daily"] if st["which"] == "day" else st["monthly"])
    key = f"spending-limit:{st['state']}:{st['which']}:{period}:{level}:{org_id}"
    if st["state"] == "near":
        await _notify(key, "Your spending limit is near", st["words"])
    else:
        await _notify(key, "Your spending limit is reached" if st["stops"] else "Over your spending limit",
                      st["words"], alarm=True)


#: The first characters of a request body that say its model.
_MODEL = re.compile(rb'"model"\s*:\s*"([^"]{1,120})"')
#: A picture or file sent inline, which is far fewer tokens than its characters.
_INLINE = re.compile(rb'"(?:data|image_url|file_data)"\s*:\s*"(?:data:[^"]{0,80})?[A-Za-z0-9+/=]{400,}"')


def estimate(body: bytes) -> tuple[str, float] | None:
    """What a request would cost at most, by its text at full input price: (model, dollars). A
    request read from the cache costs far less, so this is an upper figure, which is what a
    warning before something expensive wants."""
    from . import costs

    if not body:
        return None
    found = _MODEL.search(body)
    model = found.group(1).decode("utf-8", "replace") if found else ""
    rates = costs.rates_of(model) if model else None
    if not rates:
        return None
    text = _INLINE.sub(b'""', body) if len(body) > 4000 else body
    return model, len(text) / 4 * rates["in"] / costs.PER


async def gate(org_id: str, body: bytes, purpose: str = "") -> str | None:
    """Before a call goes out: the words to refuse it with when the limit is reached and set to
    stop, or None to send it. Says a dear call as it goes."""
    st = await current(org_id)
    if st is None:
        return None
    expensive = float(st["settings"].get("expensive") or 0)
    if expensive > 0 and len(body) / 4 * 10.0 / 1_000_000 >= expensive:  # cheap first look: $10/M is dear
        try:
            got = estimate(body)
        except Exception:  # noqa: BLE001
            got = None
        if got and got[1] >= expensive:
            use = purpose or "a call"
            await _notify(f"spending-limit:dear:{use}:{st['date']}:{org_id}",
                          "An unusually expensive call",
                          f"Rouh is sending a call for {use} on {got[0]} that could cost up to about "
                          f"{_money(got[1])}, over the {_money(expensive)} you asked to be told about. Less if "
                          "most of it is read from the cache. Change this figure on What the models cost.")
    if st["state"] == "reached" and st["stops"]:
        return st["words"]
    return None


def refusal(request, provider: str, said: str):
    """The answer a refused call gets, without leaving this machine: a 400 in the company's own
    shape, so every caller handles it as the refused call it is, and none tries it again."""
    import httpx

    if provider == "anthropic":
        body = {"type": "error", "error": {"type": REFUSED, "message": said}}
    else:
        body = {"error": {"message": said, "type": REFUSED, "code": REFUSED, "param": None}}
    return httpx.Response(400, json=body, request=request,
                          headers={"x-should-retry": "false", "request-id": "rouh-spending-limit"})


def words_of(exc) -> str | None:
    """The words of a call this limit refused, or None for any other failure."""
    body = getattr(exc, "body", None)
    inner = body.get("error") if isinstance(body, dict) else None
    if not isinstance(inner, dict) and isinstance(body, dict):
        inner = body
    if isinstance(inner, dict) and REFUSED in (inner.get("type"), inner.get("code")):
        return str(inner.get("message") or "")
    if REFUSED in str(getattr(exc, "code", "") or "") or REFUSED in str(getattr(exc, "type", "") or ""):
        return str(getattr(exc, "message", "") or "")
    return None


def for_screen(org_id: str, *, can_change: bool) -> dict:
    """What the cost screen and the orb's readout show: from the figures every call is checked
    against while they are fresh, so a readout polled every few seconds adds nothing up."""
    st = _fresh(str(org_id))
    if st is None:
        st = status(org_id)
        with _lock:
            _cache[str(org_id)] = (time.monotonic(), st)
    held = st["settings"]
    return {"today": st["today"], "month": st["month"], "daily": st["daily"], "monthly": st["monthly"],
            "set": {"daily": held["daily"], "monthly": held["monthly"], "warn_at": held["warn_at"],
                    "expensive": held["expensive"], "at_limit": held["at_limit"]},
            "extra": st["extra"], "state": st["state"], "which": st["which"], "stops": st["stops"],
            "said": st["said"], "words": st["words"], "more": MORE, "can_change": can_change,
            "started": held.get("started") or ""}


__all__ = ["DAILY", "MONTHLY", "EXPENSIVE", "MORE", "REFUSED", "allow_more", "estimate", "for_screen",
           "forget", "gate", "put", "refusal", "settings", "status", "words", "words_of"]
