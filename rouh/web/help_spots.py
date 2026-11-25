"""Help icons on the screen, over the web (`rouh/help_spots.py`).

``POST /api/help-spots`` ``{act, spot}``: Got it on a spot (`got_it`), one put away after it was used
enough (`used`), one opened (`opened`) or its Guide link followed (`guide`), Hide all help
(`hide_all`) and its Undo (`unhide`), or Show help again (`show_again`). Answers with what the page shows now.
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest

from rouh import help_spots

from .common import answer, body_of, only, refuse, who


@only("POST")
async def act(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    got = await sync_to_async(help_spots.act)(me, str(body.get("act") or ""), str(body.get("spot") or "")[:80])
    if got is None:
        return refuse("That help icon is not known here, or help icons are switched off.", 404)
    return answer(got)


__all__ = ["act"]
