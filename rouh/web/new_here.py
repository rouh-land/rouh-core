"""Four genes for somebody new to Rouh, over the web (`rouh/new_here.py`, night 57).

``POST /api/new-here`` ``{switch, event, detail}``: one of them was used, as the page saw it.
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import new_here

from .common import answer, body_of, only, refuse, who


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in new_here.GENES:
        return refuse("That is not one of night 57's genes.", 400)
    if not await sync_to_async(new_here.used)(me, switch, str(body.get("event") or ""),
                                        str(body.get("detail") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


__all__ = ["used"]
