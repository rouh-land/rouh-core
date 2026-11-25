"""Anatomy, Meta, Copy off this machine, at /anatomy/meta/backups (`rouh/offsite_setup.py`, task 98, gap G18).

    GET  /api/anatomy/backups              whether a copy goes off this machine, where to, how it is
                                           locked, the last copy and what the bucket holds; the two
                                           kinds with their steps. Never a key or the password
    POST /api/anatomy/backups              {kind: r2|s3, where, bucket, key_id, secret}: checked with the
                                           bucket, then kept; answers the password once, when one is made
    POST /api/anatomy/backups/password     a new password for the copies from now on, answered (and shown
                                           again on the page) until it is confirmed saved
    POST /api/anatomy/backups/saved        "I have saved it": the password is not shown again
    POST /api/anatomy/backups/send         one copy now, in the background
    POST /api/anatomy/backups/stop         no more copies; the bucket keeps what it has
    GET  /api/anatomy/backups/ask          {ask: true} when the one popup is to be shown now
    POST /api/anatomy/backups/ask          {answer: shown|r2|s3|later}: it was shown, or answered

Reading needs a sign-in; every change needs this Rouh's administrator. The keys are kept sealed with
the others (`rouh/service_keys.py`), and nothing here is ever logged with a value.
"""
from __future__ import annotations

import asyncio
import logging

from django.http import HttpRequest

from .clock import _signed_in, their_clock
from .common import answer, body_of, only, refuse

log = logging.getLogger("rouh.web.backups")
NO_STORE = {"Cache-Control": "no-store"}


async def _me(request):
    return await asyncio.to_thread(_signed_in, request)


async def _do(request, work):
    from rouh import offsite_setup

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    try:
        body = body_of(request) if request.method == "POST" else {}
        got = await asyncio.to_thread(work, me, body)
    except offsite_setup.Refused as exc:
        page = await asyncio.to_thread(offsite_setup.state, me)
        return refuse(str(exc), 400, **page)
    except Exception:  # noqa: BLE001 - said plainly, and the log has why (never a value)
        log.exception("Copy off this machine could not do that")
        return refuse("That could not be done. Try again in a moment.", 500)
    return answer({"ok": True, **got}, headers=NO_STORE)


@only("GET", "POST")
@their_clock
async def page(request: HttpRequest):
    from rouh import offsite_setup

    if request.method == "GET":
        return await _do(request, lambda me, _b: offsite_setup.state(me))

    def go(me, b):
        try:
            return offsite_setup.save(me, b.get("kind"), b.get("where"), b.get("bucket"), b.get("key_id"),
                                      b.get("secret"))
        finally:
            b.clear()
    return await _do(request, go)


@only("POST")
@their_clock
async def password(request: HttpRequest):
    from rouh import offsite_setup

    return await _do(request, lambda me, _b: offsite_setup.new_password(me))


@only("POST")
@their_clock
async def saved(request: HttpRequest):
    from rouh import offsite_setup

    return await _do(request, lambda me, _b: offsite_setup.password_saved(me))


@only("POST")
@their_clock
async def send(request: HttpRequest):
    from rouh import offsite_setup

    return await _do(request, lambda me, _b: offsite_setup.send_now(me))


@only("POST")
@their_clock
async def stop(request: HttpRequest):
    from rouh import offsite_setup

    return await _do(request, lambda me, _b: offsite_setup.stop(me))


@only("GET", "POST")
@their_clock
async def ask(request: HttpRequest):
    from rouh import offsite_setup

    if request.method == "GET":
        return await _do(request, lambda me, _b: {"ask": offsite_setup.ask_now(me)})
    return await _do(request, lambda me, b: {"asked": offsite_setup.answered(me, b.get("answer"))})
