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
    POST /api/watch/<n>/move             {"before"}: just before another, or last
    POST /api/watch/<n>/refresh          {"pick"?}: its details looked up again
    POST /api/watch/<n>/delete           take it off; answers what it was, for Undo
    GET  /api/watch/<n>/poster           its poster, kept here

Only the signed-in person's own titles, always asked for by their organisation and account
together (`Tenancy.current`, via `who`).
"""
from __future__ import annotations

import asyncio
import logging

from django.http import HttpRequest

from .common import answer, body_of, file_response, only, refuse, who

log = logging.getLogger("rouh.web.watchlist")

NO_STORE = {"Cache-Control": "no-store"}


async def _me(request):
    return await asyncio.to_thread(who, request)


def _fields(body: dict) -> dict:
    keep = ("title", "kind", "year", "end_year", "runtime", "genres", "rating", "rating_from", "overview", "cast",
            "where", "where_url", "seasons", "seen", "status", "my_rating", "notes", "recommended_by")
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
    return answer(await asyncio.to_thread(watchlist.listing, me), headers=NO_STORE)


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
    fields = {k: v for k, v in _fields(body).items() if k not in ("title", "status")}
    try:
        item, said = await asyncio.to_thread(lambda: watchlist.add(
            me, str(body.get("title") or ""), pick=pick, via="page", status=str(body.get("status") or "to_watch"),
            lookup=bool(body.get("lookup", pick is None)), **fields))
    except ValueError as exc:
        return refuse(str(exc), 400)
    await _told(me, item["number"])
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
            item = await asyncio.to_thread(lambda: watchlist.change(me, number, **fields))
            await _told(me, number)
            return answer({"ok": True, "item": item}, headers=NO_STORE)
        return answer({"item": await asyncio.to_thread(watchlist.one, me, number)}, headers=NO_STORE)
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
