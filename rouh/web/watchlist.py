"""The Watch list page's API, at /watch: the films and shows the person keeps (`rouh/watchlist.py`).

    GET  /api/watch                      every title of theirs, in Up next's order, and the counts
    GET  /api/watch/search?q=            the titles the words may mean, looked up, best first
    GET  /api/watch/tonight?minutes=&kind=&skip=   what to put on now, best first, each with why
    POST /api/watch/new                  {"pick"?, "title"?, "status"?, "recommended_by"?, "notes"?, "where"?}
    POST /api/watch/restore              {"was"}: a title just taken off, put back
    GET  /api/watch/<n>                  one title
    POST /api/watch/<n>                  {fields}: change one
    POST /api/watch/<n>/tick             {"season", "episode"}, or {"step": true} for the next one
    POST /api/watch/<n>/front            Watch next: to the top of Up next
    POST /api/watch/<n>/again            Watch again: a watched title back to the top of Up next, its history kept
    POST /api/watch/<n>/move             {"before"}: just before another, or last
    POST /api/watch/<n>/refresh          {"pick"?}: its details looked up again
    POST /api/watch/<n>/delete           take it off; answers what it was, for Undo
    GET  /api/watch/<n>/poster           its poster, kept here

    POST /api/watch/lists/new            {"list_name", "email"?, "name"?, "role", "notify", "titles"?}: a new list,
                                         shared with that person when an email is given, else the owner's alone
    POST /api/watch/lists/<id>           {"name"}: rename it
    POST /api/watch/lists/<id>/invite    {"email", "name"?, "role", "notify"}: one more person
    POST /api/watch/lists/<id>/uninvite  {"token"}: take one person off; their link stops at once
    POST /api/watch/lists/<id>/stop      stop sharing: everybody off; the list stays, the owner's alone
    POST /api/watch/lists/<id>/delete    delete the list: everybody off, its titles back on My list

Only the signed-in person's own titles, always asked for by their organisation and account
together (`Tenancy.current`, via `who`).

**A shared list, for the person it is shared with** (step 202-03): the page at `/shared/<token>`
(`guests.reader_view`, `watch_page`), and the same routes under `/shared/<token>/watch` (`shared`),
answered as that one list of the owner's (`watchlist.Member`): never the owner's other titles,
their other lists, who else anything is shared with, or anything else of the owner's. A share that
lets them only look refuses every change; Leave this list (`/leave`) takes their share away.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time

from django.http import HttpRequest

from .common import answer, body_of, file_response, only, refuse, who

log = logging.getLogger("rouh.web.watchlist")

NO_STORE = {"Cache-Control": "no-store"}


async def _me(request):
    member = getattr(request, "_watch_member", None)
    if member is not None:
        return member
    if getattr(request, "_watch_token", None) is not None:
        return None
    me = await asyncio.to_thread(who, request)
    from rouh.web.guests import GUEST_ORG

    return None if me is None or me.org_id == GUEST_ORG else me


def _dress(me, item):
    from rouh import watchlist

    return watchlist.dressed(me, item) if item else item


def _link(path: str) -> str:
    """The whole link a person opens a share at: on this Rouh's relay address when it has one."""
    from rouh import landshare
    from rouh.config import config

    try:
        if landshare.ready():
            return landshare.link(path)
    except Exception:  # noqa: BLE001 - the plain address still opens it
        log.exception("watch list: the relay address could not be read")
    return config.public_url.rstrip("/") + path


def _data(me) -> dict:
    from rouh import landshare, watchlist

    out = watchlist.listing_for(me, link=None if isinstance(me, watchlist.Member) else _link)
    out["can_share"] = "" if isinstance(me, watchlist.Member) else landshare.refusal(me.org_id)
    return out


def _fields(body: dict) -> dict:
    keep = ("title", "kind", "year", "end_year", "runtime", "genres", "rating", "rating_from", "overview", "cast",
            "where", "where_url", "seasons", "seen", "status", "my_rating", "notes", "recommended_by", "list",
            "seen_before", "tags")
    return {k: body[k] for k in keep if k in body}


async def _told(me, number=None):
    from rouh import watchlist

    await watchlist.tell(me, number)


@only("GET")
async def listing(request: HttpRequest):
    from rouh import watchlist

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    try:
        return answer(await asyncio.to_thread(_data, me), headers=NO_STORE)
    except watchlist.NotFound as exc:
        return refuse(str(exc), 410)


@only("GET")
async def search(request: HttpRequest):
    from rouh import watchlist

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    q = str(request.GET.get("q") or "")[:120]
    try:
        found = await asyncio.to_thread(watchlist.search, q)
    except watchlist.Unreachable as exc:
        return answer({"matches": [], "offline": True, "error": str(exc)}, headers=NO_STORE)
    return answer({"matches": found, "offline": False}, headers=NO_STORE)


@only("GET")
async def tonight(request: HttpRequest):
    from rouh import watchlist

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    skip = [s for s in str(request.GET.get("skip") or "").split(",") if s.strip().isdigit()]
    picks = await asyncio.to_thread(lambda: watchlist.tonight(
        me, minutes=request.GET.get("minutes") or None, kind=str(request.GET.get("kind") or ""), skip=skip,
        most=20))
    return answer({"picks": picks}, headers=NO_STORE)


@only("POST")
async def add(request: HttpRequest):
    from rouh import watchlist

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    body = body_of(request)
    pick = body.get("pick") if isinstance(body.get("pick"), dict) else None
    fields = {k: v for k, v in _fields(body).items() if k not in ("title", "status", "seen_before")}
    try:
        item, said = await asyncio.to_thread(lambda: watchlist.add(
            me, str(body.get("title") or ""), pick=pick, via="page", status=str(body.get("status") or "to_watch"),
            lookup=bool(body.get("lookup", pick is None)), **fields))
    except ValueError as exc:
        return refuse(str(exc), 400)
    await _told(me, item["number"])
    item = await asyncio.to_thread(_dress, me, item)
    return answer({"ok": True, "item": item, "said": said}, headers=NO_STORE)


@only("POST")
async def restore(request: HttpRequest):
    from rouh import watchlist

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    try:
        item = await asyncio.to_thread(watchlist.restore, me, body_of(request).get("was"))
    except ValueError as exc:
        return refuse(str(exc), 400)
    await _told(me, item["number"])
    item = await asyncio.to_thread(_dress, me, item)
    return answer({"ok": True, "item": item}, headers=NO_STORE)


async def one(request: HttpRequest, number: int):
    """GET reads one; POST changes it."""
    from rouh import watchlist

    if request.method not in ("GET", "HEAD", "POST"):
        return refuse("Not allowed.", 405)
    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    try:
        if request.method == "POST":
            fields = _fields(body_of(request))
            item = await asyncio.to_thread(lambda: _dress(me, watchlist.change(me, number, **fields)))
            await _told(me, number)
            return answer({"ok": True, "item": item}, headers=NO_STORE)
        return answer({"item": await asyncio.to_thread(lambda: _dress(me, watchlist.one(me, number)))},
                      headers=NO_STORE)
    except watchlist.NotFound as exc:
        return refuse(str(exc), 404)
    except ValueError as exc:
        return refuse(str(exc), 400)


async def _act(request, number, do):
    from rouh import watchlist

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    body = body_of(request)
    try:
        got = await asyncio.to_thread(do, watchlist, me, number, body)
        if got.get("item"):
            got["item"] = await asyncio.to_thread(_dress, me, got["item"])
    except watchlist.NotFound as exc:
        return refuse(str(exc), 404)
    except watchlist.Unreachable as exc:
        return refuse(f"The details could not be looked up: {exc}", 502)
    except ValueError as exc:
        return refuse(str(exc), 400)
    await _told(me, number)
    return answer({"ok": True, **got}, headers=NO_STORE)


@only("POST")
async def tick(request: HttpRequest, number: int):
    def do(w, me, n, body):
        if body.get("step"):
            item, finished = w.step(me, n)
        else:
            item, finished = w.tick(me, n, body.get("season"), body.get("episode"))
        return {"item": item, "finished": finished}
    return await _act(request, number, do)


@only("POST")
async def front(request: HttpRequest, number: int):
    return await _act(request, number, lambda w, me, n, body: {"item": w.to_front(me, n)})


@only("POST")
async def again(request: HttpRequest, number: int):
    return await _act(request, number, lambda w, me, n, body: {"item": w.again(me, n)})


@only("POST")
async def move(request: HttpRequest, number: int):
    return await _act(request, number, lambda w, me, n, body: {"item": w.move(me, n, body.get("before"))})


@only("POST")
async def refresh(request: HttpRequest, number: int):
    def do(w, me, n, body):
        pick = body.get("pick") if isinstance(body.get("pick"), dict) else None
        item, said = w.refresh(me, n, pick)
        return {"item": item, "said": said}
    return await _act(request, number, do)


@only("POST")
async def delete(request: HttpRequest, number: int):
    return await _act(request, number, lambda w, me, n, body: {"was": w.delete(me, n)})


@only("GET")
async def poster(request: HttpRequest, number: int):
    from rouh import watchlist

    me = await _me(request)
    if me is None:
        return refuse("Sign in first.", 401)
    try:
        got = await asyncio.to_thread(watchlist.poster_path, me, number)
    except watchlist.NotFound as exc:
        return refuse(str(exc), 404)
    if got is None:
        return refuse("It has no poster.", 404)
    path, kind = got
    response = file_response(str(path), kind)
    response["Cache-Control"] = "private, max-age=604800"
    response["X-Content-Type-Options"] = "nosniff"
    return response


# --- shared lists: the owner's side (step 202-03) ---------------------------------------------------


async def _owner(request):
    me = await _me(request)
    from rouh import watchlist

    if me is None or isinstance(me, watchlist.Member):
        return None
    return me


async def _share_with(request, me, list_id: int, body: dict) -> dict:
    """Share one list with one person by email: the one way any share is made (`guests.share_and_tell`),
    with the letter only when `notify` says so."""
    from rouh import sharing, watchlist
    from rouh.web import guests

    email = sharing.clean_email(body.get("email"))
    if not email:
        raise ValueError("That is not an email address.")
    if email == sharing.clean_email(getattr(me, "email", "")):
        raise ValueError("That is your own address: the list is already yours.")
    row = await asyncio.to_thread(watchlist.find_list, me, list_id)
    role = "view" if body.get("role") == "view" else "edit"
    notify = body.get("notify", True) is not False
    told = await guests.share_and_tell(me, guests._owner_name(request.user), watchlist.rel_of(row.id), row.name,
                                       email, role, notify=notify,
                                       message=guests.clean_message(body.get("message")))
    if body.get("name") is not None:
        await asyncio.to_thread(watchlist.name_person, me, row.id, email, body.get("name"))
    log.info("watch list: list %s was shared with a person (%s), %s", row.id, role,
             "with no letter" if not notify else "and the letter went" if told.sent else "and the letter did not go")
    return {"said": guests.said_of(told, email), "sent": told.sent, "link": _link(told.share["path"])}


@only("POST")
async def list_new(request: HttpRequest):
    from rouh import landshare, watchlist

    me = await _owner(request)
    if me is None:
        return refuse("Sign in first.", 401)
    body = body_of(request)
    sharing_it = bool(str(body.get("email") or "").strip())
    if sharing_it:
        why = await asyncio.to_thread(landshare.refusal, me.org_id)
        if why:
            return refuse(why, 409)
    try:
        made = await asyncio.to_thread(watchlist.new_list, me, body.get("list_name"), body.get("titles") or [])
    except ValueError as exc:
        return refuse(str(exc), 400)
    if not sharing_it:
        # A list of the owner's alone (step 202-04): nobody is asked, nothing is sent.
        await _told(me)
        return answer({"ok": True, "list": made, "data": await asyncio.to_thread(_data, me)}, headers=NO_STORE)
    try:
        got = await _share_with(request, me, made["id"], body)
    except (ValueError, watchlist.NotFound) as exc:
        # Nothing half made: the list goes again, and its titles back to My list.
        await asyncio.to_thread(watchlist.stop_list, me, made["id"])
        return refuse(str(exc), 400)
    await _told(me)
    return answer({"ok": True, "list": made, **got, "data": await asyncio.to_thread(_data, me)}, headers=NO_STORE)


async def list_one(request: HttpRequest, list_id: int, act: str = ""):
    """POST /api/watch/lists/<id>[/invite|/uninvite|/stop]."""
    from rouh import watchlist
    from rouh.web import guests

    if request.method != "POST":
        return refuse("Not allowed.", 405)
    me = await _owner(request)
    if me is None:
        return refuse("Sign in first.", 401)
    body = body_of(request)
    try:
        if act == "":
            await asyncio.to_thread(watchlist.rename_list, me, list_id, body.get("name"))
            got = {}
        elif act == "invite":
            got = await _share_with(request, me, list_id, body)
        elif act == "uninvite":
            token = str(body.get("token") or "")
            people = await asyncio.to_thread(lambda: watchlist.lists_of(me))
            here = next((p for l in people if l["id"] == int(list_id) for p in l["people"] if p["token"] == token), None)
            if here is None:
                return refuse("That person is not on this list.", 404)
            from rouh.models import PageGuest

            row = await asyncio.to_thread(lambda: PageGuest.objects.filter(
                token=token, user_id=str(me.user_id), org_id=str(me.org_id)).first())
            was = {"token": row.token, "email": row.email, "role": row.role, "guest_id": row.guest_id,
                   "created_at": row.created_at, "mailed_at": row.mailed_at, "name": here.get("name") or ""} \
                if row else None
            gone = await asyncio.to_thread(guests._store().remove, me, token)
            got = {"removed": bool(gone), "was": was}
        elif act == "putback":
            got = {"back": await asyncio.to_thread(_put_back, me, int(list_id), body.get("was"))}
        elif act == "stop":
            got = {"gone": await asyncio.to_thread(watchlist.unshare_list, me, list_id)}
        elif act == "delete":
            got = {"moved": await asyncio.to_thread(watchlist.stop_list, me, list_id)}
        else:
            return refuse("Not found.", 404)
    except watchlist.NotFound as exc:
        return refuse(str(exc), 404)
    except ValueError as exc:
        return refuse(str(exc), 400)
    await _told(me)
    return answer({"ok": True, **got, "data": await asyncio.to_thread(_data, me)}, headers=NO_STORE)


def _put_back(me, list_id: int, was) -> bool:
    """Undo for taking a person off a list: their share again, with the very link they had, so a
    person who had joined does not have to join again. Only a share that is not there any more, for
    one of this owner's lists, is put back."""
    from rouh import sharing, watchlist
    from rouh.models import PageGuest, User

    row = watchlist.find_list(me, list_id)
    if not isinstance(was, dict):
        raise ValueError("Nothing to put back.")
    token = sharing.clean_token(str(was.get("token") or ""))
    email = sharing.clean_email(was.get("email"))
    if not token or not email or PageGuest.objects.filter(token=token).exists():
        raise ValueError("That person cannot be put back: invite them again.")
    guest = User.objects.filter(email__iexact=email, is_guest=True).first()
    joined = str(was.get("guest_id") or "")
    PageGuest.objects.create(token=token, user_id=str(me.user_id), org_id=str(me.org_id), rel=watchlist.rel_of(row.id),
                             title=row.name[:200], email=email, role="view" if was.get("role") == "view" else "edit",
                             guest_id=joined if guest is not None and joined == str(guest.pk) else "",
                             created_at=float(was.get("created_at") or 0) or time.time(),
                             mailed_at=was.get("mailed_at"))
    return True


# --- shared lists: the person a list is shared with (step 202-03) ----------------------------------


async def member_of(request, token: str):
    """The list a `/shared/<token>` names, for the person signed in, or None."""
    if not request.user.is_authenticated:
        return None

    def find():
        from rouh import share_ends, watchlist
        from rouh.web import guests

        share_ends.before_open(token)
        return watchlist.member_for(guests._store().find(token), request.user)
    return await asyncio.to_thread(find)


_ITEM = re.compile(r"^(\d+)(?:/(tick|front|again|move|refresh|delete|poster))?$")


async def shared(request: HttpRequest, token: str, rest: str = ""):
    """Every route of a shared list, for the person it is shared with: the owner's own handlers,
    answered as that one list (`_me`)."""
    member = await member_of(request, token)
    request._watch_token = token
    if member is None:
        return refuse("This list is not shared with you any more.", 403 if request.user.is_authenticated else 401)
    request._watch_member = member
    rest = rest.strip("/")
    if request.method == "POST" and rest != "leave" and not member.can_change:
        return refuse("You can only look at this list: ask whoever shared it to let you add and tick.", 403)
    if rest == "":
        return await listing(request)
    if rest == "search":
        return await search(request)
    if rest == "new":
        return await add(request)
    if rest == "restore":
        return await restore(request)
    if rest == "leave":
        return await leave(request, member)
    found = _ITEM.match(rest)
    if not found:
        return refuse("Not found.", 404)
    number, act = int(found.group(1)), found.group(2) or ""
    if act == "move":
        return refuse("Not found.", 404)
    handler = {"": one, "tick": tick, "front": front, "again": again, "refresh": refresh, "delete": delete, "poster": poster}[act]
    return await handler(request, number)


async def leave(request, member):
    """Leave this list: the person's own share goes, at once. Their ratings and notes stay on it."""
    from rouh.web import guests

    if request.method != "POST":
        return refuse("Not allowed.", 405)
    gone = await asyncio.to_thread(guests._store().remove, member, member.token)
    await _told(member)
    log.info("watch list: a person left list %s", member.list_id)
    return answer({"ok": True, "left": bool(gone)}, headers=NO_STORE)
