"""A device of the person's own that talks to Rouh with a key of its own: the robot first.

Petar, 25 November 2026 (task 122, step 122-08): the robot in the flat should talk to Rouh "using the
same voice protocol the browser uses" (sound up, the spoken answer down, a way to cut it off), signing in
"with its own key", and reaching "only its own Robot chat". So:

- **A key, made once, kept only as its sha256.** `add` makes it and hands it back once
  (`manage.py device add <name> --user <login>`); Rouh keeps only the hash, in `app_state`, under
  ``device:<hash>``, with whose it is (user and organisation), its name and the one chat it may reach. The
  device shows it on the WebSocket's upgrade as ``Authorization: Bearer <key>`` (`rouh/web/consumers.py`).
  `revoke` ends it at once: a revoked or unknown key is closed with 4401, as a browser with no sign-in is.
- **One chat, and nothing else.** The device's tab is put in its own chat whatever its ``hello`` names, and
  may send only the voice's messages (`ALLOWED_IN`); it is sent only what the voice needs (`ALLOWED_OUT`),
  never the lists of chats, tasks, runs, decisions or notices every browser tab is sent. The chat is a real
  chat of the person's, listed with the others, so they can scroll it and type into it.
- **What it hears is marked.** Every question a device sends starts with `HEARD`, so the Robot chat's own
  rules (`rouh/robotchat.py`) can tell a turn somebody in the room said from one the person typed on their own
  signed-in screen, and nothing said to a device opens a box.

What a device may do is exactly what the person may do by speaking in that chat: the key is the person's,
so it is kept like their passwords (on the robot, readable by its own user only, and a copy root-only
where the robot's other secrets are).

**A display only looks.** Petar, 26 November 2026, for the home projector: a Raspberry Pi behind it shows
the Robot chat full screen (`rouh/projector.py`). Its key is a device key of the kind `display`: it reads
that one chat's newest words and cards through `/api/projector/feed` and nothing else, and the WebSocket
refuses it, so a display can never speak, type or press anything in the person's name.

**Rouh never answers its own voice.** Petar, 26 November 2026, once the robot's voice came out of his Echo: the
robot's microphone heard Rouh's own answer from the Echo and sent it back in as his turn ("Great, so my voice is
coming out of the Echo now" came back as "Great. So my voice is coming out of the effort"). The robot's echo
canceller and its wake word guard are the first line; this is the last: `own_echo` says whether heard words are
mostly a repeat of what Rouh said aloud on that device in the last `ECHO_S` seconds, and such a turn is dropped
before it reaches the model (`Session.ask` in `rouh/runtime.py`).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import secrets
import time

log = logging.getLogger("rouh.devices")

#: Where a device's record is kept in `app_state`: this, then the sha256 of its key.
KEY_PREFIX = "device:"
#: The list of one person's devices, by name, for listing and revoking: this, then org and user.
LIST_PREFIX = "devices:"
#: What a device's key looks like when it is made, so one is told from a session cookie at a glance.
TOKEN_PREFIX = "rouhdev_"
#: A device's name: a short word the person can say.
NAME = re.compile(r"^[a-z][a-z0-9-]{0,31}$")
#: What a device is: a voice (the robot: talks in its chat) or a display (a projector: only reads it).
KINDS = ("voice", "display")
#: Seconds between two writes of when a key was last used: a display asks every two seconds.
USED_EVERY = 60

#: The chat a robot talks in: one per person, kept with them by its id.
ROBOT_CHAT_PREFIX = "robot-"
ROBOT_CHAT_TITLE = "Robot Chat"
#: What every question a device heard starts with (the same words as `robotchat.HEARD`).
HEARD = "[Heard by the robot]"

#: What a device may send: the voice and nothing else. Binary frames are its microphone.
ALLOWED_IN = frozenset({"hello", "ping", "set_mode", "speech_start", "speech_end", "interrupt",
                        "dictation", "get_state"})
#: What a device is sent: what the voice needs. Everything else a browser tab is sent is dropped.
ALLOWED_OUT = frozenset({"ready", "mode", "state", "turn_end", "stt", "assistant_delta", "assistant_done",
                         "assistant_retract", "audio_start", "audio_end", "dictation", "stopped", "error",
                         "pong"})
#: How long after Rouh said something on a device its own words coming back are taken for an echo.
ECHO_S = 45.0
#: Of the heard words, how many must be Rouh's own, and how long a run of them in Rouh's order.
ECHO_SHARE = 0.8
ECHO_RUN = 4


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", (text or "").lower().replace("'", ""))


def own_echo(heard: str, said: str, age: float) -> bool:
    """Whether `heard` is Rouh's own `said`, said aloud `age` seconds ago, coming back through a microphone.

    Both tests have to hold, so a person who answers with some of Rouh's words ("yes, it is coming out of
    the Echo") is still heard: most of the heard words are Rouh's (`ECHO_SHARE`), and at least `ECHO_RUN` of
    them in a row are in the order Rouh said them. Speech to text mishears a word or two of it ("the Echo"
    came back as "the effort"), which is why it is a share and a run, not an equal."""
    if not heard or not said or age < 0 or age > ECHO_S:
        return False
    h, s = _words(heard), _words(said)
    if len(h) < ECHO_RUN or not s:
        return False
    if sum(w in set(s) for w in h) / len(h) < ECHO_SHARE:
        return False
    grams = {tuple(s[i:i + ECHO_RUN]) for i in range(len(s) - ECHO_RUN + 1)}
    return any(tuple(h[i:i + ECHO_RUN]) in grams for i in range(len(h) - ECHO_RUN + 1))


#: Of `ready`, what a device is sent: no transcript, no conflicts, no browser, no orb.
READY_KEYS = ("type", "asked", "session_id", "voice", "voice_reply", "ears", "state", "now")


def digest(key: str) -> str:
    return hashlib.sha256(str(key or "").encode("utf-8")).hexdigest()


def robot_chat_id(user_id: str) -> str:
    return f"{ROBOT_CHAT_PREFIX}{user_id}"


def is_robot_chat(chat_id: str | None) -> bool:
    return bool(chat_id) and str(chat_id).startswith(ROBOT_CHAT_PREFIX)


# --- the records ---------------------------------------------------------------------------------


def _get(key: str):
    from .models.memory import AppState

    raw = AppState.objects.filter(key=key).values_list("value", flat=True).first()
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def _put(key: str, value) -> None:
    from .models.memory import AppState

    AppState.objects.update_or_create(key=key, defaults={"value": json.dumps(value)})


def _list_key(user_id: str, org_id: str) -> str:
    return f"{LIST_PREFIX}{org_id}:{user_id}"


def listed(user_id: str, org_id: str) -> list[dict]:
    """One person's devices, newest last, without their keys (only a short look at each hash)."""
    out = []
    for h in _get(_list_key(user_id, org_id)) or []:
        rec = _get(KEY_PREFIX + h)
        if isinstance(rec, dict) and rec.get("user_id") == user_id and rec.get("org_id") == org_id:
            out.append({k: rec.get(k) for k in ("name", "chat", "created_at", "last_used_at", "revoked_at")}
                       | {"key_starts": h[:8], "kind": rec.get("kind") or "voice"})
    return out


def add(user_id: str, org_id: str, name: str, kind: str = "voice") -> tuple[str, dict]:
    """A new key for a device of this person's: (the key, shown once and never kept, its record).
    A live device of the same name is revoked first: one name, one key."""
    name = str(name or "").strip().lower()
    if kind not in KINDS:
        raise ValueError(f"A device is one of: {', '.join(KINDS)}.")
    if not NAME.match(name):
        raise ValueError("A device's name is a short word: letters, digits and dashes, starting with a letter.")
    if not user_id or not org_id:
        raise ValueError("A device belongs to one person in one organisation.")
    revoke(user_id, org_id, name)
    key = TOKEN_PREFIX + secrets.token_urlsafe(32)
    h = digest(key)
    rec = {"user_id": str(user_id), "org_id": str(org_id), "name": name, "chat": robot_chat_id(str(user_id)),
           "kind": kind, "created_at": time.time(), "last_used_at": None, "revoked_at": None}
    _put(KEY_PREFIX + h, rec)
    hashes = [x for x in (_get(_list_key(user_id, org_id)) or []) if x != h] + [h]
    _put(_list_key(user_id, org_id), hashes)
    log.info("device %s added for user %s", name, user_id)
    return key, rec


def revoke(user_id: str, org_id: str, name: str) -> int:
    """End every live key of this person's device of that name. How many were ended."""
    ended = 0
    for h in _get(_list_key(user_id, org_id)) or []:
        rec = _get(KEY_PREFIX + h)
        if (isinstance(rec, dict) and rec.get("user_id") == user_id and rec.get("org_id") == org_id
                and rec.get("name") == name and not rec.get("revoked_at")):
            rec["revoked_at"] = time.time()
            _put(KEY_PREFIX + h, rec)
            ended += 1
    if ended:
        log.info("device %s revoked for user %s", name, user_id)
    return ended


def who(key: str) -> dict | None:
    """The live device this key is, or None. Never raises."""
    key = str(key or "").strip()
    if not key.startswith(TOKEN_PREFIX) or len(key) > 200:
        return None
    try:
        h = digest(key)
        rec = _get(KEY_PREFIX + h)
        if not isinstance(rec, dict) or rec.get("revoked_at") or not rec.get("user_id") or not rec.get("org_id"):
            return None
        # The hash was the lookup; compared again in constant time so nothing about a near miss is told.
        if not hmac.compare_digest(h, digest(key)):
            return None
        now = time.time()
        if now - float(rec.get("last_used_at") or 0) >= USED_EVERY:
            rec["last_used_at"] = now
            _put(KEY_PREFIX + h, rec)
        rec.setdefault("kind", "voice")
        return rec
    except Exception:  # noqa: BLE001 - an unreadable key is no key
        log.exception("a device key could not be read")
        return None


def bearer(headers) -> str:
    """The key in an ``Authorization: Bearer`` header of an ASGI scope's headers, or ""."""
    for k, v in headers or []:
        if bytes(k).lower() == b"authorization":
            got = bytes(v).decode("latin-1").strip()
            if got[:7].lower() == "bearer ":
                return got[7:].strip()
    return ""


# --- its chat ------------------------------------------------------------------------------------


def ensure_chat(rec: dict) -> str:
    """The device's own chat, made the first time it connects if the person never opened it."""
    from . import conversations

    cid = rec.get("chat") or robot_chat_id(rec["user_id"])
    conversations.ensure_chat(cid, title=ROBOT_CHAT_TITLE)
    return cid


def ready_for_device(message: dict) -> dict:
    return {k: message[k] for k in READY_KEYS if k in message}
