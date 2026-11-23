"""Feedback: what a person tells Rouh's makers, sent to rouh.land (23 November 2026).

Petar, 23 November 2026: "Replace Gene therapy with Feedback ... Pressing send does NOT start any
gene therapy run and changes nothing in Rouh. It sends the feedback (text, attachments, who sent
it, which page/screen they were on, Rouh version, install) to a new feedback service on rouh.land.
After sending, the panel simply thanks the person for their feedback ... If rouh.land cannot be
reached, keep the feedback queued locally and retry on the beat, so nothing is lost." And: "the
feedback is only for the administrators. random users can't read other's feedback."

**Sent at once, kept until it is there.** Send writes the feedback into this Rouh's outbox
(`feedback_outbox`), nothing else here changes, and it goes to rouh.land there and then, before the
answer, for at most `SEND_NOW` seconds (Petar, 23 November 2026: "should be immediately sent to
rouh.land"), so All feedback says Received the moment it is. Only what could not go then stays
queued and is tried again on the beat (`send_due`), so a rouh.land that cannot be reached loses
nothing. The person is thanked either way.

**How it is sent.** To rouh.land's feedback service, beside the Gene Pool
(`<pool>/../feedback/`), signed with this Rouh's own key exactly as the Pool is spoken to
(`genepool.call`), the answers signed by rouh.land's registry key and checked against the one
pinned here. The text, the screen it was written on, who wrote it, the code it was written on, and
then each file, one request a file. A Rouh that is not a member of the Pool (not born or registered
on rouh.land) keeps its feedback queued until it is.

**Whose.** Each person reads their own, and nobody else's (`mine`): every query names the
organisation and the person. Their status is rouh.land's (received, being looked at, done), read
when they open All feedback. Reading everybody's is rouh.land's administrators' alone.

The switch `feedback_send` turns the sending off: feedback is still kept, and still thanked for.
"""
from __future__ import annotations

import logging
import os
import secrets
import threading
import time
from urllib.parse import quote

log = logging.getLogger("rouh.feedback")

SWITCH = "feedback_send"
KIND = "rouh-feedback"
MAX_BODY = 20_000
MAX_FILES = 20
MAX_FILE_BYTES = 20 * 1024 * 1024
#: How long a feedback waits before it is tried again, by how many tries it has had: a minute,
#: then five, then a quarter of an hour, then an hour for as long as it takes.
BACKOFF = (60, 300, 900, 3600)
#: How old a status may be before opening All feedback asks rouh.land again.
STATUS_FRESH = 60
#: How long Send waits for rouh.land before it thanks the person anyway and leaves it to the beat.
SEND_NOW = 8.0
STATUS_NAMES = {"": "Not sent yet", "received": "Received", "looking": "Being looked at", "done": "Done"}

_SENDING = threading.Lock()
_STATUS_READ: dict[tuple[str, str], float] = {}


class Refused(ValueError):
    """Something not done, with the reason in words."""


def _m():
    from . import models

    return models


def _now() -> float:
    return time.time()


def on(org: str) -> bool:
    from . import switches

    try:
        return switches.on(SWITCH, org)
    except Exception:  # noqa: BLE001 - a switch that cannot be read is on, as it starts
        return True


def _version() -> str:
    from . import genelog

    try:
        return genelog._head()[:40]
    except Exception:  # noqa: BLE001
        return ""


# --- kept ------------------------------------------------------------------------------------------


def add(who, *, body: str, page: str = "", files: list[dict] | None = None, email: str = "",
        created_at: float | None = None) -> dict:
    """One feedback, kept for sending. Raises Refused for nothing to send."""
    text = str(body or "").strip()[:MAX_BODY].replace("—", "-")
    files = [f for f in (files or []) if isinstance(f, dict)][:MAX_FILES]
    if not text and not files:
        raise Refused("Write something, or attach a file, first.")
    now = _now()
    row = _m().FeedbackOutbox.objects.create(
        id="fb_" + secrets.token_hex(8), org_id=str(who.org_id), user_id=str(who.user_id),
        author=str(getattr(who, "name", "") or "")[:200], email=str(email or "")[:200], body=text,
        page=str(page or "")[:500], version=_version(), created_at=created_at or now,
        files=[{"id": str(f.get("id") or ""), "session": str(f.get("session") or ""),
                "name": str(f.get("name") or "file")[:200], "media_type": str(f.get("media_type") or ""),
                "kind": str(f.get("kind") or ""), "size": int(f.get("size") or 0),
                "path": str(f.get("path") or "")} for f in files],
        state="queued", next_try_at=now)
    return view(row)


def view(row) -> dict:
    return {"id": row.id, "body": row.body, "page": row.page, "created_at": row.created_at,
            "status": row.remote_status if row.state == "sent" else "",
            "status_name": STATUS_NAMES.get(row.remote_status if row.state == "sent" else "", "Received"),
            "status_at": row.status_at,
            "files": [{"id": f.get("id"), "session": f.get("session"), "name": f.get("name"),
                       "media_type": f.get("media_type"), "kind": f.get("kind"), "size": f.get("size"),
                       "url": f"/attachments/{f.get('session')}/{f.get('id')}"} for f in row.files or []]}


def one(who, fid: str) -> dict | None:
    """One of the signed-in person's own feedback, as it stands now, or None."""
    row = _m().FeedbackOutbox.objects.filter(id=fid, org_id=str(who.org_id), user_id=str(who.user_id)).first()
    return view(row) if row is not None else None


def mine(who) -> dict:
    """The signed-in person's own feedback, newest first, with each status as rouh.land last said."""
    if who is None:
        raise Refused("Sign in first.")
    org, user = str(who.org_id), str(who.user_id)
    refresh_status(org, user)
    rows = list(_m().FeedbackOutbox.objects.filter(org_id=org, user_id=user).order_by("-created_at")[:500])
    items = [view(r) for r in rows]
    done = sum(1 for i in items if i["status"] == "done")
    return {"items": items, "count": len(items), "done": done}


# --- sent ------------------------------------------------------------------------------------------


def _member(org: str):
    from . import genepool

    mem = genepool.membership(org)
    if mem is None or mem.status != "member":
        raise Refused("This Rouh is not a member of rouh.land's Pool yet, so its feedback waits.")
    return mem


def _call(mem, rest: str, body: dict | None = None, *, raw: bytes | None = None, ctype: str = "",
          extra: dict | None = None) -> dict:
    from . import genepool

    try:
        return genepool.call(mem, "POST", "../feedback/" + rest, body, kind=KIND, raw=raw,
                             content_type=ctype or "application/json", extra=extra)
    except genepool.Refused as exc:
        raise Refused(str(exc)) from None


def _sender(row) -> dict:
    email = row.email
    if not email:
        try:
            u = _m().User.objects.filter(pk=row.user_id).only("email").first()
            email = str(getattr(u, "email", "") or "") if u is not None else ""
        except Exception:  # noqa: BLE001
            email = ""
    return {"id": row.user_id, "name": row.author, "email": email}


def send_one(row) -> bool:
    """Send one feedback and its files. True once rouh.land has all of it."""
    mem = _member(row.org_id)
    got = _call(mem, "api/send", {
        "local_id": row.id, "text": row.body, "sender": _sender(row), "page": row.page,
        "version": row.version, "at": row.created_at,
        "files": [{"name": f.get("name"), "media_type": f.get("media_type"), "size": f.get("size")}
                  for f in row.files or []]})
    remote = str(got.get("id") or "")
    if not remote:
        raise Refused("rouh.land did not say which feedback it kept.")
    wanted = [int(i) for i in got.get("files_wanted") or [] if str(i).isdigit()]
    for i in wanted:
        if i >= len(row.files or []):
            continue
        f = row.files[i]
        path = str(f.get("path") or "")
        try:
            size = os.path.getsize(path)
            if size > MAX_FILE_BYTES:
                log.info("a file of feedback %s is over the size rouh.land takes; it is left out", row.id)
                continue
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            log.info("a file of feedback %s is gone from this Rouh; it is left out", row.id)
            continue
        _call(mem, f"api/files/{quote(remote, safe='')}/{i}", raw=data,
              ctype=str(f.get("media_type") or "application/octet-stream"),
              extra={"X-File-Name": quote(str(f.get("name") or "file"), safe="")})
    now = _now()
    _m().FeedbackOutbox.objects.filter(id=row.id).update(
        state="sent", remote_id=remote, sent_at=now,
        remote_status=str(got.get("status") or "received") if str(got.get("status") or "received")
        in STATUS_NAMES else "received", status_at=now, error="")
    return True


def send_due(org: str | None = None, *, only: str = "", wait: float = 0.0) -> dict:
    """Every feedback whose time to be tried has come, sent. Never raises. Counts. `wait` is how
    long to wait for a sending already going (the beat's) to finish, for a Send that is to go now."""
    got = {"sent": 0, "waiting": 0}
    if not (_SENDING.acquire(timeout=wait) if wait > 0 else _SENDING.acquire(blocking=False)):
        return {"busy": True}
    try:
        rows = _m().FeedbackOutbox.objects.filter(state="queued", next_try_at__lte=_now())
        if org:
            rows = rows.filter(org_id=org)
        if only:
            rows = rows.filter(id=only)
        for row in list(rows.order_by("created_at")[:50]):
            if not on(row.org_id):
                got["waiting"] += 1
                continue
            try:
                send_one(row)
                got["sent"] += 1
            except Exception as exc:  # noqa: BLE001 - kept, and tried again later
                why = str(exc) if isinstance(exc, Refused) else type(exc).__name__
                wait = BACKOFF[min(row.tries, len(BACKOFF) - 1)]
                _m().FeedbackOutbox.objects.filter(id=row.id).update(
                    tries=row.tries + 1, next_try_at=_now() + wait, error=why[:500])
                got["waiting"] += 1
                log.info("feedback %s waits %ss to be sent again: %s", row.id, wait, why)
        return got
    finally:
        _SENDING.release()


def refresh_status(org: str, user: str) -> None:
    """Ask rouh.land how this person's sent feedback stands, at most once a minute. Never raises."""
    key = (org, user)
    if _now() - _STATUS_READ.get(key, 0) < STATUS_FRESH:
        return
    _STATUS_READ[key] = _now()
    try:
        if not on(org):
            return
        rows = list(_m().FeedbackOutbox.objects.filter(org_id=org, user_id=user, state="sent")
                    .exclude(remote_status="done").exclude(remote_id="").order_by("-created_at")[:200])
        if not rows:
            return
        mem = _member(org)
        got = _call(mem, "api/status", {"sender": user, "ids": [r.remote_id for r in rows]})
        by_id = {r.remote_id: r for r in rows}
        for item in got.get("items") or []:
            r = by_id.get(str(item.get("id") or ""))
            status = str(item.get("status") or "")
            if r is None or status not in STATUS_NAMES or not status or status == r.remote_status:
                continue
            _m().FeedbackOutbox.objects.filter(id=r.id, org_id=org, user_id=user).update(
                remote_status=status, status_at=float(item.get("updated_at") or _now()))
    except Exception as exc:  # noqa: BLE001 - the statuses kept are shown
        log.info("the status of feedback could not be read from rouh.land: %s", exc)
