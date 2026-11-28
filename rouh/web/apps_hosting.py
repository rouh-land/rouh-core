"""Apps (`rouh/apps_hosting.py`), drawn by appspage.js at /apps.

Signed in, the person's own:
    GET  /api/apps                          everything the page draws
    POST /api/apps/check                    {app?}: check one app, or all, by its address now
    POST /api/apps/add                      {name, url, server_id | elsewhere, what, health_url, repo}
    POST /api/apps/<id>/edit                the same fields
    POST /api/apps/<id>/remove              off the list only
    POST /api/apps/<id>/do                  {verb, args}: a command for its server (CONTRACT.md, section 3)
    POST /api/apps/servers/new              {host, name}: a server waiting to join, with its line
    GET  /api/apps/servers/<id>/setup       its line and first-boot script again, while it waits
    POST /api/apps/servers/<id>/check       ask the server for a full report
    POST /api/apps/servers/add              {name, address, note}: a server that already runs apps
    POST /api/apps/servers/<id>/remove      off the list, its key no longer good
    POST /api/apps/hostinger/token          {token}: checked with Hostinger, kept sealed
    POST /api/apps/hostinger/forget
    GET  /api/apps/hostinger/vps            the VPSs in that account
    POST /api/apps/hostinger/setup          {vm, name, wipe, confirm}

The apps server, no sign-in (each checks its own credential):
    GET  /apps/join/<code>                  setup.sh, for a code still waiting (OPEN_PREFIXES)
    POST /apps/join/<code>                  the server's one call back: its key
    POST /api/apps/agent                    Authorization: Bearer <key>, every 30 s (TOKEN_PATHS)
"""
from __future__ import annotations

import asyncio
import logging

from django.http import HttpRequest, HttpResponse
from django.views.decorators.csrf import csrf_exempt

from .common import answer, body_of, only, public_base, refuse, who
from .google import Meter

log = logging.getLogger("rouh.web.apps_hosting")
NO_STORE = {"Cache-Control": "no-store"}
meter = Meter(30, 60.0)
joins = Meter(20, 60.0)
agents = Meter(60, 60.0)


def _asked(request: HttpRequest) -> str:
    try:
        return f"{request.scheme}://{request.get_host()}"
    except Exception:  # noqa: BLE001 - a host Django refuses is no address to hand out
        return public_base(request)


def _signed(request: HttpRequest):
    user = getattr(request, "user", None)
    if user is None or not getattr(user, "is_authenticated", False) or getattr(user, "is_guest", False):
        return None
    return who(request)


async def _page(me, request) -> dict:
    from rouh import apps_hosting

    return await asyncio.to_thread(apps_hosting.page, me, _asked(request))


async def _act(request: HttpRequest, work, *, said: str = ""):
    from rouh import apps_hosting

    me = await asyncio.to_thread(_signed, request)
    if me is None:
        return refuse("Sign in first.", 401)
    if meter.too_many("apps:" + str(me.user_id)):
        return refuse("That is too many tries. Wait a minute.", 429)
    body = body_of(request)
    try:
        got = await asyncio.to_thread(work, me, body)
    except apps_hosting.Refused as exc:
        return refuse(str(exc), 400, **(await _page(me, request)))
    except Exception:  # noqa: BLE001
        log.exception("apps: a change failed")
        return refuse("That did not work. Try again.", 500)
    finally:
        body.clear()
    out = {"ok": True, **(await _page(me, request))}
    if isinstance(got, dict):
        out["got"] = got
        out["said"] = got.get("said") or said
    else:
        out["said"] = str(got or said)
    return answer(out, headers=NO_STORE)


@only("GET")
async def listing(request: HttpRequest):
    me = await asyncio.to_thread(_signed, request)
    if me is None:
        return refuse("Sign in first.", 401)
    return answer(await _page(me, request), headers=NO_STORE)


@only("POST")
async def check(request: HttpRequest):
    from rouh import apps_hosting

    def work(me, b):
        got = apps_hosting.check(me, b.get("app") or None)
        up = sum(1 for g in got if g["state"] == "answering")
        return f"Checked {len(got)}: {up} answering." if len(got) != 1 else f"{got[0]['name']}: {got[0]['said']}"

    return await _act(request, work)


@only("POST")
async def add(request: HttpRequest):
    from rouh import apps_hosting

    def work(me, b):
        got = apps_hosting.add_app(me, name=b.get("name"), url=b.get("url"), server_id=b.get("server_id"),
                                   elsewhere=b.get("elsewhere"), what=b.get("what"), health_url=b.get("health_url"),
                                   repo=b.get("repo"), by="page")
        apps_hosting.check(me, got["id"])
        return {"said": f"{got['name']} is on the list.", **got}

    return await _act(request, work)


@only("POST")
async def edit(request: HttpRequest, ident: int):
    from rouh import apps_hosting

    def work(me, b):
        fields = {k: b[k] for k in ("name", "url", "health_url", "what", "repo", "server_id", "elsewhere") if k in b}
        got = apps_hosting.edit_app(me, ident, **fields)
        return {"said": f"{got['name']} is saved.", **got}

    return await _act(request, work)


@only("POST")
async def remove(request: HttpRequest, ident: int):
    from rouh import apps_hosting

    return await _act(request, lambda me, b: apps_hosting.remove_app(me, ident))


@only("POST")
async def do(request: HttpRequest, ident: int):
    from rouh import apps_hosting

    def work(me, b):
        c = apps_hosting.ask(me, ident, b.get("verb"), b.get("args") or {}, by="page")
        return {"said": f"{c['said']} sent. The server takes it within a minute.", **c}

    return await _act(request, work)


@only("GET")
async def command(request: HttpRequest, ident: int):
    from rouh import apps_hosting

    me = await asyncio.to_thread(_signed, request)
    if me is None:
        return refuse("Sign in first.", 401)
    try:
        return answer(await asyncio.to_thread(apps_hosting.result, me, ident), headers=NO_STORE)
    except apps_hosting.Refused as exc:
        return refuse(str(exc), 404)


@only("POST")
async def server_new(request: HttpRequest):
    from rouh import apps_hosting

    asked = _asked(request)

    def work(me, b):
        got = apps_hosting.new_server(me, host=str(b.get("host") or "hostinger"), name=str(b.get("name") or ""),
                                      asked=asked)
        return {"said": f"Waiting for {got['server']['name']} to call in.", **got}

    return await _act(request, work)


@only("GET")
async def server_setup(request: HttpRequest, ident: int):
    from rouh import apps_hosting

    me = await asyncio.to_thread(_signed, request)
    if me is None:
        return refuse("Sign in first.", 401)
    try:
        got = await asyncio.to_thread(apps_hosting.setup_for, me, ident, _asked(request))
    except apps_hosting.Refused as exc:
        return refuse(str(exc), 404)
    return answer(got, headers=NO_STORE)


@only("POST")
async def server_check(request: HttpRequest, ident: int):
    from rouh import apps_hosting

    def work(me, b):
        apps_hosting.ask(me, None, "check", server_id=ident, by="page")
        return "Asked for a full report. It comes within a minute."

    return await _act(request, work)


@only("POST")
async def server_add(request: HttpRequest):
    from rouh import apps_hosting

    def work(me, b):
        got = apps_hosting.register_server(me, name=b.get("name"), address=b.get("address"), note=b.get("note"))
        return {"said": f"{got['name']} is listed.", **got}

    return await _act(request, work)


@only("POST")
async def server_remove(request: HttpRequest, ident: int):
    from rouh import apps_hosting

    return await _act(request, lambda me, b: apps_hosting.remove_server(me, ident))


@only("POST")
async def hostinger_token(request: HttpRequest):
    from rouh import apps_hosting

    def work(me, b):
        got = apps_hosting.save_token(me, str(b.get("token") or ""))
        n = got["count"]
        return f"Hostinger accepted the token. It shows {n} VPS{'s' if n != 1 else ''}."

    return await _act(request, work)


@only("POST")
async def hostinger_forget(request: HttpRequest):
    from rouh import apps_hosting

    return await _act(request, lambda me, b: apps_hosting.forget_token(me))


@only("GET")
async def hostinger_vps(request: HttpRequest):
    from rouh import apps_hosting

    me = await asyncio.to_thread(_signed, request)
    if me is None:
        return refuse("Sign in first.", 401)
    try:
        return answer({"vps": await asyncio.to_thread(apps_hosting.hostinger_vps, me)}, headers=NO_STORE)
    except apps_hosting.Refused as exc:
        return refuse(str(exc), 400)


@only("POST")
async def hostinger_setup(request: HttpRequest):
    from rouh import apps_hosting

    asked = _asked(request)

    def work(me, b):
        return apps_hosting.hostinger_setup(me, b.get("vm"), name=str(b.get("name") or ""), wipe=bool(b.get("wipe")),
                                            confirm=str(b.get("confirm") or ""), asked=asked)

    return await _act(request, work)


# --- the apps server's own calls --------------------------------------------------------------------------

def _caller(request: HttpRequest) -> str:
    from .common import client_ip

    return client_ip(request) or "?"


@csrf_exempt
async def join(request: HttpRequest, code: str):
    from rouh import apps_hosting

    if request.method not in ("GET", "HEAD", "POST"):
        return HttpResponse(status=405)
    if joins.too_many("join:" + _caller(request)):
        return HttpResponse("Too many tries. Wait a minute.\n", status=429, content_type="text/plain")
    base, _ = await asyncio.to_thread(apps_hosting.base_address, _asked(request))
    if request.method == "POST":
        try:
            got = await asyncio.to_thread(apps_hosting.join, code, body_of(request), base)
        except apps_hosting.Refused as exc:
            return refuse(str(exc), 403)
        log.info("apps: server %s joined", got["server_id"])
        return answer(got, headers=NO_STORE)
    text = await asyncio.to_thread(apps_hosting.join_script, code, base)
    return HttpResponse(text, content_type="text/x-shellscript; charset=utf-8", headers=NO_STORE)


@csrf_exempt
@only("POST")
async def agent(request: HttpRequest):
    from rouh import apps_hosting

    header = request.headers.get("authorization") or ""
    key = header[7:].strip() if header[:7].lower() == "bearer " else ""
    server = await asyncio.to_thread(apps_hosting.server_by_key, key)
    if server is None:
        return refuse("This server's key is not good here any more.", 401)
    if agents.too_many("agent:" + str(server.id)):
        return refuse("Too often.", 429)
    try:
        got = await asyncio.to_thread(apps_hosting.agent, server, body_of(request))
    except Exception:  # noqa: BLE001
        log.exception("apps: server %s's call failed", server.id)
        return refuse("Rouh could not take that just now.", 500)
    return answer(got, headers=NO_STORE)
