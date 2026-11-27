"""Four genes for building Rouh faster, over the web (`rouh/build_flow.py`, night 56).

``POST /api/build-flow`` ``{switch, event, detail}``: `page_broke` or `phone_view` was used.
``GET /api/build-flow/later``: the briefs saved for the next run. ``POST`` with ``{brief}`` saves
one, with ``{take: true}`` hands them all over once, and with ``{drop: n}`` forgets one.
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import build_flow

from .common import answer, body_of, only, refuse, who


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in build_flow.GENES:
        return refuse("That is not one of night 56's genes.", 400)
    if not await sync_to_async(build_flow.used)(me, switch, str(body.get("event") or ""),
                                          str(body.get("detail") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


@only("GET", "POST")
async def later(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    if request.method == "GET":
        held = await sync_to_async(build_flow.saved)(me)
        return answer({"saved": [{"brief": h["brief"], "at": h.get("at")} for h in held]})
    body = body_of(request)
    if body.get("take"):
        held = await sync_to_async(build_flow.take)(me)
        return answer({"taken": [h["brief"] for h in held]})
    if "drop" in body:
        try:
            index = int(body.get("drop"))
        except (TypeError, ValueError):
            return refuse("drop is the place of a saved brief, a number", 422)
        left = await sync_to_async(build_flow.drop)(me, index)
        if left is None:
            return refuse("That is switched off.", 404)
        return answer({"saved": left})
    count = await sync_to_async(build_flow.save)(me, str(body.get("brief") or ""))
    if count is None:
        return refuse("There was nothing to save, or saving for later is switched off.", 404)
    return answer({"saved": count})


__all__ = ["later", "used"]
