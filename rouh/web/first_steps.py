"""Four genes for a first-time user, over the web (`rouh/first_steps.py`, night 52's `search_words`,
`search_ask`, `search_settings` and `type_anywhere`).

``POST /api/first-steps`` ``{switch, detail}``: one of them was used. It says so, and nothing
else.
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import first_steps

from .common import answer, body_of, only, refuse, who


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in first_steps.GENES:
        return refuse("That is not one of the first steps' genes.", 400)
    if not await sync_to_async(first_steps.used)(me, switch, str(body.get("detail") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


__all__ = ["used"]
