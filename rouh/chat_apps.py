"""Discord, Signal and WhatsApp: more ways to talk with Rouh, beside Telegram and Slack.

Petar, 25 November 2026 (task 98, step 98-25, gap G24): "g24 do those". Each works like Telegram does:

- **The owner's own messages are turns in General**, as if typed into the box: written down under their
  name, drawn on every screen standing in General, answered with the same tools, memory and rules, and
  the answer sent back where they wrote, as plain text (`Hub._owner`, which is `telegram_chat`'s turn
  made app-agnostic: `telegram_chat.Heard` collects what the turn said and `telegram_chat.reply_for`
  makes it plain). The turn is marked as from the phone (`telegram_chat.FROM_PHONE`), so it is a
  person's turn, not unattended, its answer is not spoken, and the rule for a message from a phone
  applies; `telegram_chat.prompt_now` says which app it came on.
- **Anybody else's message is dropped** - written in the log as which account or number it came from,
  never what it said, never answered, never stored, never put in front of a model - **unless they are a
  trusted contact**: the owner links a trusted contact's Discord id or phone number on the app's page
  (`link`), the way they tick a contact's exact email addresses, and the app vouches for who sent it
  (Discord for its user id, Signal and Meta for the number). Then each message is a case of that contact,
  held to exactly what they may do by email (`rouh/mail_cases.py`), opened in a conversation of its own,
  never General, and its answer goes back on the same app through the one outbox
  (`mail_outbox._chat_app`, which alone calls `send_to_contact`).
- **Keys set on the page, sealed, never in chat**: each app is a service on Anatomy, Connections, Keys
  (`rouh/service_keys.py`), checked with the app before anything is kept and used at once, and has its own
  page in Connections (`chatappspage.js`, `rouh/web/chat_apps.py`).

The apps' own sides: `rouh/discord_chat.py` (a bot, read over REST), `rouh/signal_chat.py` (a number of
Rouh's own, through signal-cli-rest-api), `rouh/whatsapp_chat.py` (Meta's WhatsApp Business Cloud API, its
webhook at `/hooks/whatsapp`). Each does nothing until it is set up, which is every test world unless one
points it at `rouh/testing/fake_chat_apps.py`.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import re
import time
from dataclasses import dataclass
from email.utils import formatdate

log = logging.getLogger("rouh.chat_apps")

APPS = ("discord", "signal", "whatsapp")
NAMES = {"discord": "Discord", "signal": "Signal", "whatsapp": "WhatsApp"}
#: What the person is in each app: an id or a number.
IDENT = {"discord": "Discord user id", "signal": "Signal number", "whatsapp": "WhatsApp number"}
#: Where each conversation got to, in `app_state`: "chat_app:<app>:<where>".
STATE = "chat_app:"
IDLE_SECONDS = 30.0
BACKOFF = (2.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0)
FREE_WAIT = 300.0
TYPING_EVERY = 8.0

NO_OWNER = ("This Rouh has no account for you to speak as, so I cannot answer here. Sign in to Rouh "
            "on the screen.")
NOT_READ = "I can read what you type here, and not files or voice messages yet. Type it, or say it on the screen."


def clean_number(text) -> str:
    """A phone number as +digits, 8 to 15 of them; or "" when it is not one."""
    raw = str(text or "").strip()
    digits = re.sub(r"[\s().\-]", "", raw)
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if not re.fullmatch(r"\+[1-9]\d{7,14}", digits):
        return ""
    return digits


def clean_ident(app: str, text) -> str:
    if app == "discord":
        got = re.sub(r"\s+", "", str(text or ""))
        return got if re.fullmatch(r"\d{15,22}", got) else ""
    return clean_number(text)


def sender_of(app: str, ident: str) -> str:
    """How a case names a sender who wrote on one of these apps (`trusted.Trusted.recognises`)."""
    return f"{app}:{ident}"


def app_of(sender: str) -> str:
    head = str(sender or "").split(":", 1)[0]
    return head if head in APPS else ""


@dataclass
class Incoming:
    """One message from one of the apps, as the app vouched for it."""

    app: str
    ident: str          # who sent it: a Discord user id, or a number as +digits
    name: str
    text: str
    message_id: str
    at: float
    files: int = 0
    where: str = ""     # where the answer goes: the Discord DM, or the number


# --- state ----------------------------------------------------------------------------------

def state(key: str) -> str:
    from .telegram_chat import _state

    return _state(key)


def set_state(key: str, value: str | None) -> None:
    from .telegram_chat import _set_state

    _set_state(key, value)


_STATUS: dict[str, dict] = {app: {"listening": False, "heard": 0.0, "answered": 0.0, "trouble": ""}
                            for app in APPS}


def status(app: str, **kw) -> None:
    _STATUS.setdefault(app, {}).update(kw)


def owner_ident(app: str) -> str:
    """The owner's own id or number on this app, as typed on its page."""
    from . import discord_chat, service_keys, signal_chat, whatsapp_chat

    name = {"discord": discord_chat.OWNER_NAME, "signal": signal_chat.OWNER_NAME,
            "whatsapp": whatsapp_chat.OWNER_NAME}[app]
    return clean_ident(app, service_keys.value(name))


def configured(app: str) -> bool:
    from . import service_keys

    svc = service_keys.BY_ID.get(app)
    return bool(svc) and all(service_keys.value(f.name) for f in svc.fields if f.required)


# --- trusted contacts' accounts -------------------------------------------------------------

def _owner():
    from . import telegram
    from .tenancy import Tenancy

    return telegram.phone_owner(Tenancy())


def linked_senders(user_id: str, org_id: str, contact_id) -> list[str]:
    """The accounts on these apps the owner linked to one contact, as case senders."""
    from .models import ChatAppLink

    try:
        rows = ChatAppLink.objects.filter(user_id=str(user_id), org_id=str(org_id), contact_id=contact_id)
        return sorted(sender_of(r.app, r.ident) for r in rows)
    except Exception:  # noqa: BLE001 - not migrated yet: nobody linked
        log.debug("the chat app links could not be read", exc_info=True)
        return []


def linked_idents(app: str) -> list[str]:
    """Every account on this app the owner linked to a trusted contact: what Discord reads besides theirs."""
    from .models import ChatAppLink

    who = _owner()
    if who is None:
        return []
    return list(ChatAppLink.objects.filter(user_id=str(who.user_id), org_id=str(who.org_id), app=app)
                .values_list("ident", flat=True))


def contact_of(user_id: str, org_id: str, app: str, ident: str):
    from .models import ChatAppLink

    row = ChatAppLink.objects.filter(user_id=str(user_id), org_id=str(org_id), app=app, ident=ident).first()
    return row.contact_id if row is not None else None


def links(user_id: str, org_id: str, app: str) -> list[dict]:
    from .models import ChatAppLink, TrustedContact

    names = dict(TrustedContact.objects.filter(user_id=str(user_id), org_id=str(org_id))
                 .values_list("id", "name"))
    return [{"contact_id": r.contact_id, "name": names.get(r.contact_id, ""), "ident": r.ident,
             "since": r.made_at}
            for r in ChatAppLink.objects.filter(user_id=str(user_id), org_id=str(org_id), app=app)
            .order_by("made_at")]


class Refused(ValueError):
    """Not linked, with why in words."""


def link(user_id: str, org_id: str, app: str, contact_id, ident: str) -> dict:
    """The owner's word that this account on this app is this trusted contact's. One per contact per app."""
    from . import telegram_guests
    from .models import ChatAppLink, TrustedContact

    if app not in APPS:
        raise Refused("There is no such app here.")
    ident = clean_ident(app, ident)
    if not ident:
        raise Refused("That is not a Discord user id: a long number, from Copy User ID." if app == "discord"
                      else "That is not a phone number. Give it with its country code, such as +44 7700 900123.")
    try:
        contact = TrustedContact.objects.get(user_id=str(user_id), org_id=str(org_id), id=int(contact_id))
    except (TrustedContact.DoesNotExist, TypeError, ValueError):
        raise Refused("There is no such trusted contact.") from None
    if ident == owner_ident(app):
        raise Refused(f"That is your own {IDENT[app]}.")
    other = ChatAppLink.objects.filter(user_id=str(user_id), org_id=str(org_id), app=app,
                                       ident=ident).exclude(contact_id=contact.id).first()
    if other is not None:
        raise Refused(f"That {IDENT[app]} is already linked to another trusted contact.")
    ChatAppLink.objects.update_or_create(user_id=str(user_id), org_id=str(org_id), app=app, contact_id=contact.id,
                                         defaults={"ident": ident, "made_at": time.time()})
    # Who they are recognised as changed: an approval asked before lapses (`telegram_guests._bump`).
    telegram_guests._bump(str(user_id), str(org_id), contact.id)
    log.info("%s: an account was linked to trusted contact %s by the owner", app, contact.id)
    return {"contact_id": contact.id, "name": contact.name, "ident": ident}


def unlink(user_id: str, org_id: str, app: str, contact_id) -> None:
    from . import telegram_guests
    from .models import ChatAppLink

    with contextlib.suppress(TypeError, ValueError):
        gone, _ = ChatAppLink.objects.filter(user_id=str(user_id), org_id=str(org_id), app=app,
                                             contact_id=int(contact_id)).delete()
        if gone:
            telegram_guests._bump(str(user_id), str(org_id), int(contact_id))


# --- what the page shows --------------------------------------------------------------------

def page(who, app: str) -> dict:
    """Everything an app's own page shows, besides its keys: whether it is read, and the contacts linked."""
    from . import clock, service_keys
    from .config import config
    from .models import TrustedContact

    st = _STATUS.get(app) or {}
    keys = next((s for s in service_keys.public(who)["services"] if s["id"] == app), None)
    out = {"app": app, "name": NAMES[app], "ident": IDENT[app], "keys": keys,
           "admin": bool(getattr(who, "is_admin", False)), "set": configured(app),
           "listening": bool(st.get("listening")), "trouble": str(st.get("trouble") or ""),
           "heard": clock.moment(st["heard"]).strftime("%-d %b, %H:%M") if st.get("heard") else "",
           "answered": clock.moment(st["answered"]).strftime("%-d %b, %H:%M") if st.get("answered") else "",
           "links": links(who.user_id, who.org_id, app),
           "contacts": [{"id": i, "name": n} for i, n in TrustedContact.objects.filter(
               user_id=str(who.user_id), org_id=str(who.org_id)).order_by("name").values_list("id", "name")]}
    if app == "whatsapp":
        from . import whatsapp_chat

        public = (config.public_url or "").rstrip("/")
        out["hook"] = (public + whatsapp_chat.ROUTE) if public else ""
        out["verify"] = service_keys.value(whatsapp_chat.VERIFY_NAME) if out["admin"] else ""
    return out


# --- sending to a contact, for the one outbox only ------------------------------------------

async def send_to_contact(app: str, ident: str, text: str) -> str:
    """Text to a trusted contact on one of the apps. Only `mail_outbox` calls this (`mail_replay`'s guard):
    the id of what went."""
    from . import discord_chat, signal_chat, whatsapp_chat

    mod = {"discord": discord_chat, "signal": signal_chat, "whatsapp": whatsapp_chat}.get(app)
    if mod is None:
        raise ValueError(f"no such app: {app}")
    return await mod.send_to_contact(ident, text)


# --- the hub --------------------------------------------------------------------------------

class Hub:
    """Every message from the three apps: the owner's a turn in General, a linked trusted contact's a
    case, anybody else's dropped.

    Handed Rouh's running pieces by runtime.py, as `telegram_chat.PhoneChat` is.
    """

    def __init__(self, *, public_url: str, general, start_turn, busy, mirror, owner,
                 card_link=None, desk=None) -> None:
        self.public_url = (public_url or "").rstrip("/")
        self.general = general
        self.start_turn = start_turn
        self.busy = busy
        self.mirror = mirror
        self.owner = owner
        self.card_link = card_link
        self.desk = desk or (lambda: None)
        self._lock = asyncio.Lock()

    async def take(self, incoming: Incoming, listener) -> None:
        app = incoming.app
        status(app, heard=time.time())
        mine = await asyncio.to_thread(owner_ident, app)
        if mine and incoming.ident == mine:
            # One at a time, in the order they came, each after the last is answered.
            async with self._lock:
                await self._owner(incoming, listener)
            return
        who = await asyncio.to_thread(self.owner)
        contact_id = None
        if who is not None:
            contact_id = await asyncio.to_thread(contact_of, who.user_id, who.org_id, app, incoming.ident)
        if contact_id is not None:
            await self._contact(who, contact_id, incoming)
            return
        # Who it was, so a person setting it up can find it in the log; never what it said.
        log.warning("%s: a message from %s %s was ignored: it is not the owner's and not linked to any "
                    "trusted contact", app, IDENT[app], incoming.ident)

    # --- the owner ---------------------------------------------------------------------

    async def _owner(self, incoming: Incoming, listener) -> None:
        from . import answers_now

        await answers_now.until_free()
        who = await asyncio.to_thread(self.owner)
        if who is None:
            await listener.say(incoming, NO_OWNER)
            return
        if not incoming.text:
            await listener.say(incoming, NOT_READ)
            return
        typing = asyncio.get_running_loop().create_task(self._keep_typing(listener, incoming))
        try:
            reply = await self.ask(who, incoming)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - said, never silent
            log.exception("%s: a message could not be answered", incoming.app)
            reply = ("Something went wrong on my side while answering that, so there is no answer to it. "
                     "Ask me again, here or on the screen.")
        finally:
            typing.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await typing
        await listener.say(incoming, reply)
        status(incoming.app, answered=time.time())

    async def _keep_typing(self, listener, incoming: Incoming) -> None:
        while True:
            with contextlib.suppress(Exception):
                await listener.typing(incoming)
            await asyncio.sleep(TYPING_EVERY)

    async def ask(self, who, incoming: Incoming) -> str:
        """The owner's words as a finished turn in General, and the answer as plain text."""
        from . import events, thoughts
        from . import telegram_chat as tc
        from .tenancy import SPEAKER

        text = incoming.text
        general = await asyncio.to_thread(self.general)
        waited = 0.0
        while self.busy(general) and waited < FREE_WAIT:
            await asyncio.sleep(1.0)
            waited += 1.0
        with contextlib.suppress(Exception):
            await self.mirror(general, text, [])
        events.emit("chat.message_sent", who=who, actor="person", source=incoming.app, chat_id=general,
                    object_type="chat", object_id=general, count=len(text),
                    props={"files": incoming.files, "voice": False, "messages_n": 1})
        heard = tc.Heard()
        await thoughts.keep_prefixed(who, text, general, source="telegram")
        speaker_was = SPEAKER.set(who)
        phone_was = tc.FROM_PHONE.set({"replying_to": "", "recent": [], "elsewhere": [],
                                       "app": NAMES[incoming.app]})
        how_was = thoughts.HOW.set("telegram")
        try:
            turn = await self.start_turn(general, text, heard)
        finally:
            thoughts.HOW.reset(how_was)
            tc.FROM_PHONE.reset(phone_was)
            SPEAKER.reset(speaker_was)
        task = getattr(turn, "task", None)
        if task is not None:
            await asyncio.wait({task})
        return tc.reply_for(heard, answered=bool(getattr(turn, "answered", False)),
                            pictures=len(getattr(turn, "shown", []) or []), public_url=self.public_url,
                            chat=general, card_link=(lambda spec: self.card_link(spec, general))
                            if self.card_link is not None else None, place="General")

    # --- a trusted contact ---------------------------------------------------------------

    async def _contact(self, who, contact_id, incoming: Incoming) -> None:
        app, name = incoming.app, NAMES[incoming.app]
        desk = self.desk()
        if desk is None:
            log.warning("%s: a message from linked %s %s was not taken: there is no case desk on this "
                        "server (no Google)", app, IDENT[app], incoming.ident)
            return
        if not incoming.text:
            log.info("%s: a message with no words from linked %s %s was passed over", app, IDENT[app],
                     incoming.ident)
            return
        contact = await asyncio.to_thread(desk.trust.get, who.user_id, who.org_id, contact_id)
        if contact is None:
            return
        thread = f"{app}:{incoming.ident}"
        email = {"id": f"{thread}:{incoming.message_id}", "thread_id": thread,
                 "from": f"{contact.name} (on {name})", "to": f"Rouh, on {name}", "cc": "",
                 "subject": f"{name} message", "body": incoming.text,
                 "date": formatdate(incoming.at, localtime=True), "attachments": [],
                 "channel": app, "app_id": incoming.ident,
                 "app_account": f"{incoming.name} ({incoming.ident})" if incoming.name else incoming.ident}
        said = (f"{name} vouches it came from {IDENT[app]} {incoming.ident}, which the owner linked to "
                f"{contact.name}")
        open_chat = getattr(desk.alerts, "open_chat", None)
        chat = ""
        if open_chat is not None:
            from .telegram_guests import chat_of_thread

            was = await asyncio.to_thread(chat_of_thread, who.user_id, who.org_id, thread)
            chat = await open_chat(was, f"💬 {contact.name}: {' '.join(incoming.text.split())[:50]}")
        await desk.take(who, email, contact=contact, chat=chat, identity_ok=True, identity_said=said,
                        sender=sender_of(app, incoming.ident), sender_name=contact.name, soon=True)
        log.info("%s: a message from linked %s %s is a case of trusted contact %s", app, IDENT[app],
                 incoming.ident, contact.id)
