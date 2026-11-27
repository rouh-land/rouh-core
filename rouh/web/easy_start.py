"""Four genes for somebody new to Rouh, over the web (`rouh/easy_start.py`, night 56).

``POST /api/easy-start`` ``{switch, event, detail}``: one of them was used, as the page saw it.
``GET /api/easy-start/chat``: whether the chats can answer now (`chat_ready`).
``GET /api/easy-start/chat-file?chat=<id>&name=<as shown>``: the whole chat as a plain text file (`chat_save`).
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpRequest, HttpResponse
from django.utils.http import content_disposition_header

from rouh import easy_start
from rouh.config import config

from .common import answer, body_of, only, refuse, who

NO_STORE = {"Cache-Control": "no-store"}


@only("POST")
async def used(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    body = body_of(request)
    switch = str(body.get("switch") or "")
    if switch not in easy_start.GENES:
        return refuse("That is not one of night 56's genes.", 400)
    if not await sync_to_async(easy_start.used)(me, switch, str(body.get("event") or ""),
                                          str(body.get("detail") or "")):
        return refuse("That is switched off.", 404)
    return answer({"ok": True})


@only("GET")
async def chat(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    return answer(await sync_to_async(easy_start.chat_state)(me, config), headers=NO_STORE)


@only("GET")
async def chat_file(request: HttpRequest):
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("sign in", 401)
    wanted = (request.GET.get("chat") or "").strip()
    if not wanted:
        return refuse("no chat was asked for", 400)
    from rouh import runtime

    got = await sync_to_async(easy_start.chat_file)(me, runtime.memory, wanted,
                                                    (request.GET.get("name") or "").strip())
    if got is None:
        return refuse("That chat is not there, or saving a chat is switched off.", 404)
    name, text = got
    reply = HttpResponse(text.encode("utf-8"), content_type="text/plain; charset=utf-8")
    reply["Content-Disposition"] = content_disposition_header(True, name)
    reply["Cache-Control"] = "no-store"
    return reply


__all__ = ["chat", "chat_file", "used"]
