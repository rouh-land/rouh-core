"""Every change, over the web: Evolution > Mutations' list of every change to Rouh's code
(`rouh/everychange.py`, `evolutionpage.js`).

    GET  /api/evolution/changes                 ?source=&q=&before=<id>: the newest fifty, the counts
                                                of every source, how many are live
    POST /api/evolution/changes/<id>/undo       start the run that takes one change out

The organisation's administrators only (`everychange._admin`); an id of another organisation's is
"not in the list".
"""
from __future__ import annotations

from asgiref.sync import sync_to_async
from django.http import HttpResponseNotAllowed

from rouh import everychange as changes

from .common import answer, refuse, who

NO_STORE = {"Cache-Control": "no-store"}


async def listing(request):
    if request.method not in ("GET", "HEAD"):
        return HttpResponseNotAllowed(["GET"])
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("Sign in to Rouh first.", 401)
    q = request.GET
    try:
        before = int(q.get("before") or 0)
    except ValueError:
        before = 0
    try:
        got = await sync_to_async(changes.listing)(me, source=str(q.get("source") or ""),
                                                   q=str(q.get("q") or ""), before=before)
    except changes.Refused as exc:
        return refuse(str(exc), 403)
    return answer(got, headers=NO_STORE)


async def undo(request, change_id: int):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("Sign in to Rouh first.", 401)
    try:
        got = await changes.undo(me, change_id)
    except changes.Refused as exc:
        return refuse(str(exc), 400)
    return answer(got, headers=NO_STORE)
