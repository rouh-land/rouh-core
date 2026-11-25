"""The Robot chat's one address (`rouh/robotchat.py`).

    POST /api/robot/chat    the signed-in person's Robot chat, made if it is not there yet

Robot in the navigation calls it and opens the chat it answers with.
"""
from __future__ import annotations

import asyncio

from django.http import HttpRequest

from .common import answer, only, refuse, who

NO_STORE = {"Cache-Control": "no-store"}


@only("POST")
async def chat(request: HttpRequest):
    from rouh import robotchat

    me = await asyncio.to_thread(who, request)
    if me is None:
        return refuse("Sign in first.", 401)
    cid = await asyncio.to_thread(robotchat.ensure_chat, me)
    return answer({"ok": True, "chat": cid, "title": robotchat.CHAT_TITLE}, headers=NO_STORE)
