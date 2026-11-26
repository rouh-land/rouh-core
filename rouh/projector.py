"""The projector: the Robot chat full screen on a wall, shown by a small computer nobody touches.

Petar, 26 November 2026, in the Robot chat: he wants Rouh's screen on his home projector, which has
HDMI and no wireless, so a Raspberry Pi 3 sits behind it, plugged into its HDMI, and opens Rouh by itself
every time it is switched on. Asked for: "a projector or display mode in Rouh, meaning a full-screen view
with no clutter that follows the Robot chat and shows the cards Rouh puts on screen, readable from across
a room, and signed in safely for one device without Petar typing a password on the Pi".

So three things, and this module is the middle of all of them:

* **The wall, `/projector`** (`rouh/templates/rouh/projector.html`, `projector.js`). The newest card the
  Robot chat drew fills it, fitted and, when it is too long, moving slowly through; under it what was heard
  and Rouh's answer. It asks `feed` every two seconds; nothing on it can be pressed.
* **Its key.** The Pi signs in with a device key of the kind `display` (`rouh/devices.py`), made for that one
  Pi on the setup page and kept only as its hash. It reads this feed and nothing else, the WebSocket refuses
  it, and Turn off this projector ends it at once. The person's own signed-in browser reads the same feed
  with its cookie, which is how Preview it here works.
* **The setup file.** `setup_file` fills `deploy/projector/user-data.template`, a cloud-init file (the
  first-start settings Raspberry Pi OS reads from the SD card), with Rouh's address, the key and the
  installer (`deploy/projector/install.sh`). The Wi-Fi name and password are written into it by the setup
  page in the person's own browser and never reach Rouh (`projectorsetup.js`).

While a display has asked within `SHOWING_FOR` seconds, the Robot chat is told a projector is showing it
(`showing`, `rouh/robotchat.py`), so a card it draws there is seen rather than wasted.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import threading
import time
from pathlib import Path

log = logging.getLogger("rouh.projector")

#: The display key's name: one projector per person, so making a new setup file ends the old Pi's key.
NAME = "projector"
#: How many of the chat's newest rows the wall is sent, to find what was heard and what was answered.
ROWS = 12
#: Seconds after a display's last read that the Robot chat is still told a projector is showing it.
SHOWING_FOR = 120

_HERE = Path(__file__).resolve().parent.parent / "deploy" / "projector"
TEMPLATE = _HERE / "user-data.template"
INSTALLER = _HERE / "install.sh"

_seen: dict[str, float] = {}
_seen_lock = threading.Lock()


def saw(user_id: str) -> None:
    """A display of this person's has just asked for the wall."""
    with _seen_lock:
        _seen[str(user_id)] = time.time()


def showing(user_id: str) -> bool:
    """Whether a projector of this person's is showing their Robot chat right now."""
    with _seen_lock:
        at = _seen.get(str(user_id))
    return at is not None and time.time() - at < SHOWING_FOR


# --- the wall's feed -----------------------------------------------------------------------------------


def _text_of(row: dict) -> str:
    """The words of one transcript row as the page would draw them, plain."""
    for key in ("text", "content"):
        got = row.get(key)
        if isinstance(got, str):
            if key == "content" and got[:1] in "[{":
                try:
                    blocks = json.loads(got)
                except ValueError:
                    return got.strip()
                return _blocks_text(blocks)
            return got.strip()
    return ""


def _blocks_text(blocks) -> str:
    if isinstance(blocks, str):
        return blocks.strip()
    if isinstance(blocks, dict):
        blocks = [blocks]
    out = []
    for b in blocks or []:
        if isinstance(b, dict) and b.get("type") == "text" and isinstance(b.get("text"), str):
            out.append(b["text"])
    return "\n".join(out).strip()


def heard_and_said(rows: list[dict]) -> tuple[dict | None, dict | None]:
    """The newest thing the person said and Rouh's answer to it, from a chat's newest rows, oldest first.

    The answer is the newest of Rouh's rows after that question, and None while it is still to come.
    A note, a notice or a row with no words (a tool's line alone) is neither.
    """
    from . import robotchat

    heard = said = None
    for row in rows:
        if row.get("note") or row.get("notice"):
            continue
        text = _text_of(row)
        if not text:
            continue
        if row.get("role") == "user":
            spoken = text.startswith(robotchat.HEARD)
            if spoken:
                text = text[len(robotchat.HEARD):].strip()
            heard = {"id": row.get("id"), "text": text, "ts": row.get("ts"), "spoken": spoken}
            said = None
        elif row.get("role") == "assistant":
            said = {"id": row.get("id"), "text": text, "ts": row.get("ts")}
    return heard, said


def _picture_card(card: dict) -> dict:
    """A card as the wall needs it: what it shows, without where it is kept."""
    keep = ("card_id", "title", "description", "blocks", "at", "version", "versions")
    return {k: card.get(k) for k in keep if k in card}


def feed(user_id: str) -> dict:
    """What the wall shows for this person: their Robot chat's newest card, what was heard and said."""
    from . import artifacts, robotchat, runtime

    chat = f"{robotchat.PREFIX}{user_id}"
    memory = runtime.memory
    if memory.chat(chat) is None:
        rows: list[dict] = []
        last_id = None
    else:
        rows, _older = memory.transcript_page(chat, ROWS)
        last_id = memory.last_message_id(chat)
    heard, said = heard_and_said(rows)
    card = None
    if artifacts.enabled():
        try:
            got = artifacts.history(chat, memory.task_of(chat), None, 1)
            card = _picture_card(got[0]) if got else None
        except Exception:  # noqa: BLE001 - one card that cannot be read must not blank the wall
            log.warning("the newest card of %s could not be read", chat, exc_info=True)
    turn = runtime.Turns.of(chat)
    live = turn.picture() if turn is not None else None
    answering = bool(live)
    # The words of an answer still being written, so the wall shows them as they come.
    so_far = str(live.get("said") or "").strip() if live else ""
    out = {"chat": chat, "title": robotchat.CHAT_TITLE, "heard": heard, "said": said, "card": card,
           "answering": answering, "so_far": so_far, "last_id": last_id}
    out["version"] = hashlib.sha256(json.dumps(out, sort_keys=True, default=str).encode()).hexdigest()[:16]
    out["now"] = time.time()
    return out


# --- its key and its setup file -----------------------------------------------------------------------


def state(user_id: str, org_id: str) -> dict:
    """Whether this person has a projector, and when it last asked for the wall."""
    from . import devices

    live = [d for d in devices.listed(user_id, org_id)
            if d.get("kind") == "display" and d.get("name") == NAME and not d.get("revoked_at")]
    d = live[-1] if live else None
    return {"set_up": d is not None,
            "created_at": d.get("created_at") if d else None,
            "last_seen_at": d.get("last_used_at") if d else None,
            "showing": showing(user_id) if d else False}


def make(user_id: str, org_id: str, origin: str) -> str:
    """A new key for this person's projector (ending the one before) and the setup file that carries it.

    The file still has the Wi-Fi name, password, country and time zone to be filled in by the setup page,
    in the person's browser, so they never pass through Rouh.
    """
    from . import devices

    origin = str(origin or "").strip().rstrip("/")
    if not origin.startswith(("https://", "http://")):
        raise ValueError("Rouh's address starts with https://.")
    key, _rec = devices.add(user_id, org_id, NAME, kind="display")
    return setup_file(origin, key)


def setup_file(origin: str, key: str) -> str:
    def b64(text: str) -> str:
        return base64.b64encode(text.encode("utf-8")).decode("ascii")

    return (TEMPLATE.read_text(encoding="utf-8")
            .replace("{{URL_B64}}", b64(origin))
            .replace("{{KEY_B64}}", b64(key))
            .replace("{{INSTALL_B64}}", b64(INSTALLER.read_text(encoding="utf-8"))))


def turn_off(user_id: str, org_id: str) -> int:
    """End this person's projector's key: the wall says it is not set up within two seconds."""
    from . import devices

    with _seen_lock:
        _seen.pop(str(user_id), None)
    return devices.revoke(user_id, org_id, NAME)
