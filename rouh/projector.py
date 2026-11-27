"""The projector: the Robot chat full screen on a wall, shown by a small computer nobody touches.

Petar, 26 November 2026, in the Robot chat: he wants Rouh's screen on his home projector, which has
HDMI and no wireless, so a Raspberry Pi 3 sits behind it, plugged into its HDMI, and opens Rouh by itself
every time it is switched on. Asked for: "a projector or display mode in Rouh, meaning a full-screen view
with no clutter that follows the Robot chat and shows the cards Rouh puts on screen, readable from across
a room, and signed in safely for one device without Petar typing a password on the Pi".

So three things, and this module is the middle of all of them:

* **The wall, `/projector`** (`rouh/templates/rouh/projector.html`, `projector.js`). It rests on the orb,
  full screen, on black: the live picture of the work running now (`projector-orb.js`: the shapes, growth,
  fading and colours of the glass orb on Rouh's own page, ported to a 2D canvas, since a Raspberry Pi 3 has
  no WebGL 2), with each job's short name at its tip. A new card the Robot chat draws, or a new answer,
  comes up while the orb moves to the corner, stays about 30 seconds or as long as it takes to read, and
  goes, the orb coming back; a job waiting for the person shows its question in big words (Petar, 27 November 2026: "not seeing the desktop, seeing something
  maybe orb tenticles by default unless I need to see a specific thing on screen"). It asks `feed` every
  two seconds; nothing on it can be pressed.
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
    # The work running now, for the orb the wall rests on (`projector-orb.js`). Outside the version, which
    # says only whether the card or the words changed: the orb moves all the time and is drawn on its own.
    out["tree"] = work_tree()
    out["now"] = time.time()
    return out


#: The most nodes of the work tree the wall is sent: a Raspberry Pi 3 draws them thirty times a second.
TREE_NODES = 400


def _trimmed(node: dict, budget: list[int], depth: int = 0) -> dict | None:
    """One node of the work tree as the wall's orb needs it: what it is, its state and when, and a waiting
    job's question."""
    if budget[0] <= 0 or not isinstance(node, dict):
        return None
    budget[0] -= 1
    out = {k: node[k] for k in ("id", "kind", "state", "opened_at", "closed_at", "ms") if node.get(k) is not None}
    label = node.get("label")
    if isinstance(label, str) and label:
        out["label"] = label[:80]
    # A job waiting for the person: its question, which the wall shows in big words.
    asking = node.get("asking")
    if isinstance(asking, str) and asking and node.get("state") == "waiting":
        out["asking"] = asking[:400]
    kids = []
    if depth < 8:
        for kid in node.get("children") or []:
            got = _trimmed(kid, budget, depth + 1)
            if got is not None:
                kids.append(got)
    if kids:
        out["children"] = kids
    return out


def work_tree() -> dict | None:
    """Everything running now, as the orb on Rouh's own page draws it, trimmed for the wall; None if unreadable."""
    from . import runtime

    try:
        return _trimmed(runtime.tree_snapshot(), [TREE_NODES])
    except Exception:  # noqa: BLE001 - the orb going still must never blank the wall
        log.warning("the work tree could not be read for the projector", exc_info=True)
        return None


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


# --- pairing: a projector already running, given its key without a file -------------------------------
#
# Petar, 27 November 2026: his Pi was set up by hand with the desktop Raspberry Pi OS, not from the setup
# file, so it had no way to receive its key. Now the wall with no key asks for a pairing (`pair_start`):
# Rouh gives it a short code to show and a long secret ticket to keep. The person, signed in, types the
# code on the setup page (`pair_claim`); that makes the display key, ending any before it, and holds it for
# the ticket alone, which the wall collects once (`pair_take`) and keeps. The key never appears on any
# screen or in any message. Codes last ten minutes and are kept in memory only, as `_seen` is.

PAIR_FOR = 600
PAIR_MOST = 24
#: Letters and digits nobody misreads across a room: no 0/O, 1/I/L, 2/Z, 5/S, 8/B.
PAIR_LETTERS = "ACDEFGHJKMNPQRTUVWXY34679"
CLAIM_TRIES = 10

_pairs: dict[str, dict] = {}          # sha256 of the ticket -> {code, at, key}
_claims: dict[str, list[float]] = {}  # user id -> when their wrong codes were typed
_pairs_lock = threading.Lock()


def _ticket_id(ticket: str) -> str:
    return hashlib.sha256(str(ticket or "").encode()).hexdigest()


def _forget_old(now: float) -> None:
    for tid in [t for t, p in _pairs.items() if now - p["at"] > PAIR_FOR]:
        _pairs.pop(tid, None)


def code_of(text: str) -> str:
    """A code as typed, in its plain form: capitals, nothing but the code's own letters."""
    return "".join(c for c in str(text or "").upper() if c in PAIR_LETTERS)


def pair_start() -> dict:
    """A new pairing for a wall with no key: the code it shows and the ticket it keeps secret."""
    import secrets

    now = time.time()
    ticket = secrets.token_urlsafe(32)
    with _pairs_lock:
        _forget_old(now)
        while len(_pairs) >= PAIR_MOST:
            _pairs.pop(min(_pairs, key=lambda t: _pairs[t]["at"]))
        taken = {p["code"] for p in _pairs.values()}
        code = ""
        while not code or code in taken:
            code = "".join(secrets.choice(PAIR_LETTERS) for _ in range(6))
        _pairs[_ticket_id(ticket)] = {"code": code, "at": now, "key": None}
    return {"ticket": ticket, "code": code[:3] + "-" + code[3:], "expires_in": PAIR_FOR}


def pair_claim(user_id: str, org_id: str, typed: str) -> bool:
    """The person, signed in, typed the code their wall shows: make its key. False for a wrong or old code.

    Raises PermissionError after CLAIM_TRIES wrong codes in ten minutes, so a code cannot be guessed.
    """
    from . import devices

    code = code_of(typed)
    now = time.time()
    with _pairs_lock:
        _forget_old(now)
        tries = [t for t in _claims.get(str(user_id), []) if now - t < PAIR_FOR]
        _claims[str(user_id)] = tries
        if len(tries) >= CLAIM_TRIES:
            raise PermissionError("Too many wrong codes. Wait ten minutes, then try the code on the wall again.")
        tid = next((t for t, p in _pairs.items() if p["code"] == code and p["key"] is None), None)
        if tid is None or len(code) != 6:
            tries.append(now)
            return False
        _pairs[tid]["key"] = "making"
    try:
        key, _rec = devices.add(user_id, org_id, NAME, kind="display")
    except Exception:
        with _pairs_lock:
            if tid in _pairs:
                _pairs[tid]["key"] = None
        raise
    with _pairs_lock:
        if tid in _pairs:
            _pairs[tid]["key"] = key
    log.info("a projector was paired for user %s", user_id)
    return True


def pair_take(ticket: str) -> dict:
    """What the wall holding this ticket gets: its key once, then nothing; or that it must wait or start again."""
    tid = _ticket_id(ticket)
    with _pairs_lock:
        _forget_old(time.time())
        got = _pairs.get(tid)
        if got is None:
            return {"state": "gone"}
        key = got["key"]
        if key and key != "making":
            _pairs.pop(tid, None)
            return {"state": "paired", "key": key}
    return {"state": "waiting"}
