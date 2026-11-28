"""Four genes for building Rouh faster, over the web (`rouh/build_more.py`, night 57).

``POST /api/build-more`` ``{switch, event, detail}``: one of them was used, as the page saw it.
``POST /api/build-more/trouble`` ``{kind, what, where, screen}``: something broke on the person's
screen (a script error, or a request the server failed), kept for a run's brief (`screen_errors`).
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import build_more

from .common import answer, body_of, only, refuse, who


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in build_more.GENES:
        return refuse("That is not one of night 57's genes.", 400)
    if not await sync_to_async(build_more.used)(me, switch, str(body.get("event") or ""),
                                          str(body.get("detail") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


@only("POST")
async def trouble(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    kept = await sync_to_async(build_more.report)(
        me, str(body.get("kind") or ""), str(body.get("what") or ""),
        str(body.get("where") or ""), str(body.get("screen") or ""))
    if not kept:
        return refuse("That was not kept: it is switched off, or it said nothing.", 404)
    return answer({"ok": True})


__all__ = ["trouble", "used"]
