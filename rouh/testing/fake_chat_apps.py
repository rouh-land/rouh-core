"""A stand-in for Discord, Signal (signal-cli-rest-api) and Meta's WhatsApp Cloud API, all three at once.

The same idea as `fake_telegram.py` and `fake_slack.py`: a real HTTP server in front of the real clients
(`rouh/discord_chat.py`, `rouh/signal_chat.py`, `rouh/whatsapp_chat.py`), so what a check proves is what
went over the wire. Point a world at it with ``ROUH_TEST_DISCORD_API=http://127.0.0.1:<port>/discord`` and
``ROUH_TEST_WHATSAPP_API=http://127.0.0.1:<port>/graph``, and type ``http://127.0.0.1:<port>/signal`` as
signal-cli's address on the Signal page.

**Discord** (``/discord``): ``GET /users/@me`` for `DISCORD_TOKEN` only (any other token is 401), opening a
direct message (``POST /users/@me/channels``; a user id ending in 0 has no server in common with the bot,
and answers Discord's 50007), reading one (``GET /channels/<id>/messages?after=``) and writing in it.

**Signal** (``/signal``): ``/v1/about`` in native mode, ``/v1/accounts``, registering a number (a number
ending in 9 asks for a captcha first, as Signal does; the code is always `SIGNAL_CODE`), ``/v1/receive``,
``/v2/send`` and typing.

**WhatsApp** (``/graph``): the phone number `WA_PHONE_ID`, read with `WA_TOKEN` only, and sending messages.

Knobs, each a POST with JSON:

- ``/_discord/say {"from", "text", "name"?}``: somebody writes to the bot in their direct message.
- ``/_signal/say {"from", "to", "text", "name"?, "group"?}``: somebody writes to Rouh's Signal number.
- ``/_whatsapp/say {"from", "text", "name"?, "rouh"}``: somebody writes to Rouh's WhatsApp number, and the
  stand-in posts Meta's webhook to ``<rouh>/hooks/whatsapp``, signed with `WA_APP_SECRET` (``"secret"``
  signs it with another); answers what Rouh answered.
- ``/_whatsapp/verify {"rouh", "token"}``: Meta's GET check of the webhook address.

And ``GET /_sent``: everything sent by any of the three, oldest first, as ``{"app", "to", "text"}``.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import itertools
import json
import time

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

DISCORD_TOKEN = "MTIzNDU2Nzg5MDEyMzQ1Njc4.GabCde.fake-discord-bot-token-for-tests-only"
DISCORD_BOT = {"id": "1234567890123456780", "username": "rouh_test_bot", "bot": True}
SIGNAL_CODE = "123456"
WA_TOKEN = "EAAGfakewhatsapptokenfortestsonly0123456789"
WA_PHONE_ID = "106540352242922"
WA_NUMBER = "+1 555-010-0199"
WA_APP_SECRET = "0123456789abcdef0123456789abcdef"

app = FastAPI()
SENT: list[dict] = []
_ids = itertools.count(1_300_000_000_000_000_000)
# Discord: channel id -> person; person -> channel; channel -> messages
DM_OF: dict[str, str] = {}
MESSAGES: dict[str, list[dict]] = {}
# Signal: registered numbers, pending codes, queued envelopes per number
SIG_ACCOUNTS: list[str] = []
SIG_PENDING: dict[str, str] = {}
SIG_QUEUE: dict[str, list[dict]] = {}


def _bot_ok(request: Request) -> bool:
    return request.headers.get("authorization", "") == "Bot " + DISCORD_TOKEN


def _no(status: int, message: str, code: int = 0):
    return JSONResponse({"message": message, "code": code}, status_code=status)


# --- Discord ---------------------------------------------------------------------------------

@app.get("/discord/users/@me")
async def d_me(request: Request):
    if not _bot_ok(request):
        return _no(401, "401: Unauthorized")
    return DISCORD_BOT


def _dm(person: str) -> str:
    for ch, who in DM_OF.items():
        if who == person:
            return ch
    ch = str(next(_ids))
    DM_OF[ch] = person
    MESSAGES[ch] = []
    return ch


@app.post("/discord/users/@me/channels")
async def d_open(request: Request):
    if not _bot_ok(request):
        return _no(401, "401: Unauthorized")
    body = await request.json()
    person = str(body.get("recipient_id") or "")
    return {"id": _dm(person), "type": 1, "recipients": [{"id": person}]}


@app.get("/discord/channels/{channel}/messages")
async def d_read(channel: str, request: Request, after: str = "", limit: int = 50):
    if not _bot_ok(request):
        return _no(401, "401: Unauthorized")
    if channel not in MESSAGES:
        return _no(404, "Unknown Channel", 10003)
    got = MESSAGES[channel]
    if after:
        got = [m for m in got if int(m["id"]) > int(after)]
        got = got[:limit]
    else:
        got = got[-limit:]
    return list(reversed(got))                         # newest first, as Discord gives them


@app.post("/discord/channels/{channel}/messages")
async def d_write(channel: str, request: Request):
    if not _bot_ok(request):
        return _no(401, "401: Unauthorized")
    if channel not in MESSAGES:
        return _no(404, "Unknown Channel", 10003)
    person = DM_OF[channel]
    if person.endswith("0"):
        return _no(403, "Cannot send messages to this user", 50007)
    body = await request.json()
    text = str(body.get("content") or "")
    if len(text) > 2000:
        return _no(400, "Invalid Form Body", 50035)
    m = {"id": str(next(_ids)), "type": 0, "content": text, "author": DISCORD_BOT, "channel_id": channel}
    MESSAGES[channel].append(m)
    SENT.append({"app": "discord", "to": person, "text": text})
    return m


@app.post("/discord/channels/{channel}/typing")
async def d_typing(channel: str):
    return Response(status_code=204)


@app.post("/_discord/say")
async def d_say(request: Request):
    body = await request.json()
    person = str(body["from"])
    ch = _dm(person)
    m = {"id": str(next(_ids)), "type": 0, "content": str(body.get("text") or ""), "channel_id": ch,
         "author": {"id": person, "username": str(body.get("name") or "someone"), "bot": False},
         "attachments": []}
    MESSAGES[ch].append(m)
    return {"ok": True, "channel": ch, "id": m["id"]}


# --- Signal ----------------------------------------------------------------------------------

@app.get("/signal/v1/about")
async def s_about():
    return {"versions": ["v1", "v2"], "build": 2, "mode": "native", "version": "0.90"}


@app.get("/signal/v1/accounts")
async def s_accounts():
    return SIG_ACCOUNTS


@app.post("/signal/v1/register/{number}")
async def s_register(number: str, request: Request):
    body = await request.json() if (await request.body()) else {}
    if number.endswith("9") and not body.get("captcha"):
        return JSONResponse({"error": "Captcha required for verification, use --captcha CAPTCHA"},
                            status_code=400)
    SIG_PENDING[number] = SIGNAL_CODE
    return Response(status_code=201)


@app.post("/signal/v1/register/{number}/verify/{code}")
async def s_verify(number: str, code: str):
    if SIG_PENDING.get(number) != code:
        return JSONResponse({"error": "Verify error: StatusCode: 403"}, status_code=400)
    SIG_PENDING.pop(number, None)
    if number not in SIG_ACCOUNTS:
        SIG_ACCOUNTS.append(number)
    return Response(status_code=201)


@app.get("/signal/v1/receive/{number}")
async def s_receive(number: str):
    if number not in SIG_ACCOUNTS:
        return JSONResponse({"error": "User " + number + " is not registered."}, status_code=400)
    got, SIG_QUEUE[number] = SIG_QUEUE.get(number, []), []
    return got


@app.post("/signal/v2/send")
async def s_send(request: Request):
    body = await request.json()
    if str(body.get("number")) not in SIG_ACCOUNTS:
        return JSONResponse({"error": "User is not registered."}, status_code=400)
    for to in body.get("recipients") or []:
        SENT.append({"app": "signal", "to": str(to), "text": str(body.get("message") or "")})
    return JSONResponse({"timestamp": str(int(time.time() * 1000))}, status_code=201)


@app.put("/signal/v1/typing-indicator/{number}")
async def s_typing(number: str):
    return Response(status_code=204)


@app.post("/_signal/say")
async def s_say(request: Request):
    body = await request.json()
    stamp = int(time.time() * 1000)
    data = {"timestamp": stamp, "message": str(body.get("text") or "")}
    if body.get("group"):
        data["groupInfo"] = {"groupId": "g1"}
    env = {"envelope": {"source": body["from"], "sourceNumber": body["from"], "sourceName": body.get("name") or "",
                        "timestamp": stamp, "dataMessage": data}, "account": body["to"]}
    SIG_QUEUE.setdefault(str(body["to"]), []).append(env)
    return {"ok": True}


# --- WhatsApp --------------------------------------------------------------------------------

def _wa_ok(request: Request) -> bool:
    return request.headers.get("authorization", "") == "Bearer " + WA_TOKEN


@app.get("/graph/{phone_id}")
async def w_number(phone_id: str, request: Request):
    if not _wa_ok(request):
        return JSONResponse({"error": {"message": "Invalid OAuth access token.", "code": 190}}, status_code=401)
    if phone_id != WA_PHONE_ID:
        return JSONResponse({"error": {"message": "Unsupported get request.", "code": 100}}, status_code=400)
    return {"display_phone_number": WA_NUMBER, "verified_name": "Rouh Test", "id": WA_PHONE_ID}


@app.post("/graph/{phone_id}/messages")
async def w_send(phone_id: str, request: Request):
    if not _wa_ok(request) or phone_id != WA_PHONE_ID:
        return JSONResponse({"error": {"message": "Invalid OAuth access token.", "code": 190}}, status_code=401)
    body = await request.json()
    if body.get("status") == "read":
        return {"success": True}
    text = str((body.get("text") or {}).get("body") or "")
    SENT.append({"app": "whatsapp", "to": "+" + str(body.get("to") or ""), "text": text})
    return {"messaging_product": "whatsapp", "contacts": [{"wa_id": body.get("to")}],
            "messages": [{"id": f"wamid.{next(_ids)}"}]}


@app.post("/_whatsapp/say")
async def w_say(request: Request):
    body = await request.json()
    sender = str(body["from"]).lstrip("+")
    payload = {"object": "whatsapp_business_account", "entry": [{"id": "WABA1", "changes": [{"field": "messages", "value": {
        "messaging_product": "whatsapp",
        "metadata": {"display_phone_number": WA_NUMBER, "phone_number_id": WA_PHONE_ID},
        "contacts": [{"profile": {"name": body.get("name") or ""}, "wa_id": sender}],
        "messages": [{"from": sender, "id": f"wamid.in.{next(_ids)}", "timestamp": str(int(time.time())),
                      "type": "text", "text": {"body": str(body.get("text") or "")}}]}}]}]}
    raw = json.dumps(payload).encode()
    secret = str(body.get("secret") or WA_APP_SECRET)
    sig = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(str(body["rouh"]).rstrip("/") + "/hooks/whatsapp", content=raw,
                              headers={"Content-Type": "application/json", "X-Hub-Signature-256": sig})
    return {"status": r.status_code}


@app.post("/_whatsapp/verify")
async def w_verify(request: Request):
    body = await request.json()
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(str(body["rouh"]).rstrip("/") + "/hooks/whatsapp",
                             params={"hub.mode": "subscribe", "hub.verify_token": body.get("token") or "",
                                     "hub.challenge": "challenge-1158"})
    return {"status": r.status_code, "text": r.text}


@app.get("/_sent")
async def sent():
    return SENT


def main(argv=None) -> None:
    import uvicorn

    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=8098)
    a = p.parse_args(argv)
    uvicorn.run(app, host="127.0.0.1", port=a.port, log_level="warning")


if __name__ == "__main__":
    main()
