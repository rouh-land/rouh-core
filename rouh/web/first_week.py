"""Four genes for somebody's first week, over the web (`rouh/first_week.py`, night 55).

``POST /api/first-week`` ``{switch, event, detail}``: one of them was used. It says so, and nothing else.
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import first_week

from .common import answer, body_of, only, refuse, who


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in first_week.GENES:
        return refuse("That is not one of night 55's genes.", 400)
    if not await sync_to_async(first_week.used)(me, switch, str(body.get("event") or ""),
                                          str(body.get("detail") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


__all__ = ["used"]
