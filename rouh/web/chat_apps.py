"""Anatomy, Connections, Discord, Signal and WhatsApp (`rouh/chat_apps.py`), drawn by chatappspage.js.

    GET  /api/chat-apps/<app>             the app's keys as the Keys page has them (never a secret), whether
                                          it is being read, the trusted contacts linked, and for WhatsApp the
                                          webhook address and verify token to give Meta
    POST /api/chat-apps/<app>/link        {contact_id, ident}: this account on the app is this trusted contact's
    POST /api/chat-apps/<app>/unlink      {contact_id}
    POST /api/chat-apps/signal/register   {address, number, captcha, voice}: Signal sends that number a code
    POST /api/chat-apps/signal/verify     {address, number, code, pin}: the code back, and the number is Rouh's
    GET|POST /hooks/whatsapp              Meta's webhook: its check of the address, and each message, signed

The keys themselves are saved through Keys' own endpoints (`rouh/web/service_keys.py`), so they are
checked, sealed and taken up the one way every key is. Only an administrator of this Rouh's own
organisation changes anything; the webhook is open to everybody and reads nothing it was sent until
its signature is checked with the app secret.
"""
from __future__ import annotations

import asyncio
import json
import logging

from django.http import HttpRequest, HttpResponse
from django.views.decorators.csrf import csrf_exempt

from .clock import _signed_in, their_clock
from .common import answer, body_of, only, refuse
from .google import Meter

log = logging.getLogger("rouh.web.chat_apps")
NO_STORE = {"Cache-Control": "no-store"}
meter = Meter(10, 60.0)


async def _me(request):
    return await asyncio.to_thread(_signed_in, request)


def _admin(me) -> bool:
    from rouh.tenancy import DEFAULT_ORG_ID

    return bool(getattr(me, "is_admin", False)) and str(getattr(me, "org_id", "")) == DEFAULT_ORG_ID


@only("GET")
@their_clock
async def page(request: HttpRequest, app: str):
    from rouh import chat_apps

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    if app not in chat_apps.APPS:
        return refuse("There is no such app here.", 404)
    return answer(await asyncio.to_thread(chat_apps.page, me, app), headers=NO_STORE)


async def _act(request, app: str, work):
    from rouh import chat_apps, signal_chat

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    if app not in chat_apps.APPS:
        return refuse("There is no such app here.", 404)
    if not _admin(me):
        return refuse("Only an administrator of this Rouh changes its connections.", 403)
    if meter.too_many("chat-apps:" + str(me.user_id)):
        return refuse("That is too many tries. Wait a minute.", 429)
    body = body_of(request)
    try:
        said = await work(me, body)
    except (chat_apps.Refused, signal_chat.Refused) as exc:
        return refuse(str(exc), 400, **(await asyncio.to_thread(chat_apps.page, me, app)))
    except Exception:  # noqa: BLE001
        log.exception("a change to %s's page failed", app)
        return refuse("That did not work. Try again.", 500)
    finally:
        body.clear()
    return answer({"ok": True, "said": said or "", **(await asyncio.to_thread(chat_apps.page, me, app))},
                  headers=NO_STORE)


@only("POST")
@their_clock
async def link(request: HttpRequest, app: str):
    from rouh import chat_apps

    async def work(me, b):
        got = await asyncio.to_thread(chat_apps.link, me.user_id, me.org_id, app, b.get("contact_id"),
                                      str(b.get("ident") or ""))
        return f"{got['name']} is linked: a message from {got['ident']} on {chat_apps.NAMES[app]} is theirs."

    return await _act(request, app, work)


@only("POST")
@their_clock
async def unlink(request: HttpRequest, app: str):
    from rouh import chat_apps

    async def work(me, b):
        await asyncio.to_thread(chat_apps.unlink, me.user_id, me.org_id, app, b.get("contact_id"))
        return f"Unlinked: their {chat_apps.NAMES[app]} account is nobody again."

    return await _act(request, app, work)


@only("POST")
@their_clock
async def signal_register(request: HttpRequest):
    from rouh import signal_chat

    async def work(me, b):
        return await signal_chat.register(b.get("address"), b.get("number"), captcha=str(b.get("captcha") or ""),
                                          voice=bool(b.get("voice")))

    return await _act(request, "signal", work)


@only("POST")
@their_clock
async def signal_verify(request: HttpRequest):
    from rouh import signal_chat

    async def work(me, b):
        return await signal_chat.verify(b.get("address"), b.get("number"), b.get("code"), pin=str(b.get("pin") or ""))

    return await _act(request, "signal", work)


@csrf_exempt
async def whatsapp_hook(request: HttpRequest):
    """Meta's webhook. A GET is its check of the address; a POST is messages, refused unless signed."""
    from rouh import whatsapp_chat

    if request.method == "GET":
        got = await asyncio.to_thread(whatsapp_chat.verify_hook, request.GET)
        if got is None:
            return HttpResponse(status=403)
        return HttpResponse(got, content_type="text/plain")
    if request.method != "POST":
        return HttpResponse(status=405)
    body = request.body
    if len(body) > whatsapp_chat.MOST_BODY:
        return HttpResponse(status=413)
    ok = await asyncio.to_thread(whatsapp_chat.signed, body, request.headers.get("X-Hub-Signature-256", ""))
    if not ok:
        log.warning("whatsapp: a post to the webhook was refused: it was not signed with this Rouh's app secret")
        return HttpResponse(status=401)
    try:
        payload = json.loads(body)
    except ValueError:
        return HttpResponse(status=400)
    from rouh import runtime

    listener = getattr(runtime, "whatsapp_listener", None)
    if listener is not None and isinstance(payload, dict):
        listener.posted(payload)
    return HttpResponse(status=200)
