"""Notifications: the screen first, and the phone only if the screen was not enough.

Petar, 10 October 2026, from the Gene therapy board (fr_8f09d161935f): "The idea is
that you first give me a notification, and I can look at it and dismiss it. If
not, I also get a Telegram notification. I can push up to get away from it,
meaning I'm going to look at it in a little bit or later."

Until that day everything Rouh had to tell him when it was not answering him
went straight to Telegram: a job that needs him, a reminder, the morning brief,
a note before a meeting, an email's note, a question that cannot wait. He was
often at the screen when it did, and the phone buzzed about something already in
front of him. So each of those is now a notice first:

* **It drops in at the top of every open tab of his** (`notices.js` on the page)
  the moment it is said, the way a notification drops in on an iPhone. More than
  one stack. Swiped left it is dismissed; swiped right it goes where it leads,
  if it leads anywhere, and is dismissed on the way (fr_a7c05457e6a3); pushed up
  it is put away for later and waits under the bell in the sidebar. Opened, it says all of itself, with the decision it asks
  drawn inside it where it asks one.
* **Left alone, it goes to the phone.** If nothing is done with it for `GRACE`
  seconds after it was said, its Telegram copy is sent, with the same link. If
  no screen of his drew it at all within `GLANCE` seconds - no tab open, or none
  in front of him - it goes at once, because there is nobody at the screen to
  wait for. Anything done with it on the screen - dismissed, opened, put away -
  means he saw it, and the phone stays quiet.
* **What cannot wait goes to the phone at once, as well as on the screen** (`at_once`).
  Petar, 17 October 2026, after a payment was told as paid while his bank's 3-D Secure
  still waited: "I should be notified on telegram for timely stuff like that." A step in
  the live browser only he can do (his bank's approval, a code, a login, a captcha), a
  job's hand-off to it, and a payment that failed or was left unpaid are sent to Telegram
  the moment they are said, once, and the notice on the screen is the same one.
* **What never went to the phone still does not.** A finished job is a notice
  and not a message (`config.phone_done_jobs`, off since 6 October 2026), and a
  note with no phone words has none to send.

The waiting is a row, not a timer: a deploy restarts Rouh many times a day, and
a notice said a second before one is sent by the process that comes back
(`Sweeper`). Each copy is claimed before it is sent, so it goes once.

Only the install's owner has a phone here: the bot reaches one chat, theirs
(`telegram.phone_owner`), so a notice for anybody else stays on the screen.
"""
from __future__ import annotations

import asyncio
import contextlib
import contextvars
import logging
import re
import time
from typing import Any, Awaitable, Callable
from urllib.parse import urlsplit

log = logging.getLogger("rouh.notices")

#: How long a notice is on the screen, untouched, before its phone copy goes. Petar: "If
#: I don't dismiss it in a minute or 30 seconds, or whatever you decide makes sense".
GRACE = 45.0
#: How long a notice waits for any screen to draw it before the phone is told at once.
GLANCE = 8.0
#: How far back the list under the bell goes, and how much of it.
KEEP_DAYS = 7
LISTED = 60
#: How often the phone copies that are due are looked for.
EVERY = 2.0

NEW, LATER, READ, DISMISSED = "new", "later", "read", "dismissed"
DUE, SENDING, SENT, SKIPPED, FAILED = "due", "sending", "sent", "skipped", "failed"

#: What a press or a swipe on the page may do to one: drawn while he was looking (`seen`),
#: put away (`later`), opened in place (`read`), swiped away or gone to (`dismiss`).
ACTS = ("seen", "later", "read", "dismiss")

TITLE = 140
#: Room for every word a job closes with (`assistant_job.answer_from`), which an opened notice
#: shows whole; the card in the stack and an unopened row show the first three lines of it.
BODY = 6000
#: Room for a result's details under its overview (`details`): a job's whole closing message and
#: what it changed. The overview stays `BODY` or shorter.
DETAILS = 20000

URL = re.compile(r"https?://[^\s<>\"']+")

#: What following a link is called, by where it goes in Rouh. "at least it should say
#: 'link' or 'go to' something".
LABELS = (
    ("/run/", "Open the run"),
    ("/task/", "Open the task"),
    ("/project/", "Open the project"),
    ("/decisions", "Answer it"),
    ("/chat/", "Open the chat"),
    ("/brief", "Open the brief"),
    ("/mail/", "Open the email"),
    ("/browser", "Open the browser"),
    ("/web", "Open the browser"),
    ("/reminders", "Open Clockwork"),
    ("/clockwork", "Open Clockwork"),
    ("/goals", "Open the goal"),
    ("/goal/", "Open the goal"),
    ("/work", "Open the quest"),
    ("/meeting", "Open the meeting"),
    ("/anatomy/behaviour/beats?beat=", "Open the beat"),
)


class Hooks:
    """What the notices borrow from the running Rouh, set by `runtime`."""

    #: () -> identity: the install's owner, whose phone the bot reaches.
    owner: Callable[[], Any] | None = None
    #: async (who, message): one message to every open tab of that person's.
    push: Callable[[Any, dict], Awaitable] | None = None
    #: The bot (`telegram.Telegram`), or None.
    telegram: Any = None
    #: async (who, decision id) -> bool: a decision's own phone message, with its buttons.
    phone_decision: Callable[[Any, int], Awaitable[bool]] | None = None
    public_url: str = ""


hooks = Hooks()


# --- the words ------------------------------------------------------------------------------


def _cut(text: str, most: int) -> str:
    text = " ".join(str(text or "").split())
    if len(text) <= most:
        return text
    return text[: most - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"


def local_link(link: str, public_url: str = "") -> str:
    """A link into this Rouh as its own address ("/run/abc"), so it is followed inside the
    page; anything else as it came."""
    link = str(link or "").strip()
    base = str(public_url or hooks.public_url or "").rstrip("/")
    if base and (link == base or link.startswith(base + "/")):
        rest = link[len(base):]
        return rest or "/"
    return link


def label_for(link: str) -> str:
    if not link:
        return ""
    if link.startswith("/"):
        for start, words in LABELS:
            if link.startswith(start):
                return words
        return "Open it"
    host = urlsplit(link).hostname or ""
    host = host[4:] if host.startswith("www.") else host
    return f"Open {host}" if host else "Open the link"


def from_text(text: str, public_url: str = "") -> dict:
    """A phone message's words as a notice: its first line the title, the rest the body, and
    the link it carries - a link into Rouh first, else the last one - as where it leads.

    Every note Rouh sends the phone is written that way already ("⚠️ Needs you: ...", a line
    or two, the link at the foot), so the screen says what the phone would have said.
    """
    text = str(text or "").strip()
    links = URL.findall(text)
    base = str(public_url or hooks.public_url or "").rstrip("/")
    ours = [u for u in links if base and u.startswith(base)]
    link = ours[0] if ours else (links[-1] if links else "")
    link = link.rstrip(".,;)")
    lines = [ln.rstrip() for ln in text.splitlines()]
    # A line that is nothing but the link is the link, and is not said twice.
    kept = [ln for ln in lines if not (ln.strip() and URL.fullmatch(ln.strip().rstrip(".,;)")))]
    first = next((i for i, ln in enumerate(kept) if ln.strip()), None)
    if first is None:
        title, body = "Rouh", ""
    else:
        title = kept[first].strip()
        rest = "\n".join(kept[first + 1:]).strip()
        if len(title) > TITLE:
            body = (title + ("\n" + rest if rest else "")).strip()
            title = _cut(title, TITLE)
        else:
            body = rest
    body = re.sub(r"\n{3,}", "\n\n", body)
    local = local_link(link, base)
    return {"title": title, "body": body[:BODY], "link": local, "link_label": label_for(local)}


# --- the rows -------------------------------------------------------------------------------


def _ids(who) -> tuple[str, str]:
    return str(who.user_id), str(who.org_id)


def _model():
    from .models import Notice

    return Notice


#: The most a notice's short version says before it is opened, in characters: whole lines, and
#: whole sentences of a long first line, never a word cut with "...".
SHORT = 280
_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[\"'(\[]?[A-Z0-9])")


def short_and_details(body: str, details: str = "") -> tuple[str, str]:
    """A notice's short version and its details.

    Petar, 28 November 2026: "the text should not be ellipsised ... show the full short
    version and then by expanding - the details." A producer that says both (a finished job's
    overview and details, the morning brief's) is kept as it said them. A notice that said only
    a long body is read as both: its first whole lines, or the first whole sentences of a long
    first line, up to `SHORT`, are the short version, and every word after them the details,
    so nothing is cut and nothing is said twice. Always at least one whole sentence."""
    body = str(body or "").strip()
    details = str(details or "").strip()
    if details or len(body) <= SHORT:
        return body, details
    lines = body.splitlines()
    short, used = [], 0
    for i, line in enumerate(lines):
        if short and (used + len(line) > SHORT or not line.strip() and used):
            return "\n".join(short).strip(), "\n".join(lines[i:]).strip()
        if not short and len(line) > SHORT:
            ends = [m.start() for m in _SENTENCE.finditer(line)] + [len(line)]
            cut = ends[0]
            for end in ends[1:]:
                if end > SHORT:
                    break
                cut = end
            after = "\n".join([line[cut:].strip()] + lines[i + 1:]).strip()
            return line[:cut].strip(), after
        short.append(line)
        used += len(line) + 1
    return body, ""


def as_dict(row) -> dict:
    short, details = (row.body or "", getattr(row, "details", "") or "") if row.decision_id \
        else short_and_details(row.body, getattr(row, "details", ""))
    return {
        "id": row.id, "kind": row.kind, "title": row.title, "body": short,
        "details": details,
        "link": row.link, "link_label": row.link_label, "links": list(row.links or []),
        "decision": row.decision_id,
        "state": row.state, "phone": row.phone, "at": row.created_at,
        "phoned_at": row.phoned_at, "deployed": row.deployed,
    }


# --- what a Clockwork item says -----------------------------------------------------------
#
# Petar, 28 November 2026: "scheduled stuff also go in reminders", and of a reminder's card that
# had only a Chat button: "a notification is triggered by that, it should have a button to go to
# the clockwork item - to see, to edit". So whatever is said while one of Clockwork's items is
# being done - its own reminder line, what its turn sends the phone with `send_telegram`, a
# browser hand-over, anything that writes a notice - is filed under Reminders when it is written,
# and leads to that item on Clockwork as well as wherever else it leads. The timekeeper says which
# item it is doing (`timekeeper.deliver`), and every task that work starts inherits it. Rouh's own
# server jobs are not set here, and the heartbeat and the brief are never Clockwork's.

#: The Clockwork item being done now, as (its id, until when), or None everywhere else. The time
#: is how long its turn may take and some: a task its turn happens to start that lives on (a
#: service started for the first time in it) must never file everything after it as this item's.
CLOCKWORK: contextvars.ContextVar[tuple[str, float] | None] = contextvars.ContextVar(
    "rouh_notice_clockwork_item", default=None)
#: How long after an item starts what is said is still that item's.
CLOCKWORK_FOR = 3600.0
#: Kinds that keep their own place even when a Clockwork item said them: a decision waits on an
#: answer under Decisions, and the heartbeat and the brief are their own things.
KEEPS_KIND = frozenset({"decision", "heartbeat", "brief"})
#: The `to` of a notice's link to its Clockwork item.
TO_CLOCKWORK = "clockwork"


def clockwork_href(item) -> str:
    """Clockwork, open on one of its items (`address.js` reads `item`)."""
    return f"/clockwork?item={item}"


def clockwork_item() -> str:
    """The Clockwork item being done in this task, or ""."""
    got = CLOCKWORK.get()
    if not got or time.time() > got[1]:
        return ""
    return got[0]


@contextlib.contextmanager
def from_clockwork(item):
    """Everything said inside this, and in every task started inside it, is that item's."""
    token = CLOCKWORK.set((str(item), time.time() + CLOCKWORK_FOR))
    try:
        yield
    finally:
        CLOCKWORK.reset(token)


def _clockwork_places(item: str, kind: str, link: str, link_label: str, links) -> tuple:
    """A notice an item said: under Reminders, and leading to the item beside its other places."""
    if kind not in KEEPS_KIND:
        kind = "reminder"
    links = [dict(one) for one in (links or ()) if isinstance(one, dict)]
    if link and not any(local_link(str(one.get("href") or "")) == link for one in links):
        # The column draws the list alone when there is one, so where it led goes in it first.
        links.insert(0, {"to": place_of(link), "label": link_label or label_for(link),
                         "href": link})
    links = [one for one in links if one.get("to") != TO_CLOCKWORK][:7]
    links.append({"to": TO_CLOCKWORK, "label": "Clockwork", "href": clockwork_href(item),
                  "title": "Open this item on Clockwork"})
    if not link:
        link, link_label = clockwork_href(item), "Open Clockwork"
    return kind, link, link_label, links


_ITEM = re.compile(r"^/clockwork\?item=(\d+)$")


def _item_of(href: str) -> str:
    got = _ITEM.match(str(href or ""))
    return got.group(1) if got else ""


def without_gone_items(who, items: list[dict]) -> list[dict]:
    """These notices as drawn, each leading to its Clockwork item only while the item is there:
    one deleted since is no button at all, never a link to nothing."""
    wanted = {_item_of(one.get("href")) for n in items for one in (n.get("links") or ())
              if isinstance(one, dict)} | {_item_of(n.get("link")) for n in items}
    wanted.discard("")
    if not wanted:
        return items
    user_id, org_id = _ids(who)
    try:
        from .models.rest import Reminder

        there = {str(i) for i in Reminder.objects.filter(
            user_id=user_id, org_id=org_id, id__in=[int(i) for i in wanted]
        ).values_list("id", flat=True)}
    except Exception:
        log.exception("could not look up which Clockwork items are still there")
        return items
    gone = wanted - there
    if not gone:
        return items
    for n in items:
        n["links"] = [one for one in (n.get("links") or ())
                      if not (isinstance(one, dict) and _item_of(one.get("href")) in gone)]
        if _item_of(n.get("link")) in gone:
            n["link"], n["link_label"] = "", ""
    return items


def _links(links) -> list[dict]:
    """Every place a notice leads, each as Rouh's own address where it is one, and only the
    ones with somewhere to go."""
    out = []
    for one in links or ():
        if not isinstance(one, dict):
            continue
        href = local_link(str(one.get("href") or ""))[:2000]
        label = _cut(one.get("label") or label_for(href), 40)
        if href and label:
            out.append({"to": str(one.get("to") or "")[:20], "label": label, "href": href,
                        "title": _cut(one.get("title") or label, 160)})
    return out[:8]


def post(who, *, title: str, body: str = "", link: str = "", link_label: str = "",
         links=(), kind: str = "", key: str = "", phone_text: str = "",
         decision_id: int | None = None, deployed: str = "", details: str = "",
         now: float | None = None) -> dict | None:
    """Write one notice. None when its key was said before.

    `body` is what it says in short, and `details` everything under that, when there is more:
    a finished job's result is one notice, its overview first and its details below it."""
    details = str(details or "").strip()
    if details and details == str(body or "").strip():
        details = ""
    from django.db import IntegrityError, transaction

    user_id, org_id = _ids(who)
    link = local_link(link)
    item = clockwork_item()
    if item:
        kind, link, link_label, links = _clockwork_places(item, kind, link, link_label, links)
    try:
        with transaction.atomic():
            row = _model().objects.create(
                user_id=user_id, org_id=org_id, key=str(key or "")[:500], kind=kind or "rouh",
                title=_cut(title, TITLE) or "Rouh", body=str(body or "").strip()[:BODY],
                details=details[:DETAILS],
                link=link[:2000], link_label=(link_label or label_for(link))[:80],
                links=_links(links),
                decision_id=decision_id, deployed=str(deployed or "")[:40], state=NEW,
                phone_text=str(phone_text or "").strip(), phone=DUE if phone_text or decision_id
                else "", created_at=now or time.time())
    except IntegrityError:
        return None
    return as_dict(row)


def _settle_decisions(who, rows) -> list:
    """A notice asking a decision that was answered somewhere else is read: the question it
    carried is not waiting any more."""
    asking = [r for r in rows if r.decision_id and r.state in (NEW, LATER)]
    if not asking:
        return rows
    from .models import Decision

    user_id, org_id = _ids(who)
    still = set(Decision.objects.filter(
        user_id=user_id, org_id=org_id, id__in=[r.decision_id for r in asking],
        status__in=("open", "snoozed", "failed")).values_list("id", flat=True))
    gone = [r.id for r in asking if r.decision_id not in still]
    if gone:
        stamp = time.time()
        _model().objects.filter(id__in=gone, phone=DUE).update(phone=SKIPPED)
        _model().objects.filter(id__in=gone).update(state=READ, handled_at=stamp)
        rows = list(_model().objects.filter(id__in=[r.id for r in rows]).order_by("-created_at",
                                                                                   "-id"))
    return rows


def settle_link(who, *, kind: str, link: str) -> int:
    """Every notice of this kind that leads to `link`, new or put away, read, with its phone
    copy kept quiet: what it said waits for him is not waiting any more (N1, "Remove the
    notice when ..."). How many it changed."""
    user_id, org_id = _ids(who)
    links = {str(link or "").strip(), local_link(link)} - {""}
    if not links:
        return 0
    rows = _model().objects.filter(user_id=user_id, org_id=org_id, kind=kind, link__in=links,
                                   state__in=(NEW, LATER))
    rows.filter(phone=DUE).update(phone=SKIPPED)
    return rows.update(state=READ, handled_at=time.time())


async def settled(who, *, kind: str, link: str) -> int:
    """`settle_link`, and every open tab of his told, so the notice goes from the screen."""
    try:
        n = await asyncio.to_thread(settle_link, who, kind=kind, link=link)
    except Exception:  # noqa: BLE001 - a notice left up is shown as read on the next look
        log.exception("notices for %s could not be settled", link)
        return 0
    if n:
        await tell(who)
    return n


def listing(who) -> dict:
    """Everything under the bell: the last week's, newest first, without the dismissed, and
    how many are still to read (`unread_count`, every one ever kept since 26 November 2026).

    The count is a COUNT of its own, never the unread among the `LISTED` rows sent. Until 4
    November 2026 it was those, so the bell could never pass the share of the newest 60 still
    unread, and as each new notice pushed an old one out of the 60 it stayed where it was:
    Petar, that day, of the bell "stuck" at 55 and 56, with more than that to read."""
    user_id, org_id = _ids(who)
    since = time.time() - KEEP_DAYS * 86400
    week = _model().objects.filter(user_id=user_id, org_id=org_id, created_at__gte=since)
    # A notice asking a decision answered elsewhere is not counted, listed or not: the count
    # settles those first, so the rows read after it say so too.
    unread = unread_count(who)
    rows = list(week.exclude(state=DISMISSED).order_by("-created_at", "-id")[:LISTED])
    items = without_gone_items(who, [as_dict(r) for r in rows])
    return {"type": "notices", "items": items, "unread": unread, "grace": GRACE}


def unread_count(who) -> int:
    """How many are still to read, of every one ever kept: the bell's number, and the number the
    Notifications page says at its top (`browse`), which are one number. Until 26 November 2026
    the bell counted the last week's only, while the page lists every one there is; an unread
    one older than that is still unread, and the page is where it is read or cleared."""
    user_id, org_id = _ids(who)
    rows = _model().objects.filter(user_id=user_id, org_id=org_id)
    _settle_decisions(who, list(rows.filter(state__in=(NEW, LATER)).exclude(decision_id=None)))
    return rows.filter(state__in=(NEW, LATER)).count()


def act(who, ids, what: str) -> int:
    """One press or swipe on the page, on one notice or several. How many it changed."""
    if what not in ACTS:
        return 0
    user_id, org_id = _ids(who)
    try:
        ids = [int(i) for i in (ids or [])][:LISTED * 2]
    except (TypeError, ValueError):
        return 0
    if not ids:
        return 0
    rows = _model().objects.filter(user_id=user_id, org_id=org_id, id__in=ids)
    stamp = time.time()
    if what == "seen":
        return rows.filter(seen_at__isnull=True).update(seen_at=stamp)
    # Anything done with it means he saw it: the phone stays quiet.
    rows.filter(phone=DUE).update(phone=SKIPPED)
    rows.filter(seen_at__isnull=True).update(seen_at=stamp)
    if what == "later":
        return rows.filter(state=NEW).update(state=LATER, handled_at=stamp)
    if what == "read":
        return rows.filter(state__in=(NEW, LATER)).update(state=READ, handled_at=stamp)
    return rows.exclude(state=DISMISSED).update(state=DISMISSED, handled_at=stamp)


def due(now: float | None = None) -> list:
    """The notices whose phone copy is to go now: still on the screen untouched past `GRACE`,
    or never drawn by any screen past `GLANCE`."""
    from django.db.models import Q

    now = now or time.time()
    return list(_model().objects.filter(phone=DUE, state=NEW).filter(
        Q(created_at__lte=now - GRACE) | Q(seen_at__isnull=True, created_at__lte=now - GLANCE))
        .order_by("created_at")[:20])


def claim(row_id: int) -> bool:
    """Take one phone copy to send. True once only, whoever asks."""
    return _model().objects.filter(id=row_id, phone=DUE, state=NEW).update(phone=SENDING) == 1


def phoned(row_id: int, outcome: str) -> None:
    _model().objects.filter(id=row_id).update(
        phone=outcome, phoned_at=time.time() if outcome == SENT else None)


# --- the Notifications page ----------------------------------------------------------------
#
# Petar, 26 November 2026: "When I press on the notifications icon in the navigation, it should
# take me to a new url with a full-scale management page. Filters, search, type, sort, clear
# multiple by some criteria, clear only the current filter, read inline, link to the relevant
# things." The column under the bell holds the last week's, 60 at most; the page at
# `/notifications` (`noticespage.js`, `web/notifications.py`) holds every one ever kept, found
# by the criteria below, and acts on one, a few picked, or every one matching a view.
#
# "Clear" on the page is the column's dismiss: the row stays, in its own state, so a clear can
# be undone and every cleared one is found again under Cleared, and restored.

#: What each kind is called on the page, in the order the filter lists them. A kind that is not
#: here is listed by its own name.
KIND_NAMES = {
    "job": "Jobs", "mail": "Email", "decision": "Decisions", "reminder": "Reminders",
    "meeting": "Meetings", "brief": "Morning brief", "browser": "Live browser",
    "payment": "Payments", "conflict": "Conflicts", "heartbeat": "Heartbeat",
    "gene": "Genes", "rouh": "Rouh",
}

#: Where a notice leads, by the start of its address, and what that place is called on the page.
PLACES = (
    ("/run/", "run"), ("/task/", "task"), ("/project/", "task"), ("/chat/", "chat"),
    ("/decisions", "decision"), ("/mail/", "email"), ("/brief", "brief"),
    ("/goal", "goal"), ("/quests", "quest"), ("/work", "quest"), ("/meeting", "meeting"),
    ("/clockwork", "clockwork"), ("/reminders", "clockwork"), ("/browser", "browser"),
    ("/web", "browser"), ("/files/", "file"), ("/workspace/", "page"),
)
PLACE_NAMES = {
    "task": "A task", "run": "A run", "chat": "A chat", "decision": "A decision",
    "email": "An email", "page": "A page", "brief": "The brief", "goal": "A goal",
    "quest": "A quest", "meeting": "A meeting", "clockwork": "Clockwork",
    "browser": "The browser", "file": "A file", "web": "A website", "rouh": "Somewhere in Rouh",
}
#: What the page's Show filter may be: every one not cleared (""), or one state of them.
SHOWS = ("", "unread", "read", "cleared")
SORTS = ("newest", "oldest", "kind", "unread")
#: The date ranges, as the page names them; "custom" is `since` and `until` as given.
WHENS = ("", "today", "week", "month", "older", "custom")
#: The most a page of the list holds (cards), and the most rows one press may change.
PAGE_MOST = 200
#: The most of a card's others drawn under it when it is opened; a press still acts on all.
STACK_DRAWN = 60
BULK_MOST = 20000

_TASK = re.compile(r"^/(?:task|project)/(.+?)(?:[?#].*)?$")
_TASK_TOP = re.compile(r"^(.*?/\d+\.[^/]+)")


def place_of(href: str) -> str:
    """What kind of place an address is: "task", "run", "chat", ... "web" for anywhere outside
    Rouh, "" for nowhere."""
    href = str(href or "").strip()
    if not href:
        return ""
    if not href.startswith("/") or href.startswith("//"):
        return "web"
    for start, place in PLACES:
        if href.startswith(start):
            return place
    return "rouh"


def task_of(href: str) -> str:
    """The task an address is about, as its folder ("work/acme/58.pricing"), a step folded into
    its task; "" for an address that is not a task's."""
    got = _TASK.match(str(href or "").strip())
    if not got:
        return ""
    from urllib.parse import unquote

    folder = unquote(got.group(1)).strip("/")
    top = _TASK_TOP.match(folder)
    return top.group(1) if top else folder


def task_name(folder: str) -> str:
    """A task's folder said as a person would: "58 pricing" for "work/acme/58.pricing"."""
    last = str(folder or "").rstrip("/").rsplit("/", 1)[-1]
    num, dot, rest = last.partition(".")
    if dot and num.isdigit():
        return f"{num} {rest.replace('-', ' ').replace('_', ' ')}".strip()
    return last.replace("-", " ").replace("_", " ")


def kind_name(kind: str) -> str:
    kind = str(kind or "") or "rouh"
    return KIND_NAMES.get(kind) or kind.replace("_", " ").replace("-", " ").capitalize()


def _leads(row: dict) -> tuple[set, dict]:
    """Every kind of place a row leads to, and the tasks it is about with their names."""
    places, tasks = set(), {}
    hrefs = [(row.get("link") or "", "")]
    for one in row.get("links") or ():
        if isinstance(one, dict):
            hrefs.append((str(one.get("href") or ""), str(one.get("title") or "")
                          if one.get("to") == "task" else ""))
    for href, title in hrefs:
        place = place_of(href)
        if place:
            places.add(place)
        folder = task_of(href)
        if folder and (title or folder not in tasks):
            tasks[folder] = title or tasks.get(folder) or task_name(folder)
    if row.get("decision_id"):
        places.add("decision")
    return places, tasks


# --- Jobs, in groups, and one card a job ----------------------------------------------------
#
# Petar, 28 November 2026, with about 500 Jobs notifications kept, nearly all of them finished
# jobs: Jobs in groups he can look at one at a time and dismiss whole ("Dismiss these N"), and
# every notification about one job, or one task, one card showing the newest, with the rest a
# press away. Nothing is stored for either: both are read from what each notification already
# records, its key ("job:<id>:<what>"), its title, its `deployed`, where it leads, and the run
# behind it (`Run.made_by`, its state; `RouhChange` for a run that landed a change to Rouh).
# Nothing is deleted, muted or stopped: only how the page groups and draws them.

#: The groups of Jobs, in the order the page lists them: (id, what it is called).
JOB_GROUPS = (
    ("failed", "Failed"),
    ("waiting", "Waiting on you"),
    ("live", "Rouh changes"),
    ("tasks", "Workspace tasks"),
    ("research", "Research"),
    ("auto", "Nightly and automatic"),
    ("other", "Other"),
)
JOB_GROUP_NAMES = dict(JOB_GROUPS)
#: The categories of the workspace whose tasks are research: looked into, compared, weighed.
#: Buying is researched there too ("which vacuum should I buy"), and filed under buy.
RESEARCH_CATEGORIES = frozenset({"research", "buy"})

_JOB_KEY = re.compile(r"^job:([^:]+):([^:]*)")


def job_of(key: str) -> tuple[str, str]:
    """The job a notification is about and what it said of it ("answer", "change", "page",
    "files", "stuck"), from its key; ("", "") for one that is not a job's."""
    got = _JOB_KEY.match(str(key or ""))
    return (got.group(1), got.group(2)) if got else ("", "")


def _needs_him(title: str) -> bool:
    """A job's notice that said it needs him (`job_phone.stuck_text`): "Needs you: ..."."""
    return "Needs you" in str(title or "")[:24]


def _research(folder: str) -> bool:
    return any(part in RESEARCH_CATEGORIES for part in str(folder or "").split("/")[:-1])


def job_groups(who) -> dict[str, str]:
    """Every job of the person's that has a notification, and the one group of Jobs it is in.

    One group a job, whichever of its notifications is asked about, so a job's card and its
    count are always in the same place. In this order, the first that holds:

    1. **Failed**: its run failed, or its newest notification says a change of it reached main
       and is not live.
    2. **Waiting on you**: its newest notification says it needs him, or its run is waiting.
    3. **Nightly and automatic**: Rouh started it on its own (`Run.made_by`, "process:...": a
       night, Synapse's, a heartbeat's follow-up, a Clockwork item's).
    4. **Rouh changes**: it put a change to Rouh live (a notice's `deployed`, or a change of
       Rouh's code it landed, `RouhChange`).
    5. **Research**: a task it is about is filed under research (or buy).
    6. **Workspace tasks**: it is about a task, or made a page of one.
    7. **Other**: none of those; never a guess.
    """
    user_id, org_id = _ids(who)
    facts: dict[str, dict] = {}
    for r in _model().objects.filter(user_id=user_id, org_id=org_id, kind="job").values(
            "key", "title", "deployed", "created_at", "link", "links"):
        job, what = job_of(r["key"])
        if not job:
            continue
        f = facts.setdefault(job, {"at": -1.0, "newest": None, "live": False, "tasks": set(),
                                   "page": False})
        if r["created_at"] > f["at"]:
            f["at"], f["newest"] = r["created_at"], (what, r["title"])
        if r["deployed"]:
            f["live"] = True
        if what == "page":
            f["page"] = True
        f["tasks"].update(_leads(r)[1])
    if not facts:
        return {}
    runs: dict[str, tuple[str, str]] = {}
    landed: set[str] = set()
    try:
        from .models import Run
        from .models.changes import RouhChange

        ids = list(facts)
        runs = {i: (m or "", s or "") for i, m, s in Run.objects.filter(id__in=ids).values_list(
            "id", "made_by", "state")}
        landed = set(RouhChange.objects.filter(org_id=org_id, run_id__in=ids, state="landed")
                     .values_list("run_id", flat=True))
    except Exception:  # noqa: BLE001 - without the runs, what the notices say still groups them
        log.exception("could not read the runs behind the job notifications")
    out = {}
    for job, f in facts.items():
        what, title = f["newest"] or ("", "")
        made_by, state = runs.get(job, ("", ""))
        if state == "failed" or (what == "change" and _needs_him(title)):
            group = "failed"
        elif _needs_him(title) or state == "waiting":
            group = "waiting"
        elif made_by.startswith("process:"):
            group = "auto"
        elif f["live"] or job in landed:
            group = "live"
        elif any(_research(t) for t in f["tasks"]):
            group = "research"
        elif f["tasks"] or f["page"]:
            group = "tasks"
        else:
            group = "other"
        out[job] = group
    return out


def _stack_of(row: dict) -> str:
    """The card a light row is drawn on with others: its job's, else the task it is about's,
    else "" for a card of its own."""
    if row.get("job"):
        return "job:" + row["job"]
    if row.get("tasks"):
        return "task:" + next(iter(row["tasks"]))
    return ""


def stacked(rows: list[dict]) -> list[list[dict]]:
    """The rows in their order, each job's and each task's together: a card for each, where its
    first row is, the newest of it on top."""
    out: list[list[dict]] = []
    by: dict[str, list[dict]] = {}
    for r in rows:
        key = r.get("stack") or ""
        if key and key in by:
            by[key].append(r)
            continue
        one = [r]
        out.append(one)
        if key:
            by[key] = one
    for one in out:
        if len(one) > 1:
            one.sort(key=lambda r: (-r["at"], -r["id"]))
    return out


def _criteria(raw: dict | None, now: float) -> dict:
    """What the page asked for, read safely: anything it may not ask is left out."""
    raw = raw or {}

    def num(key):
        try:
            v = float(raw.get(key))
        except (TypeError, ValueError):
            return None
        return v if v == v and abs(v) < 1e11 else None

    kinds = raw.get("kinds") or raw.get("kind") or []
    if isinstance(kinds, str):
        kinds = [k for k in kinds.split(",")]
    places = raw.get("to") or []
    if isinstance(places, str):
        places = places.split(",")
    subs = raw.get("sub") or []
    if isinstance(subs, str):
        subs = subs.split(",")
    show = str(raw.get("show") or "")
    when = str(raw.get("when") or "")
    today = num("today")
    # The start of the person's day, as their page reckons it; a day's worth back at most.
    if today is None or not (now - 86400 * 1.5 <= today <= now + 3600):
        today = now - (now % 86400)
    return {
        "q": " ".join(str(raw.get("q") or "").split())[:200],
        "kinds": [str(k).strip()[:40] for k in kinds if str(k).strip()][:40],
        "show": show if show in SHOWS else "",
        "when": when if when in WHENS else "",
        "since": num("since"), "until": num("until"), "today": today,
        "to": [str(p).strip()[:20] for p in places if str(p).strip()][:20],
        "sub": [str(g).strip() for g in subs if str(g).strip() in JOB_GROUP_NAMES],
        "task": str(raw.get("task") or "").strip()[:400],
        "older_days": num("older_days"),
    }


def _window(c: dict, now: float) -> tuple[float | None, float | None]:
    when = c["when"]
    if when == "today":
        return c["today"], None
    if when == "week":
        return now - 7 * 86400, None
    if when == "month":
        return now - 30 * 86400, None
    if when == "older":
        return None, now - 30 * 86400
    if when == "custom":
        return c["since"], c["until"]
    return None, None


def _passes(row: dict, c: dict, now: float, skip: str = "") -> bool:
    """Whether one light row is in the view `c` asks for, leaving out the dimension `skip` (so
    each filter's counts say how many each of its choices would show with the others on)."""
    state = row["state"]
    if skip != "show":
        show = c["show"]
        if show == "cleared":
            if state != DISMISSED:
                return False
        elif state == DISMISSED:
            return False
        elif show == "unread" and state not in (NEW, LATER):
            return False
        elif show == "read" and state != READ:
            return False
    if skip != "kinds" and c["kinds"] and (row["kind"] or "rouh") not in c["kinds"]:
        return False
    if skip != "sub" and c["sub"] and row.get("group") not in c["sub"]:
        return False
    if skip != "when":
        since, until = _window(c, now)
        if since is not None and row["at"] < since:
            return False
        if until is not None and row["at"] >= until:
            return False
    if c["older_days"] is not None and row["at"] >= now - c["older_days"] * 86400:
        return False
    if skip != "to" and c["to"] and not (row["places"] & set(c["to"])):
        return False
    if skip != "task" and c["task"] and c["task"] not in row["tasks"]:
        return False
    return True


def _light_rows(who, c: dict) -> list[dict]:
    """Every row of the person's that the search finds, light: no words, only what the filters
    read. The search is the database's, over title and words, every word of it found."""
    from django.db.models import Q

    user_id, org_id = _ids(who)
    rows = _model().objects.filter(user_id=user_id, org_id=org_id)
    for word in c["q"].split()[:8]:
        rows = rows.filter(Q(title__icontains=word) | Q(body__icontains=word)
                           | Q(details__icontains=word))
    groups = job_groups(who)
    out = []
    for r in rows.values("id", "kind", "key", "state", "created_at", "link", "links",
                         "decision_id"):
        places, tasks = _leads(r)
        job = job_of(r["key"])[0] if r["kind"] == "job" else ""
        one = {"id": r["id"], "kind": r["kind"] or "rouh", "state": r["state"],
               "at": r["created_at"], "places": places, "tasks": tasks, "job": job,
               "group": (groups.get(job) or "other") if r["kind"] == "job" else ""}
        one["stack"] = _stack_of(one)
        out.append(one)
    return out


def _ordered(rows: list[dict], sort: str) -> list[dict]:
    if sort == "oldest":
        return sorted(rows, key=lambda r: (r["at"], r["id"]))
    if sort == "kind":
        return sorted(rows, key=lambda r: (kind_name(r["kind"]).lower(), -r["at"], -r["id"]))
    if sort == "unread":
        return sorted(rows, key=lambda r: (r["state"] not in (NEW, LATER), -r["at"], -r["id"]))
    return sorted(rows, key=lambda r: (-r["at"], -r["id"]))


def matching(who, raw: dict | None, now: float | None = None) -> list[dict]:
    """Every light row the view `raw` shows, in its order."""
    now = now or time.time()
    c = _criteria(raw, now)
    sort = str((raw or {}).get("sort") or "newest")
    return _ordered([r for r in _light_rows(who, c) if _passes(r, c, now)],
                    sort if sort in SORTS else "newest")


def browse(who, raw: dict | None = None, now: float | None = None) -> dict:
    """One page of the Notifications page: the rows the view asks for, whole, with how many
    there are, and every filter's choices with how many each would show."""
    now = now or time.time()
    raw = raw or {}
    c = _criteria(raw, now)
    sort = str(raw.get("sort") or "newest")
    sort = sort if sort in SORTS else "newest"
    try:
        offset = max(0, int(raw.get("offset") or 0))
        limit = min(PAGE_MOST, max(1, int(raw.get("limit") or 50)))
    except (TypeError, ValueError):
        offset, limit = 0, 50
    unread = unread_count(who)
    light = _light_rows(who, c)
    shown = _ordered([r for r in light if _passes(r, c, now)], sort)

    counts: dict[str, Any] = {}
    # Show: each state, counted with every other filter on.
    base = [r for r in light if _passes(r, c, now, skip="show")]
    counts["show"] = {
        "": sum(1 for r in base if r["state"] != DISMISSED),
        "unread": sum(1 for r in base if r["state"] in (NEW, LATER)),
        "read": sum(1 for r in base if r["state"] == READ),
        "cleared": sum(1 for r in base if r["state"] == DISMISSED),
    }
    base = [r for r in light if _passes(r, c, now, skip="kinds")]
    kinds: dict[str, int] = {}
    for r in base:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    order = list(KIND_NAMES)
    counts["kinds"] = [{"id": k, "name": kind_name(k), "n": n} for k, n in sorted(
        kinds.items(), key=lambda kv: (order.index(kv[0]) if kv[0] in order else len(order),
                                       kind_name(kv[0]).lower()))]
    # Jobs' groups: how many each would show with the other filters on, every group listed,
    # so the Jobs group's numbers add up to the Jobs kind's.
    base = [r for r in light if _passes(r, c, now, skip="sub") and r["group"]]
    subs = {g: 0 for g, _ in JOB_GROUPS}
    for r in base:
        subs[r["group"]] = subs.get(r["group"], 0) + 1
    counts["sub"] = [{"id": g, "name": name, "n": subs[g]} for g, name in JOB_GROUPS] \
        if base else []
    base = [r for r in light if _passes(r, c, now, skip="when")]
    windows = {}
    for key in ("today", "week", "month", "older"):
        since, until = _window(dict(c, when=key), now)
        windows[key] = sum(1 for r in base if (since is None or r["at"] >= since)
                           and (until is None or r["at"] < until))
    windows[""] = len(base)
    counts["when"] = windows
    base = [r for r in light if _passes(r, c, now, skip="to")]
    places: dict[str, int] = {}
    for r in base:
        for p in r["places"]:
            places[p] = places.get(p, 0) + 1
    porder = list(PLACE_NAMES)
    counts["to"] = [{"id": p, "name": PLACE_NAMES.get(p, p.capitalize()), "n": n}
                    for p, n in sorted(places.items(), key=lambda kv: (
                        porder.index(kv[0]) if kv[0] in porder else len(porder)))]
    base = [r for r in light if _passes(r, c, now, skip="task")]
    tasks: dict[str, dict] = {}
    for r in base:
        for folder, name in r["tasks"].items():
            t = tasks.setdefault(folder, {"id": folder, "name": name, "n": 0, "at": 0})
            t["n"] += 1
            t["at"] = max(t["at"], r["at"])
    counts["task"] = sorted(tasks.values(), key=lambda t: (-t["n"], -t["at"]))[:60]
    if c["task"] and c["task"] not in tasks:
        counts["task"].append({"id": c["task"], "name": task_name(c["task"]), "n": 0, "at": 0})

    # One card a job, or a task: a page is so many cards, each with every one of its own.
    cards = stacked(shown)
    page = cards[offset:offset + limit]
    wanted = [r["id"] for card in page for r in card[:1 + STACK_DRAWN]]
    by_id = {r.id: r for r in _model().objects.filter(id__in=wanted)}

    def whole_row(light_row):
        row = by_id.get(light_row["id"])
        if row is None:
            return None
        one = as_dict(row)
        one["kind_name"] = kind_name(row.kind)
        one["to"] = sorted(light_row["places"])
        one["tasks"] = [{"id": f, "name": n} for f, n in light_row["tasks"].items()]
        if light_row["group"]:
            one["group"] = light_row["group"]
            one["group_name"] = JOB_GROUP_NAMES.get(light_row["group"], "")
        return one

    items = []
    for card in page:
        head = whole_row(card[0])
        if head is None:
            continue
        if len(card) > 1:
            key = card[0]["stack"]
            if key.startswith("task:"):
                about = "task " + (card[0]["tasks"].get(key[5:]) or task_name(key[5:]))
            else:
                about = "this job"
            rest = [one for one in (whole_row(r) for r in card[1:1 + STACK_DRAWN]) if one]
            head["stack"] = {
                "key": key, "about": about, "n": len(card), "ids": [r["id"] for r in card],
                "unread": sum(1 for r in card if r["state"] in (NEW, LATER)),
                "dismissed": sum(1 for r in card if r["state"] == DISMISSED),
                "rest": without_gone_items(who, rest),
            }
        items.append(head)
    items = without_gone_items(who, items)
    user_id, org_id = _ids(who)
    everyone = _model().objects.filter(user_id=user_id, org_id=org_id)
    return {
        "items": items, "total": len(shown), "cards": len(cards), "offset": offset,
        "limit": limit, "sort": sort,
        "counts": counts,
        "totals": {"unread": unread, "kept": everyone.exclude(state=DISMISSED).count(),
                   "cleared": everyone.filter(state=DISMISSED).count()},
        "grace": GRACE, "now": now,
    }


#: What a press on the page may do to many at once, and the states each moves from and to.
BULK = {
    "read": ((NEW, LATER), READ),
    "unread": ((READ,), LATER),
    "clear": ((NEW, LATER, READ), DISMISSED),
    "restore": ((DISMISSED,), READ),
}


def bulk(who, what: str, *, ids=None, match: dict | None = None,
         now: float | None = None) -> dict:
    """One press on the page, on the notices picked (`ids`) or on every one a view shows
    (`match`, the same criteria as `browse`). What each changed one was before, so the press can
    be undone (`undo`). Marked unread, one waits as put away (`later`), never as new: it is not
    news, and dropping in again it would go to the phone."""
    if what in ("seen", "later"):
        # Drawn on the page (`later`: seen there, so it waits as unread and the phone stays
        # quiet, as the stack's Later does), never undone.
        return {"count": act(who, ids, what), "changed": []}
    if what not in BULK:
        return {"count": 0, "changed": []}
    now = now or time.time()
    user_id, org_id = _ids(who)
    if match is not None:
        picked = [r["id"] for r in matching(who, match, now)][:BULK_MOST]
    else:
        try:
            picked = [int(i) for i in (ids or [])][:BULK_MOST]
        except (TypeError, ValueError):
            picked = []
    if not picked:
        return {"count": 0, "changed": []}
    since, to = BULK[what]
    rows = _model().objects.filter(user_id=user_id, org_id=org_id, id__in=picked,
                                   state__in=since)
    changed = [[i, s] for i, s in rows.values_list("id", "state")]
    if not changed:
        return {"count": 0, "changed": []}
    ids_now = [i for i, _ in changed]
    rows = _model().objects.filter(user_id=user_id, org_id=org_id, id__in=ids_now)
    if what in ("read", "clear"):
        # Anything done with it means he saw it: the phone stays quiet.
        rows.filter(phone=DUE).update(phone=SKIPPED)
        rows.filter(seen_at__isnull=True).update(seen_at=now)
    n = rows.update(state=to, handled_at=now)
    return {"count": n, "changed": changed}


def undo(who, changed) -> int:
    """Put back what one press changed (`bulk`'s `changed`): each one to the state it was in,
    a new one as put away. Only the person's own, and only to a state a notice may be in."""
    user_id, org_id = _ids(who)
    back: dict[str, list[int]] = {}
    for pair in (changed or [])[:BULK_MOST]:
        try:
            ident, state = int(pair[0]), str(pair[1])
        except (TypeError, ValueError, IndexError, KeyError):
            continue
        state = LATER if state == NEW else state
        if state in (LATER, READ, DISMISSED):
            back.setdefault(state, []).append(ident)
    n = 0
    stamp = time.time()
    for state, idents in back.items():
        n += _model().objects.filter(user_id=user_id, org_id=org_id, id__in=idents).update(
            state=state, handled_at=stamp)
    return n


# --- saying one -----------------------------------------------------------------------------


async def tell(who) -> None:
    """Every open tab of this person's, the list as it is now."""
    if hooks.push is None or who is None:
        return
    with contextlib.suppress(Exception):
        await hooks.push(who, await asyncio.to_thread(listing, who))


async def _owner():
    if hooks.owner is None:
        return None
    try:
        return await asyncio.to_thread(hooks.owner)
    except Exception:
        log.exception("whose notices these are could not be read")
        return None


def _same(a, b) -> bool:
    return a is not None and b is not None and _ids(a) == _ids(b)


async def notify(*, title: str, body: str = "", link: str = "", link_label: str = "",
                 links=(), kind: str = "", key: str = "", phone_text: str = "",
                 decision_id: int | None = None, deployed: str = "", who=None,
                 at_once: bool = False, details: str = "") -> dict | None:
    """Say one notice: on the screen now, on the phone later if it is left there.

    `who` is the install's owner when it is not given. `phone_text` is what the phone is sent
    if it comes to that, and "" for a notice that stays on the screen. Never raises; where
    the notice cannot be written at all, its phone copy is sent at once, so nothing that used
    to reach the phone is lost to a fault here. `deployed` is the commit a finished run put
    live, so a page from before that deploy offers its Reload on this notice. `links` is every
    place it leads, each a button of its own (`_links`); `link` stays the one a swipe goes to.
    `at_once` sends the phone copy now rather than after `GRACE`, for what cannot wait.
    """
    who = who if who is not None else await _owner()
    if who is None:
        log.info("a notice with nobody to give it to: %s", _cut(title, 80))
        return None
    try:
        said = await asyncio.to_thread(
            post, who, title=title, body=body, link=link, link_label=link_label, links=links,
            kind=kind, details=details,
            key=key, phone_text=phone_text, decision_id=decision_id, deployed=deployed)
    except Exception:
        log.exception("a notice could not be written; its phone copy goes now")
        if phone_text:
            await _send(phone_text)
        return None
    if said is None:
        return None
    log.info("notice %s (%s): %s", said["id"], kind or "rouh", _cut(title, 80))
    if at_once and phone_text:
        await _phone_now(who, said["id"], phone_text)
    await tell(who)
    return said


#: The last job's hand-off each person was sent at once, by site, so Rouh's own hand_over
#: of that step a moment later is not a second message for the same event (Petar's N1: one
#: notice for one event). The bank's step is covered by its purchase instead
#: (`browsing.Desk._phone_step`).
_STEPS: dict[tuple[str, str], tuple[str, float]] = {}
#: How long a job's hand-off covers the same site's hand_over.
STEP_COVERS = 300.0


def step_told(who, site: str, now: float | None = None) -> None:
    if who is not None and site:
        _STEPS[_ids(who)] = (site, now or time.time())


def step_told_lately(who, site: str, now: float | None = None) -> bool:
    if who is None or not site:
        return False
    told = _STEPS.get(_ids(who))
    return bool(told and told[0] == site and (now or time.time()) - told[1] < STEP_COVERS)


async def _phone_now(who, row_id: int, text: str) -> str:
    """A notice's phone copy sent now, claimed first so the sweeper never sends it again.
    Only the owner's: the bot reaches their phone and nobody else's."""
    owner = await _owner()
    if not _same(who, owner) or not await asyncio.to_thread(claim, row_id):
        return SKIPPED
    outcome = await _send(text)
    await asyncio.to_thread(phoned, row_id, outcome)
    if outcome == SENT:
        log.info("notice %s went to the phone at once", row_id)
    return outcome


async def phone(text: str, *, kind: str = "", key: str = "", who=None,
                title: str = "", link: str = "", phone_too: bool = True,
                whole: str = "", deployed: str = "", links=(),
                at_once: bool = False, summary: str = "", details: str = "") -> dict | None:
    """A note that was a Telegram message until 10 October 2026, as a notice first.

    The phone's own words are its title, body and link (`from_text`), and are what the phone
    is sent if the notice is left on the screen, or at once with `at_once`; with `phone_too`
    false it stays on the screen.
    `whole` is the same message with nothing cut out of it, when the phone's is a short form
    of something longer: its body is the notice's, so opening it shows every word.
    `summary` and `details`, given together, are a result said once (26 November 2026): the
    overview is the notice's body, and the details open under it; `whole` is not needed then.
    """
    shaped = from_text(text)
    if summary:
        shaped["body"] = str(summary).strip()[:BODY]
    elif whole:
        shaped["body"] = from_text(whole)["body"] or shaped["body"]
    if title:
        shaped["title"] = title
    if link:
        shaped["link"] = local_link(link)
        shaped["link_label"] = label_for(shaped["link"])
    return await notify(kind=kind, key=key, who=who, phone_text=text if phone_too else "",
                        deployed=deployed, links=links, at_once=at_once,
                        details=details if summary else "", **shaped)


async def _send(text: str) -> str:
    tg = hooks.telegram
    try:
        if tg is None or not tg.configured():
            return SKIPPED
    except Exception:
        return SKIPPED
    from .telegram import NotSent, NotSetUp

    try:
        await tg.send(text)
    except NotSetUp:
        return SKIPPED
    except NotSent as exc:
        log.warning("a notice's phone copy did not go: %s", exc)
        return FAILED
    except Exception as exc:  # noqa: BLE001 - the notice is on the screen either way
        log.warning("a notice's phone copy did not go: %s: %s", type(exc).__name__, exc)
        return FAILED
    return SENT


class Sweeper:
    """Sends the phone copies that are due, once each, across restarts."""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run(), name="notices")

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await self._task
            self._task = None

    async def _run(self) -> None:
        while True:
            await asyncio.sleep(EVERY)
            try:
                await self.once()
            except Exception:
                log.exception("notices: the phone copies could not be looked at this pass")

    async def once(self, now: float | None = None) -> int:
        rows = await asyncio.to_thread(due, now)
        if not rows:
            return 0
        owner = await _owner()
        sent = 0
        told: dict[tuple[str, str], Any] = {}
        for row in rows:
            if not await asyncio.to_thread(claim, row.id):
                continue
            who = type("Who", (), {"user_id": row.user_id, "org_id": row.org_id})()
            if not _same(who, owner):
                # The bot reaches the owner's phone and nobody else's.
                outcome = SKIPPED
            elif row.decision_id and hooks.phone_decision is not None:
                try:
                    outcome = SENT if await hooks.phone_decision(owner, row.decision_id) \
                        else SKIPPED
                except Exception:
                    log.exception("notice %s: its decision could not go to the phone", row.id)
                    outcome = FAILED
            elif row.phone_text:
                outcome = await _send(row.phone_text)
            else:
                outcome = SKIPPED
            await asyncio.to_thread(phoned, row.id, outcome)
            if outcome == SENT:
                sent += 1
                log.info("notice %s was left on the screen, so it went to the phone", row.id)
            told[_ids(who)] = owner if _same(who, owner) else who
        for who in told.values():
            await tell(who)
        return sent


__all__ = ["GRACE", "GLANCE", "Sweeper", "act", "browse", "bulk", "from_text", "hooks", "listing",
           "matching", "notify", "phone", "post", "step_told", "step_told_lately", "undo",
           "unread_count"]
