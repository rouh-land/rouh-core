"""Four genes for building Rouh faster, over the web (`rouh/run_desk.py`, night 52's `run_twin`,
`start_twice`, `run_copy` and `start_keys`).

``POST /api/run-desk`` ``{switch, event, run}``: one of them was used. It says so, and nothing
else.
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import run_desk

from .common import answer, body_of, only, refuse, who


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in run_desk.GENES:
        return refuse("That is not one of the run desk's genes.", 400)
    event = str(body.get("event") or "")
    if not await sync_to_async(run_desk.used)(me, switch, event, str(body.get("run") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


__all__ = ["used"]
