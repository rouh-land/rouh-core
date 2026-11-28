"""The watch list: the films and shows the person wants to watch, is watching and has watched.

The owner, 28 November 2026, of the list Rouh had kept for them as a task page the day before: "I
want the watch list to be a full feature in the navigation. with all the bells and whistles you
could have." So it is a screen of its own, at `/watch` (`watchlistpage.js`), one title at
`/watch/<number>`, and a tool of Rouh's, `watch_list`, so it is kept by voice as well:

- **A title is added by its name.** The page offers the matches as the person types, each with its
  poster, year, kind and cast, because one name is often several titles ("Ancient Apocalypse" is a
  2001, a 2021 and a 2022 series). Picking one looks its details up; a name with no match, or with
  the lookup out of reach, is added as it was typed, and its details are filled in by hand or looked
  up again later.
- **Details are looked up from public sources, with no account and no key**: the matches and the
  poster from IMDb's own search suggestions, a show's seasons, episodes, genres, runtime, rating and
  the service it was made for from TVmaze, and a film's length, genres and summary from Wikidata and
  Wikipedia. `ROUH_WATCH_LOOKUP` points all of them at one stand-in (`rouh/testing/fake_watch.py`).
  Nothing about the person is sent: only the words of a title, or its IMDb number.
- **The poster is kept here**, in the data directory, and served from Rouh's own address, so the
  page asks nothing of another site and a poster never breaks when its source moves.
- **Three statuses**: to watch, watching, watched. Ticking an episode starts a show; ticking its last
  episode marks it watched. Each title keeps the person's own rating (1 to 5), notes and who
  recommended it, and its place in Up next.
- **Tonight** is worked out in code, never by a model: the show they are in the middle of, with its
  next episode, first, then Up next in their order, each within the time they have (`tonight`).

Only the person's own titles, always asked for by their organisation and account together.
"""
from __future__ import annotations

import difflib
import html
import json
import logging
import os
import re
import secrets
import time
import unicodedata
import urllib.parse
from pathlib import Path

log = logging.getLogger("rouh.watchlist")

#: The kinds of title, and what the page calls each.
KINDS = {"film": "Film", "show": "Show", "miniseries": "Mini-series", "documentary": "Documentary"}
#: Kinds that have seasons and episodes.
SERIAL = {"show", "miniseries", "documentary"}
#: The three statuses, in order, and what the page calls each.
STATUSES = {"to_watch": "To watch", "watching": "Watching", "watched": "Watched"}

TITLE_MOST = 300
TEXT_MOST = 4000
SEASONS_MOST = 60
EPISODES_MOST = 400
POSTER_MOST = 4_000_000

#: Where the lookups go. One stand-in takes all of them in a test world.
_BASE = os.environ.get("ROUH_WATCH_LOOKUP", "").rstrip("/")
IMDB = f"{_BASE}/imdb" if _BASE else "https://v3.sg.media-imdb.com"
TVMAZE = f"{_BASE}/tvmaze" if _BASE else "https://api.tvmaze.com"
WIKIDATA = f"{_BASE}/wikidata/sparql" if _BASE else "https://query.wikidata.org/sparql"
WIKIPEDIA = f"{_BASE}/wikipedia" if _BASE else "https://en.wikipedia.org"
TIMEOUT = 8.0
AGENT = "Rouh watch list (https://github.com/rouh-land/rouh-core)"

#: IMDb's kinds, as the list's.
_IMDB_KINDS = {"movie": "film", "tvMovie": "film", "short": "film", "video": "film", "tvSpecial": "film",
               "tvSeries": "show", "tvMiniSeries": "miniseries"}


class NotFound(LookupError):
    pass


class Unreachable(RuntimeError):
    """A lookup could not be made: the service did not answer, or not usefully."""


# --- whose ---------------------------------------------------------------------------------------


def _mine(who):
    from .models import WatchItem

    return WatchItem.objects.filter(org_id=str(who.org_id), user_id=str(who.user_id))


def _get(who, number):
    try:
        number = int(str(number).strip().lstrip("#"))
    except (TypeError, ValueError):
        raise NotFound("Which title? Give its number.") from None
    item = _mine(who).filter(number=number).first()
    if item is None:
        raise NotFound(f"There is no title {number} on the watch list.")
    return item


def _data_dir() -> Path:
    from .config import config

    return Path(config.data_dir)


def _poster_dir(who) -> Path:
    safe = lambda s: re.sub(r"[^A-Za-z0-9_-]", "_", str(s))[:80] or "_"  # noqa: E731
    return _data_dir() / "watchlist" / safe(who.org_id) / safe(who.user_id)


def poster_path(who, number) -> tuple[Path, str] | None:
    """The poster's file of one title, and its type, or None when it has none."""
    item = _get(who, number)
    if not item.poster:
        return None
    path = _poster_dir(who) / Path(item.poster).name
    if not path.is_file():
        return None
    kind = {"png": "image/png", "webp": "image/webp"}.get(path.suffix.lstrip(".").lower(), "image/jpeg")
    return path, kind


# --- what a title is -------------------------------------------------------------------------------


def _int(v, lo=None, hi=None):
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    if lo is not None and n < lo:
        return None
    if hi is not None and n > hi:
        return None
    return n


def _clean_seasons(value) -> list[dict]:
    out = []
    for i, s in enumerate(value or []):
        if not isinstance(s, dict):
            continue
        n = _int(s.get("n"), 0, 999)
        n = n if n is not None else i + 1
        eps = _int(s.get("episodes"), 0, EPISODES_MOST) or 0
        out.append({"n": n, "name": str(s.get("name") or "")[:120], "episodes": eps,
                    "year": _int(s.get("year"), 1880, 2200)})
        if len(out) >= SEASONS_MOST:
            break
    out.sort(key=lambda s: s["n"])
    return out


def _clean_seen(value, seasons) -> dict:
    by_n = {str(s["n"]): s["episodes"] for s in seasons}
    out = {}
    for k, v in (value or {}).items():
        n = _int(v, 0, EPISODES_MOST)
        k = str(k)
        if n is None or k not in by_n:
            continue
        top = by_n[k] or EPISODES_MOST
        if n:
            out[k] = min(n, top)
    return out


def episodes_total(item) -> int:
    return sum(s.get("episodes") or 0 for s in (item.seasons or []))


def episodes_seen(item) -> int:
    seasons = {str(s["n"]): s.get("episodes") or 0 for s in (item.seasons or [])}
    return sum(min(int(v), seasons.get(k, 0) or int(v)) for k, v in (item.seen or {}).items())


def next_episode(item) -> dict | None:
    """The next episode not seen, as {"season", "episode", "name"}, or None when all are, or it has none."""
    if item.kind not in SERIAL:
        return None
    for s in item.seasons or []:
        eps = s.get("episodes") or 0
        had = int((item.seen or {}).get(str(s["n"]), 0) or 0)
        if eps and had < eps:
            return {"season": s["n"], "episode": had + 1, "name": s.get("name") or ""}
    return None


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode() or str(text or "")
    return re.sub(r"[^a-z0-9а-я]+", " ", text.lower()).strip()


def links(item) -> dict:
    """Where to look further: where it streams in Bulgaria, its trailer, its IMDb page."""
    q = item.title + (f" {item.year}" if item.year else "")
    return {
        "where_find": "https://www.justwatch.com/bg/search?q=" + urllib.parse.quote(item.title),
        "trailer": "https://www.youtube.com/results?search_query=" + urllib.parse.quote(q + " trailer"),
        "imdb": f"https://www.imdb.com/title/{item.imdb_id}/" if item.imdb_id else "",
        "wiki": item.wiki_url or "",
    }


def view(item) -> dict:
    """A title as the page draws it."""
    nxt = next_episode(item)
    years = ""
    if item.year:
        years = str(item.year)
        if item.kind in SERIAL and item.end_year and item.end_year != item.year:
            years = f"{item.year}-{item.end_year}"
    return {
        "number": item.number, "title": item.title, "kind": item.kind, "kind_said": KINDS.get(item.kind, item.kind),
        "year": item.year, "end_year": item.end_year, "years": years,
        "seasons": item.seasons or [], "runtime": item.runtime, "genres": item.genres or [],
        "rating": item.rating, "rating_from": item.rating_from, "overview": item.overview, "cast": item.cast,
        "where": item.where, "where_url": item.where_url,
        "poster": (f"/api/watch/{item.number}/poster?v={int(item.updated_at)}" if item.poster else ""),
        "imdb_id": item.imdb_id, "status": item.status, "status_said": STATUSES.get(item.status, item.status),
        "seen": item.seen or {}, "episodes": episodes_total(item), "episodes_seen": episodes_seen(item),
        "next": nxt, "my_rating": item.my_rating, "notes": item.notes, "recommended_by": item.recommended_by,
        "rank": item.rank, "added_via": item.added_via, "added_at": item.added_at, "updated_at": item.updated_at,
        "started_at": item.started_at, "watched_at": item.watched_at, "looked_up": bool(item.looked_up_at),
        "links": links(item),
    }


# --- reading -------------------------------------------------------------------------------------


def counts(who) -> dict:
    out = {k: 0 for k in STATUSES}
    for status in _mine(who).values_list("status", flat=True):
        out[status] = out.get(status, 0) + 1
    out["all"] = sum(out[k] for k in STATUSES)
    return out


def listing(who) -> dict:
    """Every title of theirs, in Up next's order, and the counts."""
    every = [view(i) for i in _mine(who).order_by("rank", "number")]
    return {"items": every, "counts": counts(who), "kinds": KINDS, "statuses": STATUSES}


def one(who, number) -> dict:
    return view(_get(who, number))


def find(who, words: str):
    """The title of theirs the words name: its number ("3", "#3"), its name, or close to it."""
    words = str(words or "").strip()
    if not words:
        raise NotFound("Which title?")
    if re.fullmatch(r"#?\d+", words):
        return _get(who, words)
    want = _norm(words)
    items = list(_mine(who))
    for item in items:
        if _norm(item.title) == want:
            return item
    hits = [i for i in items if want and (want in _norm(i.title) or _norm(i.title) in want)]
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        hits.sort(key=lambda i: abs(len(_norm(i.title)) - len(want)))
        return hits[0]
    close = difflib.get_close_matches(want, [_norm(i.title) for i in items], n=1, cutoff=0.72)
    if close:
        return next(i for i in items if _norm(i.title) == close[0])
    raise NotFound(f"\"{words}\" is not on the watch list.")


# --- the lookups -----------------------------------------------------------------------------------


def _http(url: str, *, params: dict | None = None, accept: str = "application/json", raw: bool = False):
    import httpx

    try:
        r = httpx.get(url, params=params, timeout=TIMEOUT, follow_redirects=True,
                      headers={"User-Agent": AGENT, "Accept": accept})
    except httpx.HTTPError as exc:
        raise Unreachable(f"{urllib.parse.urlsplit(url).netloc or url} did not answer ({type(exc).__name__}).") from exc
    if r.status_code == 404:
        return None
    if r.status_code >= 400:
        raise Unreachable(f"{urllib.parse.urlsplit(url).netloc} answered {r.status_code}.")
    if raw:
        return r
    try:
        return r.json()
    except ValueError as exc:
        raise Unreachable(f"{urllib.parse.urlsplit(url).netloc} did not answer in JSON.") from exc


def _imdb_poster(url: str) -> str:
    """An IMDb poster at about 500 pixels wide rather than its full size."""
    if not url:
        return ""
    return re.sub(r"\._V1_[^/]*\.(jpg|png)$", r"._V1_SX500.\1", url) if "._V1_" in url else url


def search(q: str, most: int = 8) -> list[dict]:
    """The titles the words may mean, best first: {key, imdb_id, title, year, years, kind, kind_said, cast, poster}.

    Raises `Unreachable` when no source answered."""
    q = re.sub(r"\s+", " ", str(q or "")).strip()[:120]
    if len(q) < 2:
        return []
    out: list[dict] = []
    err = None
    try:
        slug = urllib.parse.quote(q.lower())
        got = _http(f"{IMDB}/suggestion/x/{slug}.json") or {}
        for r in got.get("d") or []:
            kind = _IMDB_KINDS.get(r.get("qid") or "")
            if not kind or not str(r.get("id") or "").startswith("tt"):
                continue
            image = (r.get("i") or {}).get("imageUrl") or ""
            out.append({"key": r["id"], "imdb_id": r["id"], "title": str(r.get("l") or "")[:TITLE_MOST],
                        "year": _int(r.get("y")), "years": str(r.get("yr") or r.get("y") or ""),
                        "kind": kind, "kind_said": KINDS[kind], "cast": str(r.get("s") or "")[:200],
                        "poster": _imdb_poster(image)})
    except Unreachable as exc:
        err = exc
    if not out:
        try:
            got = _http(f"{TVMAZE}/search/shows", params={"q": q}) or []
            for r in got:
                s = r.get("show") or {}
                imdb = ((s.get("externals") or {}).get("imdb") or "")
                kind = "documentary" if s.get("type") == "Documentary" else "show"
                out.append({"key": imdb or f"tvmaze:{s.get('id')}", "imdb_id": imdb, "tvmaze_id": s.get("id"),
                            "title": str(s.get("name") or "")[:TITLE_MOST],
                            "year": _int(str(s.get("premiered") or "")[:4]),
                            "years": str(s.get("premiered") or "")[:4], "kind": kind, "kind_said": KINDS[kind],
                            "cast": ((s.get("webChannel") or {}).get("name") or (s.get("network") or {}).get("name") or ""),
                            "poster": (s.get("image") or {}).get("medium") or ""})
        except Unreachable as exc:
            if err is not None or not out:
                raise Unreachable(str(err or exc)) from exc
    return out[:most]


def _strip_html(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(text or "")))).strip()


def _tvmaze(imdb_id: str = "", tvmaze_id=None) -> dict:
    """A show's details from TVmaze, or {} when it does not know it."""
    show = None
    if tvmaze_id:
        show = _http(f"{TVMAZE}/shows/{int(tvmaze_id)}")
    elif imdb_id:
        show = _http(f"{TVMAZE}/lookup/shows", params={"imdb": imdb_id})
    if not show or not show.get("id"):
        return {}
    seasons = []
    for s in _http(f"{TVMAZE}/shows/{int(show['id'])}/seasons") or []:
        if not _int(s.get("number")):
            continue
        seasons.append({"n": s["number"], "name": str(s.get("name") or "")[:120],
                        "episodes": _int(s.get("episodeOrder"), 0, EPISODES_MOST) or 0,
                        "year": _int(str(s.get("premiereDate") or "")[:4])})
    web = (show.get("webChannel") or {}).get("name") or ""
    net = (show.get("network") or {}).get("name") or ""
    rating = (show.get("rating") or {}).get("average")
    kind = "documentary" if show.get("type") == "Documentary" else "show"
    return {
        "tvmaze_id": show["id"], "kind": kind, "seasons": seasons,
        "runtime": _int(show.get("averageRuntime") or show.get("runtime"), 1, 1000),
        "genres": [str(g)[:40] for g in (show.get("genres") or [])][:6],
        "rating": float(rating) if rating else None, "rating_from": "TVmaze" if rating else "",
        "overview": _strip_html(show.get("summary"))[:TEXT_MOST],
        "where": web or net, "where_url": (show.get("officialSite") or "") if web else "",
        "year": _int(str(show.get("premiered") or "")[:4]),
        "end_year": _int(str(show.get("ended") or "")[:4]),
        "poster": (show.get("image") or {}).get("original") or (show.get("image") or {}).get("medium") or "",
        "imdb_id": ((show.get("externals") or {}).get("imdb") or imdb_id or ""),
    }


_GENRE_TAIL = re.compile(r"\s+(film|television series|series|movie)$", re.IGNORECASE)


def _wikidata(imdb_id: str) -> dict:
    """A title's length, genres and English Wikipedia article from Wikidata, by its IMDb number."""
    if not re.fullmatch(r"tt\d{5,12}", imdb_id or ""):
        return {}
    query = (
        "SELECT ?duration ?genreLabel ?article WHERE { ?item wdt:P345 \"%s\". "
        "OPTIONAL { ?item wdt:P2047 ?duration } OPTIONAL { ?item wdt:P136 ?genre } "
        "OPTIONAL { ?article schema:about ?item; schema:isPartOf <https://en.wikipedia.org/> } "
        "SERVICE wikibase:label { bd:serviceParam wikibase:language \"en\" } } LIMIT 40" % imdb_id)
    got = _http(WIKIDATA, params={"query": query, "format": "json"}, accept="application/sparql-results+json") or {}
    rows = (got.get("results") or {}).get("bindings") or []
    out: dict = {"genres": []}
    for row in rows:
        if "duration" in row and not out.get("runtime"):
            out["runtime"] = _int(float(row["duration"]["value"]), 1, 1000)
        if "article" in row and not out.get("wiki_url"):
            out["wiki_url"] = row["article"]["value"]
        g = (row.get("genreLabel") or {}).get("value") or ""
        if g and not g.startswith("Q"):
            g = _GENRE_TAIL.sub("", g).strip()
            g = g[:1].upper() + g[1:]
            if g and g not in out["genres"]:
                out["genres"].append(g)
    out["genres"] = out["genres"][:6]
    return out


def _wikipedia(article_url: str) -> str:
    """The first lines of an English Wikipedia article."""
    title = article_url.rsplit("/wiki/", 1)[-1] if "/wiki/" in article_url else ""
    if not title:
        return ""
    got = _http(f"{WIKIPEDIA}/api/rest_v1/page/summary/{title}") or {}
    return str(got.get("extract") or "")[:TEXT_MOST]


def details(pick: dict) -> dict:
    """Everything that can be looked up for one match of `search`: whatever answers, the rest left out.

    Raises `Unreachable` only when nothing at all answered."""
    imdb_id = str(pick.get("imdb_id") or "")
    kind = pick.get("kind") or "film"
    got: dict = {k: pick[k] for k in ("title", "year", "kind", "cast", "imdb_id") if pick.get(k)}
    poster = pick.get("poster") or ""
    answered = False
    failures = []
    if kind in SERIAL or pick.get("tvmaze_id"):
        try:
            tv = _tvmaze(imdb_id, pick.get("tvmaze_id"))
            answered = True
            if tv:
                poster = poster or tv.pop("poster", "")
                tv.pop("poster", None)
                if kind == "miniseries" and tv.get("kind") == "show":
                    tv["kind"] = "miniseries"
                got.update({k: v for k, v in tv.items() if v not in (None, "", [])})
        except Unreachable as exc:
            failures.append(str(exc))
    if imdb_id:
        try:
            wd = _wikidata(imdb_id)
            answered = True
            if wd.get("runtime") and not got.get("runtime"):
                got["runtime"] = wd["runtime"]
            if wd.get("genres") and not got.get("genres"):
                got["genres"] = wd["genres"]
            if wd.get("wiki_url"):
                got["wiki_url"] = wd["wiki_url"]
                if not got.get("overview"):
                    try:
                        got["overview"] = _wikipedia(wd["wiki_url"])
                    except Unreachable as exc:
                        failures.append(str(exc))
        except Unreachable as exc:
            failures.append(str(exc))
    if not answered and failures:
        raise Unreachable(failures[0])
    got["poster_from"] = poster
    return got


def _fetch_poster(who, url: str) -> str:
    """Download a poster into the person's folder; its file name, or "" when it could not be had."""
    if not url or not url.startswith(("http://", "https://")):
        return ""
    try:
        r = _http(url, accept="image/*", raw=True)
    except Unreachable as exc:
        log.info("a poster could not be fetched: %s", exc)
        return ""
    if r is None:
        return ""
    kind = (r.headers.get("content-type") or "").split(";")[0].strip().lower()
    ext = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp"}.get(kind)
    body = r.content
    if not ext or not body or len(body) > POSTER_MOST:
        return ""
    name = f"{secrets.token_hex(8)}.{ext}"
    try:
        folder = _poster_folder(who)
        (folder / name).write_bytes(body)
        _hand_to_owner(folder / name)
    except OSError as exc:
        # A poster is a nicety: a folder Rouh cannot write must never stop a title being added.
        log.warning("a poster could not be saved, so the title is kept without one: %s", exc)
        return ""
    return name


def _hand_to_owner(path: Path) -> None:
    """When run as root (a command in a shell of the core), give what it made to the data folder's owner.

    The server runs as that owner; a poster folder left root's could not be written by it again
    (28 November 2026: every add answered 500 after the first title was brought over by hand)."""
    if os.geteuid() != 0:
        return
    try:
        top = _data_dir().stat()
        if top.st_uid != 0:
            os.chown(path, top.st_uid, top.st_gid)
    except OSError as exc:
        log.warning("could not hand %s to the data folder's owner: %s", path, exc)


def _poster_folder(who) -> Path:
    """The person's poster folder, made if it is not there, each new level the data folder owner's."""
    folder = _poster_dir(who)
    top = _data_dir()
    level = top
    for part in folder.relative_to(top).parts:
        level = level / part
        if not level.is_dir():
            level.mkdir(exist_ok=True)
        _hand_to_owner(level)
    return folder


# --- writing -------------------------------------------------------------------------------------


_TEXT_FIELDS = {"title": TITLE_MOST, "overview": TEXT_MOST, "cast": 400, "where": 120, "where_url": 600,
                "notes": TEXT_MOST, "recommended_by": 200}


def _apply(item, fields: dict) -> None:
    """Put the fields given onto a title, each checked; the rest are left as they are."""
    for name, most in _TEXT_FIELDS.items():
        if name in fields and fields[name] is not None:
            value = re.sub(r"[ \t]+", " ", str(fields[name])).strip()[:most]
            if name == "title" and not value:
                raise ValueError("A title needs a name.")
            if name == "where_url" and value and not value.startswith(("http://", "https://")):
                value = ""
            setattr(item, name, value)
    if "kind" in fields and fields["kind"]:
        if fields["kind"] not in KINDS:
            raise ValueError(f"A title is one of: {', '.join(KINDS)}.")
        item.kind = fields["kind"]
    for name in ("year", "end_year"):
        if name in fields:
            setattr(item, name, _int(fields[name], 1880, 2200))
    if "runtime" in fields:
        item.runtime = _int(fields["runtime"], 1, 1000)
    if "rating" in fields:
        try:
            r = float(fields["rating"]) if fields["rating"] not in (None, "") else None
        except (TypeError, ValueError):
            r = None
        item.rating = r if r is None or 0 <= r <= 10 else None
    if "rating_from" in fields and fields["rating_from"] is not None:
        item.rating_from = str(fields["rating_from"])[:40]
    if "genres" in fields and fields["genres"] is not None:
        g = fields["genres"]
        if isinstance(g, str):
            g = [x for x in re.split(r"\s*,\s*", g) if x]
        item.genres = [str(x).strip()[:40] for x in g if str(x).strip()][:8]
    if "seasons" in fields and fields["seasons"] is not None:
        item.seasons = _clean_seasons(fields["seasons"])
        item.seen = _clean_seen(item.seen, item.seasons)
    if "my_rating" in fields:
        item.my_rating = _int(fields["my_rating"], 1, 5)
    if "imdb_id" in fields and fields["imdb_id"] is not None:
        v = str(fields["imdb_id"]).strip()
        item.imdb_id = v if re.fullmatch(r"tt\d{5,12}", v) else ""
    if "tvmaze_id" in fields:
        item.tvmaze_id = _int(fields["tvmaze_id"], 1)
    if "wiki_url" in fields and fields["wiki_url"] is not None:
        v = str(fields["wiki_url"]).strip()
        item.wiki_url = v if v.startswith("https://") else ""
    if "seen" in fields and isinstance(fields["seen"], dict):
        item.seen = _clean_seen(fields["seen"], item.seasons or [])
    if "status" in fields and fields["status"]:
        if fields["status"] == "watched" and item.kind in SERIAL and item.seasons and "seen" not in fields:
            item.seen = {str(s["n"]): s["episodes"] for s in item.seasons if s.get("episodes")}
        _set_status(item, fields["status"])


def _set_status(item, status: str) -> None:
    if status not in STATUSES:
        raise ValueError(f"A title is one of: {', '.join(STATUSES.values()).lower()}.")
    now = time.time()
    if status == item.status:
        return
    item.status = status
    if status == "watching" and not item.started_at:
        item.started_at = now
    if status == "watched":
        item.watched_at = now
        item.started_at = item.started_at or now
    elif item.watched_at:
        item.watched_at = None


def _next_number(who) -> int:
    from django.db.models import Max

    return int(_mine(who).aggregate(top=Max("number"))["top"] or 0) + 1


def _first_rank(who) -> float:
    from django.db.models import Min

    low = _mine(who).aggregate(low=Min("rank"))["low"]
    return (low if low is not None else 1.0) - 1.0


def _last_rank(who) -> float:
    from django.db.models import Max

    top = _mine(who).aggregate(top=Max("rank"))["top"]
    return (top if top is not None else 0.0) + 1.0


def add(who, title: str = "", *, pick: dict | None = None, via: str = "page", status: str = "to_watch",
        lookup: bool = True, **fields) -> tuple[dict, str]:
    """Add one title: by a match of `search` (`pick`), looked up, or by its name alone.

    With a name and `lookup`, the best match of `search` is taken when its name is the name asked
    for. Returns the title's view and a line saying what could not be looked up, or "".
    """
    from django.db import IntegrityError, transaction

    from .models import WatchItem

    title = str(title or (pick or {}).get("title") or "").strip()
    if not title:
        raise ValueError("A title needs a name.")
    said = ""
    found: dict = {}
    if pick is None and lookup:
        try:
            matches = search(title, most=8)
            want = _norm(title)
            year = _int(fields.get("year"))
            same = [m for m in matches if _norm(m["title"]) == want and (not year or m.get("year") == year)]
            kind = fields.get("kind")
            if kind:
                same = [m for m in same if (m["kind"] in SERIAL) == (kind in SERIAL)] or same
            pick = same[0] if same else None
            if pick is None:
                said = "No exact match was found, so it was added by its name alone."
        except Unreachable as exc:
            said = f"The details could not be looked up ({exc}), so it was added by its name alone."
    if pick is not None:
        try:
            found = details(pick)
        except Unreachable as exc:
            found = {k: pick[k] for k in ("title", "year", "kind", "cast", "imdb_id") if pick.get(k)}
            found["poster_from"] = pick.get("poster") or ""
            said = f"Only some details could be looked up ({exc})."
    now = time.time()
    with transaction.atomic():
        for _ in range(5):
            item = WatchItem(org_id=str(who.org_id), user_id=str(who.user_id), number=_next_number(who),
                             title=title[:TITLE_MOST], added_via=str(via or "page")[:20], added_at=now,
                             updated_at=now, rank=_last_rank(who))
            _apply(item, {**{k: v for k, v in found.items() if k not in ("poster_from",)},
                          **{k: v for k, v in fields.items() if v not in (None, "")}})
            if pick is not None and found:
                item.looked_up_at = now
                item.title = str(fields.get("title") or found.get("title") or title)[:TITLE_MOST]
            item.poster_from = str(found.get("poster_from") or "")[:600]
            _set_status(item, status or "to_watch")
            try:
                with transaction.atomic():
                    item.save()
                break
            except IntegrityError:
                continue
        else:
            raise ValueError("The title could not be numbered; try again.")
    if item.poster_from:
        name = _fetch_poster(who, item.poster_from)
        if name:
            item.poster = name
            item.save(update_fields=["poster"])
    return view(item), said


def change(who, number, **fields) -> dict:
    item = _get(who, number)
    _apply(item, fields)
    item.updated_at = time.time()
    item.save()
    return view(item)


def tick(who, number, season, episode) -> tuple[dict, bool]:
    """Seen up to this episode of this season (0 for none of it): the seasons before it are seen whole.

    Starts a show that was to watch, and marks it watched once its last episode is seen. Returns the
    title and whether this marked it watched."""
    item = _get(who, number)
    if item.kind not in SERIAL or not item.seasons:
        raise ValueError("Only a show with seasons has episodes to tick.")
    season = _int(season, 0, 999)
    episode = _int(episode, 0, EPISODES_MOST)
    by_n = {s["n"]: s for s in item.seasons}
    if season not in by_n or episode is None:
        raise ValueError("There is no such episode.")
    top = by_n[season].get("episodes") or EPISODES_MOST
    episode = min(episode, top)
    seen = {}
    for s in item.seasons:
        if s["n"] < season:
            seen[str(s["n"])] = s.get("episodes") or 0
        elif s["n"] == season and episode:
            seen[str(s["n"])] = episode
        elif s["n"] > season:
            had = int((item.seen or {}).get(str(s["n"]), 0) or 0)
            if had and episode >= top:
                seen[str(s["n"])] = had
    item.seen = {k: v for k, v in seen.items() if v}
    finished = False
    if next_episode(item) is None and episodes_total(item):
        if item.status != "watched":
            _set_status(item, "watched")
            finished = True
    elif item.seen and item.status == "to_watch":
        _set_status(item, "watching")
    elif item.status == "watched" and next_episode(item) is not None:
        _set_status(item, "watching")
    item.updated_at = time.time()
    item.save()
    return view(item), finished


def step(who, number) -> tuple[dict, bool]:
    """One episode more: the next one not seen."""
    item = _get(who, number)
    nxt = next_episode(item)
    if nxt is None:
        raise ValueError("Every episode is already seen." if episodes_total(item) else
                         "This title has no episodes to tick.")
    return tick(who, number, nxt["season"], nxt["episode"])


def to_front(who, number) -> dict:
    """Watch next: the title goes to the top of Up next."""
    item = _get(who, number)
    item.rank = _first_rank(who)
    item.updated_at = time.time()
    item.save(update_fields=["rank", "updated_at"])
    return view(item)


def move(who, number, before) -> dict:
    """Put a title just before another in Up next (`before` None: last)."""
    item = _get(who, number)
    if before in (None, "", 0):
        item.rank = _last_rank(who)
    else:
        ahead = _get(who, before)
        prev = (_mine(who).filter(rank__lt=ahead.rank).exclude(number=item.number)
                .order_by("-rank").values_list("rank", flat=True).first())
        item.rank = (ahead.rank - 1.0) if prev is None else (prev + ahead.rank) / 2.0
    item.updated_at = time.time()
    item.save(update_fields=["rank", "updated_at"])
    return view(item)


def refresh(who, number, pick: dict | None = None) -> tuple[dict, str]:
    """Look a title's details up again, by its IMDb number or a new match; the person's own are kept."""
    item = _get(who, number)
    if pick is None:
        if item.imdb_id or item.tvmaze_id:
            pick = {"imdb_id": item.imdb_id, "tvmaze_id": item.tvmaze_id, "kind": item.kind,
                    "title": item.title, "year": item.year}
        else:
            matches = search(item.title + (f" {item.year}" if item.year else ""), most=5) or search(item.title)
            want = _norm(item.title)
            pick = next((m for m in matches if _norm(m["title"]) == want), None)
            if pick is None:
                return view(item), "No match was found for it."
    found = details(pick)
    # A film's poster comes from its IMDb match, not from the sources asked again here: keep the one it was added with.
    poster_from = found.pop("poster_from", "") or item.poster_from or ""
    keep = {"status", "seen", "my_rating", "notes", "recommended_by", "where", "where_url", "rank"}
    if item.where:
        found.pop("where", None)
        found.pop("where_url", None)
    found.pop("title", None)
    _apply(item, {k: v for k, v in found.items() if k not in keep})
    item.looked_up_at = item.updated_at = time.time()
    if poster_from and poster_from != item.poster_from or (poster_from and not item.poster):
        name = _fetch_poster(who, poster_from)
        if name:
            item.poster, item.poster_from = name, poster_from
    item.save()
    return view(item), ""


def delete(who, number) -> dict:
    """Take a title off the list; what it was is given back, so it can be put back (`restore`)."""
    item = _get(who, number)
    was = view(item)
    was["_poster_file"] = item.poster
    was["_poster_from"] = item.poster_from
    was["_tvmaze_id"] = item.tvmaze_id
    was["_wiki_url"] = item.wiki_url
    was["_looked_up_at"] = item.looked_up_at
    item.delete()
    return was


def restore(who, was: dict) -> dict:
    """Put back a title that was just taken off, as it was, with its number when that is still free."""
    from .models import WatchItem

    if not isinstance(was, dict) or not str(was.get("title") or "").strip():
        raise ValueError("Nothing to put back.")
    number = _int(was.get("number"), 1)
    if number is None or _mine(who).filter(number=number).exists():
        number = _next_number(who)
    now = time.time()
    item = WatchItem(org_id=str(who.org_id), user_id=str(who.user_id), number=number, title="x",
                     added_at=float(was.get("added_at") or now), updated_at=now,
                     rank=float(was.get("rank") or _last_rank(who)), added_via=str(was.get("added_via") or "page")[:20])
    _apply(item, {k: was.get(k) for k in ("title", "kind", "year", "end_year", "runtime", "rating", "rating_from",
                                          "genres", "seasons", "overview", "cast", "where", "where_url",
                                          "my_rating", "notes", "recommended_by", "imdb_id")})
    item.tvmaze_id = _int(was.get("_tvmaze_id"), 1)
    item.wiki_url = str(was.get("_wiki_url") or "")[:600]
    item.seen = _clean_seen(was.get("seen") or {}, item.seasons)
    item.status = was.get("status") if was.get("status") in STATUSES else "to_watch"
    item.started_at, item.watched_at = was.get("started_at"), was.get("watched_at")
    item.looked_up_at = was.get("_looked_up_at")
    name = Path(str(was.get("_poster_file") or "")).name
    if name and (_poster_dir(who) / name).is_file():
        item.poster = name
    item.poster_from = str(was.get("_poster_from") or "")[:600]
    item.save()
    return view(item)


# --- tonight -----------------------------------------------------------------------------------------


def tonight(who, minutes=None, kind: str = "", skip=None, most: int = 5) -> list[dict]:
    """What to put on now, best first, each with why: the show they are in the middle of and its next
    episode first, then Up next in their order; within `minutes` when given; a film or a show when
    `kind` says ("film", "show"); never the titles in `skip`."""
    minutes = _int(minutes, 1, 1000)
    skip = {int(s) for s in (skip or []) if str(s).isdigit()}
    items = [i for i in _mine(who).exclude(status="watched").order_by("rank", "number") if i.number not in skip]
    if kind == "film":
        items = [i for i in items if i.kind == "film"]
    elif kind == "show":
        items = [i for i in items if i.kind in SERIAL]

    def fits(i):
        return minutes is None or not i.runtime or i.runtime <= minutes

    out = []
    watching = sorted((i for i in items if i.status == "watching" and fits(i)), key=lambda i: -i.updated_at)
    for i in watching:
        nxt = next_episode(i)
        why = (f"You are in the middle of it: next is season {nxt['season']}, episode {nxt['episode']}."
               if nxt else "You are in the middle of it.")
        out.append({"item": view(i), "why": why})
    for i in items:
        if i.status != "to_watch" or not fits(i):
            continue
        place = len([o for o in out if o["item"]["status"] == "to_watch"]) + 1
        why = "First in Up next." if place == 1 else f"Number {place} in Up next."
        if i.recommended_by:
            why += f" {i.recommended_by} recommended it."
        out.append({"item": view(i), "why": why})
    return out[:most]


# --- for the model, and the page's tabs ------------------------------------------------------------------


def line(v: dict) -> str:
    bits = [f"#{v['number']} {v['title']}"]
    if v.get("years"):
        bits.append(f"({v['years']})")
    bits.append(f"- {v['kind_said'].lower()}, {v['status_said'].lower()}")
    if v.get("where"):
        bits.append(f"on {v['where']}")
    if v.get("episodes"):
        bits.append(f"{v['episodes_seen']} of {v['episodes']} episodes seen")
    if v.get("next") and v["status"] == "watching":
        bits.append(f"next S{v['next']['season']} E{v['next']['episode']}")
    if v.get("runtime"):
        bits.append(f"{v['runtime']} min" + (" an episode" if v["kind"] in SERIAL else ""))
    if v.get("my_rating"):
        bits.append(f"rated {v['my_rating']}/5")
    if v.get("recommended_by"):
        bits.append(f"recommended by {v['recommended_by']}")
    return " ".join(bits)


def for_model(who, status: str = "") -> str:
    rows = _mine(who).order_by("rank", "number")
    if status in STATUSES:
        rows = rows.filter(status=status)
    return "\n".join(line(view(i)) for i in rows[:200])


async def tell(who, number: int | None = None, opened: bool = False, chat: str = "") -> None:
    """Every open tab of this person's: the watch list changed, so an open page reads it again; with
    `opened`, the tab of that chat opens the page at that title."""
    import asyncio

    from . import runtime

    try:
        c = await asyncio.to_thread(counts, who)
        msg = {"type": "watchlist", "counts": c}
        if number:
            msg["number"] = int(number)
        if opened:
            msg["open"] = True
            if chat:
                msg["chat"] = chat
        await runtime.push_person(who, msg)
    except Exception:  # noqa: BLE001 - a page that missed it reads the list when opened
        log.exception("the watch list could not be told to the person's tabs")


def dump(who) -> str:
    """Every title as JSON, for a copy kept elsewhere."""
    return json.dumps([view(i) for i in _mine(who).order_by("rank", "number")], ensure_ascii=False, indent=1)
