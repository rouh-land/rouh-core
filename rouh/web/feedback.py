"""Feedback over the web: what the panel sends, and All feedback (`rouh/feedback.py`, `app/feedback.js`).

    POST /api/feedback/send     {body, page, files: [{session, id}]}: kept, and sent on to rouh.land
                                before the answer (at most `feedback.SEND_NOW` s; what cannot go
                                then is left to the beat); answered {ok, feedback, said: "Thank you ..."}
    GET  /api/feedback/mine     the signed-in person's own feedback, newest first, with each status

Both answer the signed-in person only, about their own rows (`Tenancy.current`); nothing here reads
an organisation or a person out of the request. `POST /api/gene-therapy` and `POST /api/feedback`,
what a page loaded before 23 November 2026 sends, are taken as a feedback too.
"""
from __future__ import annotations

import asyncio
import logging

from asgiref.sync import sync_to_async
from django.http import HttpResponseNotAllowed

from rouh import feedback

from .common import answer, body_of, refuse, who

log = logging.getLogger("rouh.web.feedback")

NO_STORE = {"Cache-Control": "no-store"}
THANKS = "Thank you for your feedback."


def _files(sent) -> list[dict]:
    """The files already uploaded through `/attachments/<session>`, found where they went. An id
    that was never uploaded, or is not in that folder, is left out: a screenshot that never arrived
    must not throw away the sentence it came with."""
    from rouh import runtime

    wanted: dict[str, list[str]] = {}
    for entry in (sent or [])[:feedback.MAX_FILES] if isinstance(sent, list) else []:
        if not isinstance(entry, dict):
            continue
        session, att_id = str(entry.get("session") or ""), str(entry.get("id") or "")
        if session and att_id:
            wanted.setdefault(session, []).append(att_id)
    out: list[dict] = []
    for session, ids in wanted.items():
        found, missing = runtime.files.resolve(session, ids)
        if missing:
            log.info("%s file(s) of a feedback were not found", len(missing))
        for rec in found:
            rec = dict(rec)
            rec.setdefault("session", session)
            out.append(rec)
    return out


async def _send_now(fid: str) -> None:
    """Send it to rouh.land now, waiting at most `feedback.SEND_NOW` seconds. What is not done by
    then goes on in its thread, and the beat tries anything still queued again."""
    try:
        await asyncio.wait_for(asyncio.to_thread(feedback.send_due, only=fid, wait=feedback.SEND_NOW),
                               timeout=feedback.SEND_NOW + 2)
    except asyncio.TimeoutError:
        log.info("feedback %s was not taken by rouh.land in time; the beat sends it", fid)


async def send(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("Sign in to Rouh first.", 401)
    sent = body_of(request)
    try:
        files = await sync_to_async(_files)(sent.get("files"))
        email = str(getattr(me, "email", "") or "")
        row = await sync_to_async(feedback.add)(me, body=str(sent.get("body") or ""),
                                                page=str(sent.get("page") or ""), files=files, email=email)
    except feedback.Refused as exc:
        return refuse(str(exc), 400)
    await _send_now(row["id"])
    row = await sync_to_async(feedback.one)(me, row["id"]) or row
    return answer({"ok": True, "feedback": row, "said": THANKS}, headers=NO_STORE)


async def mine(request):
    if request.method not in ("GET", "HEAD"):
        return HttpResponseNotAllowed(["GET"])
    me = await sync_to_async(who)(request)
    if me is None:
        return refuse("Sign in to Rouh first.", 401)
    try:
        got = await sync_to_async(feedback.mine)(me)
    except feedback.Refused as exc:
        return refuse(str(exc), 400)
    return answer(got, headers=NO_STORE)


async def old_address(request):
    """`/api/gene-therapy` and `/api/feedback`, what a page loaded before 23 November 2026 sends:
    a POST is a feedback, and anything else is gone."""
    if request.method == "POST":
        return await send(request)
    return refuse("Gene therapy is Feedback now: what was asked of it is in Evolution, Mutations.", 410)
