"""The projector's addresses (`rouh/projector.py`).

    GET  /projector                  the wall: the Robot chat full screen. Holds nothing of anybody's: what it
                                     shows comes from the feed, with the Pi's key or the person's sign-in
    GET  /api/projector/feed         the newest card, what was heard and said; a display key or a sign-in
    GET  /api/projector/image?src=   a picture on that card, fetched by Rouh, for the same two
    GET  /projector/setup            the setup page, signed in
    GET  /api/projector/state        whether a projector is set up and when it was last seen, signed in
    POST /api/projector/setup-file   {origin}: a new key for the projector, ending the old one, in its setup
                                     file, signed in
    POST /api/projector/off          end the projector's key, signed in

The feed and the picture answer to `Authorization: Bearer <display key>` (`rouh/web/gate.py`, TOKEN_PATHS),
and to nothing else that is not a sign-in: a voice device's key, a revoked key or an account that is gone is
told to set the projector up.
"""
from __future__ import annotations

import asyncio
import logging

from django.http import HttpRequest, HttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import render

from .common import answer, body_of, only, refuse, who

log = logging.getLogger("rouh.web.projector")
NO_STORE = {"Cache-Control": "no-store"}
NOT_SET_UP = "This projector is not set up, or it was turned off."


def _display(request: HttpRequest) -> str | None:
    """The user id of the person whose projector this is, from a display key or a sign-in, or None."""
    from rouh import devices

    header = request.headers.get("authorization") or ""
    if header[:7].lower() == "bearer ":
        rec = devices.who(header[7:].strip())
        if rec is None or rec.get("kind") != "display":
            return None
        from rouh.models import User

        account = User.objects.filter(pk=rec["user_id"], org_id=rec["org_id"], is_active=True).first()
        if account is None or getattr(account, "is_guest", False):
            return None
        from rouh import projector

        projector.saw(rec["user_id"])
        return str(rec["user_id"])
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False) or getattr(user, "is_guest", False):
        return None
    me = who(request)
    return str(me.user_id) if me is not None else None


@only("GET")
async def wall(request: HttpRequest):
    response = render(request, "rouh/projector.html", {})
    response["Cache-Control"] = "no-store"
    return response


@only("GET")
async def feed(request: HttpRequest):
    from rouh import projector

    user_id = await asyncio.to_thread(_display, request)
    if user_id is None:
        return refuse(NOT_SET_UP, 401, set_up=False)
    got = await asyncio.to_thread(projector.feed, user_id)
    return answer(got, headers=NO_STORE)


@only("GET")
async def image(request: HttpRequest):
    from rouh import picture

    user_id = await asyncio.to_thread(_display, request)
    if user_id is None:
        return refuse(NOT_SET_UP, 401, set_up=False)
    try:
        body, media = await picture.fetch(request.GET.get("src", ""))
    except picture.Refused as exc:
        return refuse(str(exc), 400)
    except picture.Unreadable as exc:
        return refuse(str(exc), 502)
    response = HttpResponse(body, content_type=media)
    for name, value in dict(picture.ANSWER_HEADERS).items():
        response[name] = value
    return response


def _me(request: HttpRequest):
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False) or getattr(user, "is_guest", False):
        return None
    return who(request)


@only("GET")
async def setup(request: HttpRequest):
    me = await asyncio.to_thread(_me, request)
    if me is None:
        return refuse("Sign in first.", 401)
    get_token(request)  # the page's two writes carry Django's token (`csrf.js`)
    from rouh import robotchat

    response = render(request, "rouh/projector_setup.html", {"robot_chat": robotchat.chat_id_for(me)})
    response["Cache-Control"] = "no-store"
    return response


@only("GET")
async def state(request: HttpRequest):
    from rouh import projector

    me = await asyncio.to_thread(_me, request)
    if me is None:
        return refuse("Sign in first.", 401)
    got = await asyncio.to_thread(projector.state, str(me.user_id), str(me.org_id))
    return answer(got, headers=NO_STORE)


@only("POST")
async def setup_file(request: HttpRequest):
    from rouh import projector

    me = await asyncio.to_thread(_me, request)
    if me is None:
        return refuse("Sign in first.", 401)
    origin = str(body_of(request).get("origin") or "").strip() or f"{request.scheme}://{request.get_host()}"
    try:
        text = await asyncio.to_thread(projector.make, str(me.user_id), str(me.org_id), origin)
    except ValueError as exc:
        return refuse(str(exc), 422)
    log.info("a projector setup file was made for user %s", me.user_id)
    return answer({"ok": True, "file": text}, headers=NO_STORE)


@only("POST")
async def off(request: HttpRequest):
    from rouh import projector

    me = await asyncio.to_thread(_me, request)
    if me is None:
        return refuse("Sign in first.", 401)
    ended = await asyncio.to_thread(projector.turn_off, str(me.user_id), str(me.org_id))
    return answer({"ok": True, "ended": ended}, headers=NO_STORE)
