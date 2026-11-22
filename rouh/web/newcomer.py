"""Four genes for a first-time user, over the web (`rouh/newcomer.py`, night 51's `nav_plain`,
`search_typos`, `search_lessons` and `keys_list`).

``POST /api/newcomer`` ``{switch, detail}``: one of them was used. It says so, and for the plain
line under a navigation group keeps that group as read.
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import newcomer

from .common import answer, body_of, only, refuse, who


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in newcomer.GENES:
        return refuse("That is not one of the newcomer's genes.", 400)
    if not await sync_to_async(newcomer.used)(me, switch, str(body.get("detail") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


__all__ = ["used"]
