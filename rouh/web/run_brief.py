"""Four genes for building Rouh faster, over the web (`rouh/run_brief.py`, night 53's `brief_links`,
`run_task`, `page_run` and `brief_pictures`).

``POST /api/run-brief`` ``{switch, event, detail}``: one of the page's three was used. It says
so, and nothing else. A brief's paths are counted where the run starts (`rouh/runtime.py`).
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import run_brief

from .common import answer, body_of, only, refuse, who


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in run_brief.GENES:
        return refuse("That is not one of the run brief genes.", 400)
    if not await sync_to_async(run_brief.used)(me, switch, str(body.get("event") or ""),
                                                str(body.get("detail") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


__all__ = ["used"]
