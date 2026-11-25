"""WhatsApp: the owner writing to Rouh's WhatsApp Business number, and Rouh answering there.

Petar, 25 November 2026 (task 98, gap G24): only the official route, Meta's WhatsApp Business Cloud API.
It needs a Meta business account, a phone number of Rouh's own added to it, and Meta charges per
conversation. No unofficial library: they break WhatsApp's rules and get numbers banned.
`rouh/chat_apps.py` has what Discord, Signal and WhatsApp share; this is WhatsApp's own side.

**What the owner sets, on Anatomy, Connections, WhatsApp:** the app's access token (a System User's
permanent token, with whatsapp_business_messaging), the phone number id Meta shows for Rouh's number, the
app's secret (App settings, Basic), their own WhatsApp number, and a verify token, which Rouh makes when
left empty. Rouh checks the token and the number id with Meta before keeping anything (`check`).

**Receiving is Meta calling Rouh.** The Cloud API has no way to ask for messages: Meta posts each one to
a webhook. The page shows the address to give Meta (`ROUTE`, under Rouh's public address) and the verify
token; Meta checks the address once with a GET carrying that token (`verify_hook`). Every POST is checked
against the app secret before a byte of it is read (`X-Hub-Signature-256`, an HMAC of the raw body), so
the address being open to everybody lets nobody in. A message Meta sends twice has the same id and is
taken once (`app_state`).

**Who may talk.** Meta vouches for the number a message came from. The owner's own number is the owner;
a number the owner linked to a trusted contact is that contact's; anybody else is written in the log by
number, never by what they said, and dropped.

**Answering.** Free-form text may be sent only within 24 hours of the person's last message to Rouh's
number: Meta's rule. So Rouh answers what it is sent and never writes first on WhatsApp; the check says
so instead of sending a hello, which Meta would refuse.
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import logging
import os
import re
import secrets
import time

import httpx

log = logging.getLogger("rouh.whatsapp_chat")

APP = "whatsapp"
TOKEN_NAME = "ROUH_WHATSAPP_TOKEN"
PHONE_ID_NAME = "ROUH_WHATSAPP_PHONE_ID"
SECRET_NAME = "ROUH_WHATSAPP_APP_SECRET"
VERIFY_NAME = "ROUH_WHATSAPP_VERIFY_TOKEN"
OWNER_NAME = "ROUH_WHATSAPP_OWNER"
NUMBER_NAME = "ROUH_WHATSAPP_NUMBER"
#: Where Meta posts each message, under Rouh's public address; open to everybody, checked by signature.
ROUTE = "/hooks/whatsapp"
LIMIT = 4096
#: The most of a webhook body read.
MOST_BODY = 1_000_000


class Refused(ValueError):
    """What was typed cannot work, in words the page shows."""


class NotSent(RuntimeError):
    """Meta would not take it, or could not be reached."""


def api() -> str:
    return (os.environ.get("ROUH_WHATSAPP_API") or "https://graph.facebook.com/v21.0").rstrip("/")


class WhatsApp:
    """The Cloud API, for one phone number id."""

    def __init__(self, token: str, phone_id: str, *, timeout: float = 15.0) -> None:
        self._token, self.phone_id, self.timeout = token, phone_id, timeout

    async def call(self, method: str, path: str, *, body: dict | None = None, params: dict | None = None):
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.request(method, api() + path, json=body, params=params,
                                         headers={"Authorization": "Bearer " + self._token})
        except httpx.HTTPError as exc:
            raise NotSent(f"Meta could not be reached ({type(exc).__name__}).") from None
        if r.status_code >= 400:
            try:
                said = (r.json() or {}).get("error") or {}
            except ValueError:
                said = {}
            err = NotSent(f"Meta answered {r.status_code}"
                          + (f" ({str(said.get('message') or '')[:200]})" if said.get("message") else "") + ".")
            err.status = r.status_code       # type: ignore[attr-defined]
            err.code = said.get("code")      # type: ignore[attr-defined]
            raise err
        return r.json() if r.content else None

    async def number(self) -> dict:
        return await self.call("GET", f"/{self.phone_id}",
                               params={"fields": "display_phone_number,verified_name"}) or {}

    async def read(self, message_id: str) -> None:
        try:
            await self.call("POST", f"/{self.phone_id}/messages",
                            body={"messaging_product": "whatsapp", "status": "read", "message_id": message_id})
        except NotSent:
            pass

    async def send_message(self, to: str, text: str) -> list[str]:
        from . import telegram as tg

        out = []
        for part in tg.split(text, LIMIT - 96):
            got = await self.call("POST", f"/{self.phone_id}/messages", body={
                "messaging_product": "whatsapp", "recipient_type": "individual", "to": to.lstrip("+"),
                "type": "text", "text": {"preview_url": False, "body": part}})
            out.append(str(((got or {}).get("messages") or [{}])[0].get("id") or ""))
        return out


async def check(v: dict) -> tuple[dict, str]:
    from . import chat_apps

    token = re.sub(r"\s+", "", str(v.get(TOKEN_NAME) or ""))
    phone_id = re.sub(r"\D", "", str(v.get(PHONE_ID_NAME) or ""))
    secret = re.sub(r"\s+", "", str(v.get(SECRET_NAME) or ""))
    owner = chat_apps.clean_number(v.get(OWNER_NAME))
    verify = re.sub(r"\s+", "", str(v.get(VERIFY_NAME) or "")) or secrets.token_urlsafe(18)
    if len(token) < 20:
        raise Refused("Paste the access token: a System User's permanent token in Meta Business Settings, "
                      "with whatsapp_business_messaging.")
    if not phone_id:
        raise Refused("Give the phone number id: the long number under Rouh's number in WhatsApp, API Setup.")
    if not re.fullmatch(r"[0-9a-fA-F]{16,64}", secret):
        raise Refused("The app secret is the 32 letters and digits in your app's Settings, Basic, App secret.")
    if not owner:
        raise Refused("Give your own WhatsApp number with its country code.")
    try:
        got = await WhatsApp(token, phone_id, timeout=10.0).number()
    except NotSent as exc:
        if getattr(exc, "status", 0) in (400, 401, 403, 404):
            raise Refused("Meta did not accept that token for that phone number id. Check both in WhatsApp, "
                          "API Setup.") from None
        raise Refused("Meta could not be reached from this Rouh. Try again in a moment.") from None
    shown = str(got.get("display_phone_number") or "")
    number = chat_apps.clean_number(shown)
    if number and number == owner:
        raise Refused("Rouh's number and yours must be two different numbers.")
    name = str(got.get("verified_name") or "")
    return ({**v, TOKEN_NAME: token, PHONE_ID_NAME: phone_id, SECRET_NAME: secret, OWNER_NAME: owner,
             VERIFY_NAME: verify, NUMBER_NAME: number},
            f"Meta knows the number {shown or phone_id}" + (f" as {name}" if name else "")
            + ". Write to it from WhatsApp once: Rouh answers, and never writes first")


def verify_hook(params) -> str | None:
    """Meta's check of the address: its challenge back when the token is ours, else None."""
    from . import service_keys

    want = service_keys.value(VERIFY_NAME)
    if (params.get("hub.mode") == "subscribe" and want
            and hmac.compare_digest(str(params.get("hub.verify_token") or ""), want)):
        return str(params.get("hub.challenge") or "")[:200]
    return None


def signed(body: bytes, header: str) -> bool:
    """Whether Meta signed this body with the app secret kept here."""
    from . import service_keys

    secret = service_keys.value(SECRET_NAME)
    if not secret or not header.startswith("sha256="):
        return False
    want = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header[len("sha256="):].strip().lower(), want)


class Listener:
    """Meta's posts, taken from the webhook and handed to the hub (`chat_apps.Hub`)."""

    def __init__(self, hub) -> None:
        self.hub = hub
        self._tasks: set[asyncio.Task] = set()

    def start(self) -> None:
        pass

    async def stop(self) -> None:
        for task in list(self._tasks):
            task.cancel()

    @staticmethod
    def client() -> WhatsApp | None:
        from . import service_keys

        token, phone_id = service_keys.value(TOKEN_NAME), service_keys.value(PHONE_ID_NAME)
        return WhatsApp(token, phone_id) if token and phone_id else None

    def posted(self, payload: dict) -> int:
        """One webhook post, already checked: each message in it taken in the background, so Meta is
        answered at once (it sends again what is not answered within seconds). How many were taken."""
        from . import chat_apps, service_keys

        taken = 0
        mine = str(service_keys.value(PHONE_ID_NAME) or "")
        for entry in payload.get("entry") or []:
            for change in (entry or {}).get("changes") or []:
                value = (change or {}).get("value") or {}
                if (change or {}).get("field") != "messages" or not isinstance(value, dict):
                    continue
                if mine and str((value.get("metadata") or {}).get("phone_number_id") or "") != mine:
                    log.warning("whatsapp: a post for another phone number id was ignored")
                    continue
                names = {str(c.get("wa_id") or ""): str((c.get("profile") or {}).get("name") or "")
                         for c in value.get("contacts") or [] if isinstance(c, dict)}
                for m in value.get("messages") or []:
                    if not isinstance(m, dict):
                        continue
                    source = chat_apps.clean_number("+" + str(m.get("from") or ""))
                    if not source:
                        continue
                    text = ""
                    if m.get("type") == "text":
                        text = str((m.get("text") or {}).get("body") or "").strip()
                    incoming = chat_apps.Incoming(
                        app=APP, ident=source, name=names.get(str(m.get("from") or ""), ""), text=text,
                        message_id=str(m.get("id") or ""), at=float(m.get("timestamp") or time.time()),
                        files=0 if m.get("type") == "text" else 1, where=source)
                    task = asyncio.get_running_loop().create_task(self._take(incoming))
                    self._tasks.add(task)
                    task.add_done_callback(self._tasks.discard)
                    taken += 1
        chat_apps.status(APP, listening=True, trouble="")
        return taken

    async def _take(self, incoming) -> None:
        from . import chat_apps

        key = f"{chat_apps.STATE}{APP}:seen"
        try:
            # Once: Meta sends a message again when Rouh was slow to say it got it.
            seen = (await asyncio.to_thread(chat_apps.state, key)).split()
            if incoming.message_id and incoming.message_id in seen:
                return
            await asyncio.to_thread(chat_apps.set_state, key, " ".join((seen + [incoming.message_id])[-200:]))
            await self.hub.take(incoming, self)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - one message must never stop the next
            log.exception("whatsapp: a message could not be taken")

    async def say(self, incoming, text: str) -> None:
        wa = self.client()
        if wa is not None:
            await wa.send_message(incoming.where, text)

    async def typing(self, incoming) -> None:
        wa = self.client()
        if wa is not None and incoming.message_id:
            await wa.read(incoming.message_id)


async def send_to_contact(ident: str, text: str) -> str:
    """For the one outbox only (`mail_outbox._chat_app`): text to a trusted contact's number, inside
    the 24 hours their own message opened."""
    wa = Listener.client()
    if wa is None:
        raise NotSent("WhatsApp is not set up on this Rouh.")
    ids = await wa.send_message(ident, text)
    return f"whatsapp:{ident}:{ids[-1] if ids else ''}"
