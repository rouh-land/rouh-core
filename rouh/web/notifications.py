"""The Notifications page, at /notifications: every notification ever kept, to find, read,
follow and clear (`rouh/notices.py`, `noticespage.js`).

    GET  /api/notifications          one page of the view the query asks for, with every
                                     filter's choices and counts: ?q= words to find, &kind= kinds
                                     (comma separated), &show= unread | read | cleared (else every
                                     one not cleared), &when= today | week | month | older |
                                     custom (&since=, &until=, seconds), &today= the start of the
                                     person's day, seconds, &to= places it leads (comma separated),
                                     &task= a task's folder, &sub= groups of Jobs (comma separated:
                                     failed, waiting, live, tasks, research, auto, other),
                                     &sort= newest | oldest | kind | unread, &offset=, &limit= (at
                                     most 200 cards). Every notification about one job, or one
                                     task, is one card (`stack`: how many, their ids, the rest).
    POST /api/notifications/act      {act: read | unread | clear | restore | seen | later, ids?: [...],
                                     match?: {the same criteria as the query}}: on the ones picked,
                                     or on every one a view shows; answers what each changed one
                                     was before, `changed`, for Undo
    POST /api/notifications/undo     {changed: [[id, state], ...]}: puts them back

Only the signed-in person's own, always asked for by their organisation and account together
(`who`), and every open tab of theirs is told the list moved (`notices.tell`), so the bell and
the drop-in stack follow a press made here.
"""
from __future__ import annotations

import asyncio

from django.http import HttpRequest

from .common import answer, body_of, only, refuse, who

NO_STORE = {"Cache-Control": "no-store"}


async def _me(request):
    return await asyncio.to_thread(who, request)


@only("GET")
async def listing(request: HttpRequest):
    from rouh import notices

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    asked = {k: request.GET.get(k, "") for k in (
        "q", "kind", "sub", "show", "when", "since", "until", "today", "to", "task", "sort",
        "offset", "limit")}
    got = await asyncio.to_thread(notices.browse, me, asked)
    return answer(got, headers=NO_STORE)


@only("POST")
async def act(request: HttpRequest):
    from rouh import notices

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    body = body_of(request)
    what = str(body.get("act") or "")
    if what not in (*notices.BULK, "seen", "later"):
        return refuse("That is not something a notification can have done to it.", 400)
    match = body.get("match")
    ids = body.get("ids")
    if match is not None and not isinstance(match, dict):
        return refuse("Which notifications was not said.", 400)
    if match is None and not isinstance(ids, list):
        return refuse("Which notifications was not said.", 400)
    got = await asyncio.to_thread(lambda: notices.bulk(me, what, ids=ids, match=match))
    if got["count"] and what != "seen":  # "later" moves the stack on every tab
        await notices.tell(me)
    return answer({"ok": True, **got}, headers=NO_STORE)


@only("POST")
async def undo(request: HttpRequest):
    from rouh import notices

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    changed = body_of(request).get("changed")
    if not isinstance(changed, list):
        return refuse("Nothing to put back was said.", 400)
    n = await asyncio.to_thread(notices.undo, me, changed)
    if n:
        await notices.tell(me)
    return answer({"ok": True, "count": n}, headers=NO_STORE)
