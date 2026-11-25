"""Discord: the owner writing to Rouh's own Discord bot, and Rouh answering there.

Petar, 25 November 2026 (task 98, gap G24): "g24 do those" - Discord, Signal and WhatsApp as ways to
talk with Rouh, beside Telegram and Slack. `rouh/chat_apps.py` has what the three share: who may talk,
the turn in General, trusted contacts and the page. This file is Discord's own side of it.

**The bot.** The owner makes an application in Discord's Developer Portal, gives it a bot, and puts
the bot in a server they are in (or installs it to their own account), so it may write to them. Its
token and the owner's own Discord user id are typed on Anatomy, Connections, Discord, checked here
(`check`: Discord is asked who the bot is, a direct message is opened with the owner and the bot says
hello in it), sealed like every key (`rouh/service_keys.py`) and used at once.

**Reading, with nothing open to the outside.** Discord's REST API, never its Gateway: the direct
message the bot has with the owner is read every `EVERY` seconds for messages after the last one taken
(`after`), and so is the one it has with each trusted contact the owner linked to a Discord account
on the page. Nobody else's messages are ever fetched: a stranger writing to the bot is never read at
all, which is the strongest way of dropping it. Where each conversation got to is kept in `app_state`
the moment a message is taken, so a restart never answers one twice; on the very first read of a
conversation only what comes after it is taken, so nothing written before Rouh read this bot is
answered. Discord gives a bot the words of a direct message without the privileged Message Content
intent, so nothing in the portal has to be switched on for this.

**Answering.** The owner's words are a turn in General, as if typed in the box, and the answer is
sent back to that direct message as plain text, split to Discord's 2,000 characters (`LIMIT`). A
trusted contact's message is a case, like their email (`chat_apps.Hub`).
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time

import httpx

log = logging.getLogger("rouh.discord_chat")

APP = "discord"
TOKEN_NAME = "ROUH_DISCORD_BOT_TOKEN"
OWNER_NAME = "ROUH_DISCORD_OWNER_ID"
BOT_NAME = "ROUH_DISCORD_BOT_NAME"
#: A Discord id: a snowflake, digits only.
SNOWFLAKE = re.compile(r"^\d{15,22}$")
#: A bot token as the portal gives it: three dot-separated parts.
TOKEN = re.compile(r"^[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{20,}$")
#: The most one Discord message holds.
LIMIT = 2000
#: How often the direct messages are read, in seconds.
EVERY = 3.0
HELLO = "Rouh is connected to this chat. Write here any time and Rouh answers."


class Refused(ValueError):
    """What was typed cannot be the bot, in words the page shows."""


class NotSent(RuntimeError):
    """Discord would not take it, or could not be reached."""


def api() -> str:
    return (os.environ.get("ROUH_DISCORD_API") or "https://discord.com/api/v10").rstrip("/")


class Discord:
    """Discord's REST API as one bot: the calls Rouh makes, and nothing else."""

    def __init__(self, token: str, *, timeout: float = 15.0) -> None:
        self._token = token
        self.timeout = timeout

    async def call(self, method: str, path: str, *, body: dict | None = None,
                   params: dict | None = None):
        headers = {"Authorization": "Bot " + self._token, "User-Agent": "Rouh (https://rouh.land, 1)"}
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    r = await client.request(method, api() + path, headers=headers, json=body,
                                             params=params)
            except httpx.HTTPError as exc:
                raise NotSent(f"Discord could not be reached ({type(exc).__name__}).") from None
            if r.status_code == 429 and attempt < 2:
                try:
                    wait = float((r.json() or {}).get("retry_after") or 1.0)
                except ValueError:
                    wait = 1.0
                await asyncio.sleep(min(wait, 10.0))
                continue
            if r.status_code >= 400:
                try:
                    said = r.json() or {}
                except ValueError:
                    said = {}
                err = NotSent(f"Discord answered {r.status_code}"
                              + (f" ({said.get('message')})" if said.get("message") else "") + ".")
                err.status = r.status_code          # type: ignore[attr-defined]
                err.code = said.get("code")         # type: ignore[attr-defined]
                raise err
            if r.status_code == 204 or not r.content:
                return None
            return r.json()
        raise NotSent("Discord kept asking Rouh to slow down.")

    async def me(self) -> dict:
        return await self.call("GET", "/users/@me") or {}

    async def dm(self, user_id: str) -> str:
        """The direct message the bot has with this person, opened if it is not."""
        got = await self.call("POST", "/users/@me/channels", body={"recipient_id": str(user_id)})
        return str((got or {}).get("id") or "")

    async def messages_after(self, channel: str, after: str | None) -> list[dict]:
        """The messages of a conversation after this one, oldest first; with no `after`, the newest."""
        params = {"limit": 50}
        if after:
            params["after"] = after
        else:
            params["limit"] = 1
        got = await self.call("GET", f"/channels/{channel}/messages", params=params)
        got = got if isinstance(got, list) else []
        return sorted(got, key=lambda m: int(m.get("id") or 0))

    async def typing(self, channel: str) -> None:
        try:
            await self.call("POST", f"/channels/{channel}/typing")
        except NotSent:
            pass

    async def send_message(self, channel: str, text: str) -> list[str]:
        """Text into a conversation, in parts of at most `LIMIT`: the ids of what was sent."""
        from . import telegram as tg

        ids = []
        for part in tg.split(text, LIMIT - 50):
            got = await self.call("POST", f"/channels/{channel}/messages",
                                  body={"content": part, "allowed_mentions": {"parse": []}})
            ids.append(str((got or {}).get("id") or ""))
        return ids


def _clean(text) -> str:
    return re.sub(r"\s+", "", str(text or ""))


async def check(v: dict) -> tuple[dict, str]:
    """Ask Discord whether this token is a bot that can write to the owner: the values, and what it said."""
    token, owner = _clean(v.get(TOKEN_NAME)), _clean(v.get(OWNER_NAME))
    if not TOKEN.match(token):
        raise Refused("That does not look like a bot token. In the Developer Portal open your application, "
                      "Bot, Reset Token, and copy all of it.")
    if not SNOWFLAKE.match(owner):
        raise Refused("Your Discord user id is a long number. In Discord, turn on Developer Mode (Settings, "
                      "Advanced), then right-click your own name and Copy User ID.")
    bot = Discord(token, timeout=10.0)
    try:
        me = await bot.me()
    except NotSent as exc:
        if getattr(exc, "status", 0) in (401, 403):
            raise Refused("Discord did not accept that token. Reset it in the Developer Portal, Bot, and "
                          "paste the new one.") from None
        raise Refused("Discord could not be reached from this Rouh. Try again in a moment.") from None
    if not me.get("bot"):
        raise Refused("That token is not a bot's. Use the token on your application's Bot page.")
    try:
        channel = await bot.dm(owner)
        await bot.send_message(channel, HELLO)
    except NotSent as exc:
        if getattr(exc, "code", None) == 50007 or getattr(exc, "status", 0) in (400, 403, 404):
            raise Refused("The bot could not write to you. Put the bot in a server you are in (the "
                          "Developer Portal, OAuth2, URL Generator, scope bot), or install it to your "
                          "account, and check your user id. Then press Save again.") from None
        raise Refused("Discord could not be reached from this Rouh. Try again in a moment.") from None
    name = str(me.get("username") or "")
    return {**v, TOKEN_NAME: token, OWNER_NAME: owner, BOT_NAME: name}, \
        (f"the bot {name} wrote to you" if name else "the bot wrote to you")


class Listener:
    """The loop that reads the bot's direct messages and hands each to the hub (`chat_apps.Hub`)."""

    def __init__(self, hub) -> None:
        self.hub = hub
        self.task: asyncio.Task | None = None
        self._channels: dict[str, str] = {}      # person's id -> the direct message with them
        self._token = ""

    def start(self) -> None:
        if self.task is None or self.task.done():
            self.task = asyncio.get_running_loop().create_task(self._loop())

    async def stop(self) -> None:
        task, self.task = self.task, None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    def bot(self) -> Discord | None:
        from . import service_keys

        token = service_keys.value(TOKEN_NAME)
        if not token:
            return None
        if token != self._token:
            self._token, self._channels = token, {}
        return Discord(token)

    async def _loop(self) -> None:
        from . import chat_apps

        misses = 0
        while True:
            try:
                bot = self.bot()
                owner = await asyncio.to_thread(chat_apps.owner_ident, APP)
                if bot is None or not owner:
                    chat_apps.status(APP, listening=False)
                    await asyncio.sleep(chat_apps.IDLE_SECONDS)
                    continue
                await self._round(bot, owner)
                chat_apps.status(APP, listening=True, trouble="")
                misses = 0
                await asyncio.sleep(EVERY)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - waited out, never the service's end
                misses += 1
                wait = chat_apps.BACKOFF[min(misses, len(chat_apps.BACKOFF)) - 1]
                said = str(exc) if isinstance(exc, NotSent) else type(exc).__name__
                chat_apps.status(APP, listening=False, trouble=said)
                if misses == 1 or misses % 10 == 0:
                    log.warning("discord: the messages could not be read (%s); trying again in %.0fs",
                                said, wait)
                await asyncio.sleep(wait)

    async def _channel(self, bot: Discord, person: str) -> str:
        if person not in self._channels:
            self._channels[person] = await bot.dm(person)
        return self._channels[person]

    async def _round(self, bot: Discord, owner: str) -> None:
        from . import chat_apps

        people = [owner] + [p for p in await asyncio.to_thread(chat_apps.linked_idents, APP) if p != owner]
        for person in people:
            channel = await self._channel(bot, person)
            if not channel:
                continue
            key = f"{chat_apps.STATE}{APP}:{channel}"
            after = await asyncio.to_thread(chat_apps.state, key)
            got = await bot.messages_after(channel, after or None)
            if not after:
                # The first read of this conversation: where it is now, and nothing before it answered.
                last = got[-1]["id"] if got else "0"
                await asyncio.to_thread(chat_apps.set_state, key, str(last))
                continue
            for m in got:
                await asyncio.to_thread(chat_apps.set_state, key, str(m.get("id")))
                author = m.get("author") or {}
                if author.get("bot") or str(author.get("id") or "") != person:
                    continue                                   # the bot's own words, or nobody's
                if m.get("type") not in (0, 19, None):
                    continue
                text = str(m.get("content") or "").strip()
                files = len(m.get("attachments") or [])
                incoming = chat_apps.Incoming(
                    app=APP, ident=person, name=str(author.get("global_name") or author.get("username") or ""),
                    text=text, message_id=str(m.get("id") or ""), at=time.time(), files=files,
                    where=channel)
                await self.hub.take(incoming, self)

    async def say(self, incoming, text: str) -> None:
        """The answer to the owner, in the direct message they wrote in."""
        bot = self.bot()
        if bot is not None and incoming.where:
            await bot.send_message(incoming.where, text)

    async def typing(self, incoming) -> None:
        bot = self.bot()
        if bot is not None and incoming.where:
            await bot.typing(incoming.where)


async def send_to_contact(ident: str, text: str) -> str:
    """For the one outbox only (`mail_outbox._chat_app`): text to a trusted contact's direct message
    with the bot. The id of the last part sent."""
    from . import service_keys

    token = service_keys.value(TOKEN_NAME)
    if not token:
        raise NotSent("Discord is not set up on this Rouh.")
    bot = Discord(token)
    channel = await bot.dm(ident)
    ids = await bot.send_message(channel, text)
    return f"discord:{channel}:{ids[-1] if ids else ''}"
