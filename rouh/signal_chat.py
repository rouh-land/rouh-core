"""Signal: the owner writing to Rouh's own Signal number, and Rouh answering there.

Petar, 25 November 2026 (task 98, gap G24). Signal has no bots: Rouh needs a phone number of its own,
registered with Signal, which the owner registers on Anatomy, Connections, Signal. `rouh/chat_apps.py`
has what Discord, Signal and WhatsApp share; this is Signal's own side.

**Where Signal is spoken.** Signal's own protocol is spoken by signal-cli, through its REST wrapper
`bbernhard/signal-cli-rest-api` (MODE=native or normal: its `receive` must answer over HTTP). The owner
runs that container beside Rouh and gives its address here; nothing of Signal is built into Rouh's own
images. Every call is to that address only.

**Registering a number.** On the page: Rouh's number, and if Signal asks for one, a captcha token from
signalcaptchas.org; "Send the code" asks Signal to text (or ring) that number (`register`), and the
six digits it sends are typed back (`verify`). The number must be one nobody uses Signal on already: a
spare SIM, or a landline with the voice code. Nothing about the registration is kept by Rouh: signal-cli
keeps the number's keys in its own volume.

**Who may talk.** Signal vouches for the number a message came from once it is decrypted. The owner's
own number, typed on the page, is the owner; a number the owner linked to a trusted contact is that
contact's; anybody else's message is dropped, written in the log as which number and never what it said.
Somebody who hides their number on Signal cannot be recognised, and is dropped too.

**Reading.** `GET /v1/receive/<number>` every `EVERY` seconds. signal-cli hands a message over once and
forgets it, so a message is written down as taken (`app_state`) before it is answered, and the newest
timestamp taken is kept, so a message handed over again after a restart is passed over.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time

import httpx

log = logging.getLogger("rouh.signal_chat")

APP = "signal"
ADDRESS_NAME = "ROUH_SIGNAL_API"
NUMBER_NAME = "ROUH_SIGNAL_NUMBER"
OWNER_NAME = "ROUH_SIGNAL_OWNER"
#: How often signal-cli is asked for new messages, in seconds.
EVERY = 3.0
#: Signal takes long messages; this keeps each part readable on a phone.
LIMIT = 4000
HELLO = "Rouh is connected to Signal. Write here any time and Rouh answers."


class Refused(ValueError):
    """What was typed cannot work, in words the page shows."""


class NotSent(RuntimeError):
    """signal-cli would not take it, or could not be reached."""


def clean_address(text) -> str:
    url = str(text or "").strip().rstrip("/")
    if not re.fullmatch(r"https?://[A-Za-z0-9.\-_:\[\]]+(/[A-Za-z0-9._\-/]*)?", url):
        return ""
    return url


class Signal:
    """signal-cli-rest-api at one address, for one registered number."""

    def __init__(self, address: str, number: str = "", *, timeout: float = 20.0) -> None:
        self.address = address.rstrip("/")
        self.number = number
        self.timeout = timeout

    async def call(self, method: str, path: str, *, body: dict | None = None, params: dict | None = None):
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                r = await client.request(method, self.address + path, json=body, params=params)
        except httpx.HTTPError as exc:
            raise NotSent(f"signal-cli could not be reached at its address ({type(exc).__name__}).") from None
        if r.status_code >= 400:
            try:
                said = str((r.json() or {}).get("error") or "")
            except ValueError:
                said = ""
            err = NotSent(f"signal-cli answered {r.status_code}" + (f": {said[:200]}" if said else "") + ".")
            err.status = r.status_code      # type: ignore[attr-defined]
            err.said = said                 # type: ignore[attr-defined]
            raise err
        if not r.content:
            return None
        try:
            return r.json()
        except ValueError:
            return None

    async def about(self) -> dict:
        return await self.call("GET", "/v1/about") or {}

    async def accounts(self) -> list[str]:
        got = await self.call("GET", "/v1/accounts")
        return [str(x) for x in got] if isinstance(got, list) else []

    async def register(self, *, captcha: str = "", voice: bool = False) -> None:
        body: dict = {"use_voice": bool(voice)}
        if captcha:
            body["captcha"] = captcha
        await self.call("POST", f"/v1/register/{self.number}", body=body)

    async def verify(self, code: str, pin: str = "") -> None:
        await self.call("POST", f"/v1/register/{self.number}/verify/{code}", body={"pin": pin} if pin else {})

    async def receive(self) -> list[dict]:
        got = await self.call("GET", f"/v1/receive/{self.number}", params={"timeout": 1})
        return got if isinstance(got, list) else []

    async def typing(self, to: str) -> None:
        try:
            await self.call("PUT", f"/v1/typing-indicator/{self.number}", body={"recipient": to})
        except NotSent:
            pass

    async def send_message(self, to: str, text: str) -> list[str]:
        from . import telegram as tg

        out = []
        for part in tg.split(text, LIMIT):
            got = await self.call("POST", "/v2/send", body={"message": part, "number": self.number,
                                                           "recipients": [to], "text_mode": "normal"})
            out.append(str((got or {}).get("timestamp") or ""))
        return out


async def check(v: dict) -> tuple[dict, str]:
    """Whether signal-cli answers at this address with this number registered, and can write to the owner."""
    from . import chat_apps

    address = clean_address(v.get(ADDRESS_NAME))
    number = chat_apps.clean_number(v.get(NUMBER_NAME))
    owner = chat_apps.clean_number(v.get(OWNER_NAME))
    if not address:
        raise Refused("Give signal-cli's address, such as http://signal-cli:8080.")
    if not number:
        raise Refused("Give Rouh's Signal number with its country code, such as +44 7700 900123.")
    if not owner:
        raise Refused("Give your own Signal number with its country code.")
    if owner == number:
        raise Refused("Rouh's number and yours must be two different numbers.")
    sig = Signal(address, number, timeout=10.0)
    try:
        about = await sig.about()
        accounts = await sig.accounts()
    except NotSent:
        raise Refused("signal-cli did not answer at that address. Check that its container is running and "
                      "that this Rouh can reach it.") from None
    if str(about.get("mode") or "").lower() == "json-rpc":
        raise Refused("signal-cli runs in json-rpc mode, which Rouh cannot read. Start it with MODE=native.")
    if number not in accounts:
        raise Refused("Rouh's number is not registered in signal-cli yet. Register it below first, then save.")
    try:
        await sig.send_message(owner, HELLO)
    except NotSent as exc:
        raise Refused(f"signal-cli could not write to your number ({exc}).") from None
    return {**v, ADDRESS_NAME: address, NUMBER_NAME: number, OWNER_NAME: owner}, \
        f"{number} wrote to {owner} on Signal"


def _registrar(address, number) -> Signal:
    from . import chat_apps

    address, number = clean_address(address), chat_apps.clean_number(number)
    if not address:
        raise Refused("Give signal-cli's address, such as http://signal-cli:8080.")
    if not number:
        raise Refused("Give the number with its country code, such as +44 7700 900123.")
    return Signal(address, number, timeout=20.0)


async def register(address, number, *, captcha: str = "", voice: bool = False) -> str:
    """Ask Signal to send a code to this number. What happened, in words."""
    sig = _registrar(address, number)
    captcha = str(captcha or "").strip()
    if captcha.startswith("signalcaptcha://"):
        captcha = captcha[len("signalcaptcha://"):]
    try:
        await sig.register(captcha=captcha, voice=voice)
    except NotSent as exc:
        said = str(getattr(exc, "said", "") or "").lower()
        if "captcha" in said:
            raise Refused("Signal asks for a captcha first. Open signalcaptchas.org/registration/generate.html, "
                          "solve it, copy the link 'Open Signal' gives, paste it in Captcha, and press Send the "
                          "code again.") from None
        raise Refused(f"Signal would not send a code ({exc}).") from None
    return (f"Signal is ringing {sig.number} with a code." if voice
            else f"Signal sent a code to {sig.number} by text message.")


async def verify(address, number, code, *, pin: str = "") -> str:
    sig = _registrar(address, number)
    code = re.sub(r"\D", "", str(code or ""))
    if len(code) != 6:
        raise Refused("The code is six digits.")
    try:
        await sig.verify(code, pin=str(pin or "").strip())
    except NotSent as exc:
        raise Refused(f"Signal did not take that code ({exc}).") from None
    return f"{sig.number} is registered with Signal. Now press Set up above and save it."


class Listener:
    """The loop that asks signal-cli for new messages and hands each to the hub (`chat_apps.Hub`)."""

    def __init__(self, hub) -> None:
        self.hub = hub
        self.task: asyncio.Task | None = None

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

    @staticmethod
    def client() -> Signal | None:
        from . import service_keys

        address, number = service_keys.value(ADDRESS_NAME), service_keys.value(NUMBER_NAME)
        return Signal(address, number) if address and number else None

    async def _loop(self) -> None:
        from . import chat_apps

        misses = 0
        while True:
            try:
                sig = self.client()
                owner = await asyncio.to_thread(chat_apps.owner_ident, APP)
                if sig is None or not owner:
                    chat_apps.status(APP, listening=False)
                    await asyncio.sleep(chat_apps.IDLE_SECONDS)
                    continue
                await self._round(sig)
                chat_apps.status(APP, listening=True, trouble="")
                misses = 0
                await asyncio.sleep(EVERY)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - waited out
                misses += 1
                wait = chat_apps.BACKOFF[min(misses, len(chat_apps.BACKOFF)) - 1]
                said = str(exc) if isinstance(exc, NotSent) else type(exc).__name__
                chat_apps.status(APP, listening=False, trouble=said)
                if misses == 1 or misses % 10 == 0:
                    log.warning("signal: the messages could not be read (%s); trying again in %.0fs", said, wait)
                await asyncio.sleep(wait)

    async def _round(self, sig: Signal) -> None:
        from . import chat_apps

        key = f"{chat_apps.STATE}{APP}:{sig.number}"
        try:
            newest = int(await asyncio.to_thread(chat_apps.state, key) or 0)
        except ValueError:
            newest = 0
        for item in await sig.receive():
            env = (item or {}).get("envelope") if isinstance(item, dict) else None
            if not isinstance(env, dict):
                continue
            data = env.get("dataMessage")
            if not isinstance(data, dict):
                continue                                    # a receipt, typing, a sync: nothing to answer
            stamp = int(env.get("timestamp") or data.get("timestamp") or 0)
            if stamp and stamp <= newest:
                continue                                    # handed over again: taken before
            newest = max(newest, stamp)
            await asyncio.to_thread(chat_apps.set_state, key, str(newest))
            source = chat_apps.clean_number(env.get("sourceNumber") or env.get("source") or "")
            if not source:
                log.warning("signal: a message from somebody who hides their number was ignored")
                continue
            if data.get("groupInfo"):
                log.warning("signal: a message in a group, from %s, was ignored: only direct messages "
                            "are read", source)
                continue
            text = str(data.get("message") or "").strip()
            incoming = chat_apps.Incoming(
                app=APP, ident=source, name=str(env.get("sourceName") or ""), text=text,
                message_id=str(stamp), at=(stamp / 1000.0) if stamp else time.time(),
                files=len(data.get("attachments") or []), where=source)
            await self.hub.take(incoming, self)

    async def say(self, incoming, text: str) -> None:
        sig = self.client()
        if sig is not None:
            await sig.send_message(incoming.where, text)

    async def typing(self, incoming) -> None:
        sig = self.client()
        if sig is not None:
            await sig.typing(incoming.where)


async def send_to_contact(ident: str, text: str) -> str:
    """For the one outbox only (`mail_outbox._chat_app`): text to a trusted contact's number."""
    sig = Listener.client()
    if sig is None:
        raise NotSent("Signal is not set up on this Rouh.")
    stamps = await sig.send_message(ident, text)
    return f"signal:{ident}:{stamps[-1] if stamps else ''}"
