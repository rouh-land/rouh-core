"""Four genes for a first-time user, over the web (`rouh/new_owner.py`, night 54's `key_steps`,
`show_around` and `page_links`; `key_clean` reports its own where a key is kept).

``POST /api/new-owner`` ``{switch, event, detail}``: one of them was used. It says so,
and nothing else.
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import new_owner

from .common import answer, body_of, only, refuse, who


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in new_owner.GENES:
        return refuse("That is not one of the new owner genes.", 400)
    if not await sync_to_async(new_owner.used)(me, switch, str(body.get("event") or ""),
                                               str(body.get("detail") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


__all__ = ["used"]
