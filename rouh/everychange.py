"""Every change to Rouh's code, in one list: Evolution > Mutations, Every change (23 November 2026).

Petar, 23 November 2026: "make Evolution > Mutations (/evolution/mutations) the one list of every
change made to Rouh, including changes made from chat." Each entry says where it came from (a chat,
with the way back to it; Gene therapy, before it became Feedback; the Incubator; a nightly run; a
mutation request; a Rouh update; a commit by hand), what was asked in the person's own words, what
changed (its commits and files), when it landed, whether it is live, and its undo.

**Written by itself, never by a person remembering.**

* When a run that changes Rouh's code is started - `improve_myself` from any chat, the Incubator's
  Go, a mutation request, Undo here - `started` writes its entry at once, `building`, with the
  person's words and the chat it came from.
* When code lands - the protected core's trigger, and the catch-up at Rouh's start and once a day,
  the same two moments the gene log is written (`runtime`) - `fill` reads every commit of the code
  that runs that it has not read yet, puts each to the run that landed it (`genelog.landings`, what
  land.sh and the protected core write), and adds its commits and files to that run's entry, making
  one when nothing started it here. A commit no run is written down for is an entry of its own, put
  to its source by its message (`genelog.source_of`): a Rouh update, a nightly run, by hand.
* Gene therapy's history (`rouh/gene_therapy.py`'s two tables, kept as they were) is brought in once
  and again whenever there is something new in it (`bring_in_gene_therapy`): every request, and
  every feedback never made into one, is an entry marked Gene therapy, with the person's words and
  what came of it.

**Live** is read when the list is: an entry is live when its newest commit is in the code that runs
(an undo point put back, or a change taken out, leaves it not live). **Undo** starts a run that
takes the change out and keeps everything that came after it; that run's own landing is an entry of
its own, marked Undo.

**Whose.** The list is the organisation's code, so it is read by its administrators only: the
words of a chat are not shown to somebody who was not in it. Every query names the organisation.
"""
from __future__ import annotations

import logging
import re
import threading
import time

log = logging.getLogger("rouh.changes")

SOURCES = {"chat": "From a chat", "gene_therapy": "Gene therapy", "incubator": "Incubator",
           "mutation": "Mutation request", "night": "Nightly run", "refactor": "Nightly refactoring",
           "gene": "A gene grown", "pool": "From the Gene Pool", "undo": "Undo",
           "update": "Rouh update", "process": "Rouh's own work", "hand": "By hand",
           "unknown": "Not written down"}
#: The order the filters are shown in: the ones a person asked for first.
SOURCE_ORDER = ("chat", "gene_therapy", "incubator", "mutation", "undo", "night", "refactor", "gene",
                "pool", "update", "process", "hand", "unknown")
#: From the gene log's word for where a change came from to this list's.
FROM_GENELOG = {"chat": "chat", "feedback": "gene_therapy", "mutation": "mutation", "night": "night",
                "refactor": "refactor", "process": "process", "hand": "hand", "release": "update",
                "unknown": "unknown"}
#: What a brief starts with, for the runs this module cannot tell from the gene log's sources.
INCUBATOR_MARK = "From the Incubator, "
UNDO_MARK = "Take a change out of Rouh's code (Undo, in Evolution > Mutations)"
IDEA = re.compile(r"From the Incubator, ([A-Z]+-\d+)")

STATE_NAMES = {"landed": "Landed", "building": "Being built", "failed": "Did not land",
               "declined": "Not built: declined", "waiting": "Not built yet"}
#: The commits and files one entry keeps; the rest are counted.
MOST_COMMITS = 200
MOST_FILES = 300
PAGE = 50
HEAD_KEY = "rouh_changes_head:"
GT_KEY = "rouh_changes_gene_therapy:"

_FILLING = threading.Lock()


class Refused(ValueError):
    """Something not done, with the reason in words."""


def _m():
    from . import models

    return models


def _now() -> float:
    return time.time()


def _cut(value, most: int = 300) -> str:
    return " ".join(str(value or "").split())[:most].replace("—", "-")


def _text(value, most: int = 4000) -> str:
    return str(value or "").strip()[:most].replace("—", "-")


# --- written as a change starts -------------------------------------------------------------------


def started(org: str, *, run_id: str, source: str, asked: str = "", user_id: str = "", chat_id: str = "",
            title: str = "", ref: str = "") -> None:
    """A run that changes Rouh's code has started: its entry, `building`, at once. Never raises."""
    if not org or not run_id:
        return
    try:
        now = _now()
        _m().RouhChange.objects.update_or_create(
            org_id=org, key=f"run:{run_id}",
            defaults={"user_id": user_id or "", "source": source if source in SOURCES else "unknown",
                      "asked": _text(asked), "chat_id": chat_id or "", "run_id": run_id,
                      "title": _cut(title, 200), "ref": _cut(ref, 120), "state": "building",
                      "updated_at": now},
            create_defaults={"user_id": user_id or "", "source": source if source in SOURCES else "unknown",
                             "asked": _text(asked), "chat_id": chat_id or "", "run_id": run_id,
                             "title": _cut(title, 200), "ref": _cut(ref, 120), "state": "building",
                             "created_at": now, "updated_at": now})
    except Exception:  # noqa: BLE001 - the landing writes it anyway
        log.exception("the change of run %s could not be written as it started", run_id)


# --- written as code lands ------------------------------------------------------------------------


def _filled_to(org: str) -> str:
    return _m().AppState.objects.filter(key=HEAD_KEY + org).values_list("value", flat=True).first() or ""


def _set_filled_to(org: str, sha: str) -> None:
    _m().AppState.objects.update_or_create(key=HEAD_KEY + org, defaults={"value": sha})


def fill(org: str) -> dict:
    """Every commit of the code that runs this list has not read yet, put to its entry. Counts."""
    from . import genelog

    with _FILLING:
        head = genelog._head()
        if not head:
            return {"nothing": True}
        since = _filled_to(org)
        if since == head:
            return {"nothing": True}
        if since and not genelog.gitutil_ancestor(since, head):
            since = ""   # the code was put back, or moved onto other history: read it all once
        commits = genelog.history(since)
        runs = genelog.landings()
        marks = genelog.release_marks() if commits else set()
        groups: dict[str, list[dict]] = {}
        run_of: dict[str, str] = {}
        for c in commits:
            run = runs.get(c["sha"], "")
            key = f"run:{run}" if run else f"commit:{c['sha']}"
            groups.setdefault(key, []).append(c)
            run_of[key] = run
        got = {"read": len(commits), "entries": 0}
        for key, cs in groups.items():
            try:
                _land(org, key, cs, run_of[key], release=any(genelog.is_release(c, marks) for c in cs))
                got["entries"] += 1
            except Exception:  # noqa: BLE001 - one entry never stops the rest
                log.exception("the change %s could not be written", key)
        _set_filled_to(org, head)
        return got


def _land(org: str, key: str, cs: list[dict], run_id: str, *, release: bool) -> None:
    from django.db import IntegrityError

    R = _m().RouhChange
    row = R.objects.filter(org_id=org, key=key).first()
    now = _now()
    if row is None:
        source, asked, chat, ref, user = _source_of(cs[-1], run_id, release)
        try:
            row = R.objects.create(org_id=org, key=key, source=source, asked=asked, chat_id=chat, ref=ref,
                                   user_id=user, run_id=run_id, title=_cut(cs[-1]["subject"], 200),
                                   state="landed", created_at=cs[0]["at"] or now, updated_at=now)
        except IntegrityError:
            row = R.objects.get(org_id=org, key=key)
    have = {c.get("sha") for c in row.commits or []}
    commits = list(row.commits or []) + [{"sha": c["sha"], "subject": _cut(c["subject"], 300), "at": c["at"]}
                                         for c in cs if c["sha"] not in have]
    files = list(row.files or [])
    seen = set(files)
    for c in cs:
        for _, path in c["files"]:
            if path not in seen and len(files) < MOST_FILES:
                seen.add(path)
                files.append(path)
    row.commits = commits[-MOST_COMMITS:]
    row.files = files
    row.state = "landed"
    row.landed_at = max([c.get("at") or 0 for c in commits] or [now]) or now
    if not row.title:
        row.title = _cut(cs[-1]["subject"], 200)
    row.updated_at = now
    row.save()


def _source_of(c: dict, run_id: str, release: bool) -> tuple[str, str, str, str, str]:
    """(source, the words asked, its chat, what it came from, who) for a change nothing wrote as it
    started."""
    from . import genelog

    if release:
        return "update", "", "", "", ""
    said = genelog.source_of(c)
    source = FROM_GENELOG.get(said.get("from", ""), "unknown")
    asked, chat, ref = said.get("words", "") or "", "", said.get("feedback", "") or ""
    brief = ""
    if run_id:
        try:
            row = _m().Run.objects.filter(id=run_id).only("brief").first()
            brief = str(row.brief or "") if row is not None else ""
        except Exception:  # noqa: BLE001 - no brief read is said from the commit alone
            brief = ""
    if brief.startswith(INCUBATOR_MARK):
        source = "incubator"
        found = IDEA.match(brief)
        ref = found.group(1) if found else ref
    elif brief.startswith(UNDO_MARK):
        source = "undo"
    if source == "chat" and run_id:
        from . import runs

        try:
            chat = runs.chat_of(run_id) or ""
        except Exception:  # noqa: BLE001 - no chat is no link
            chat = ""
    if source in ("night", "refactor", "process", "hand", "unknown", "update"):
        asked = asked if source in ("night", "refactor") else ""
    return source, _text(asked), chat, ref, ""


# --- Gene therapy's history -----------------------------------------------------------------------


GT_STATE = {"shipped": "landed", "building": "building", "failed": "failed", "declined": "declined",
            "proposed": "waiting"}


def bring_in_gene_therapy(org: str) -> int:
    """Every Gene therapy request, and every feedback never made into one, as an entry marked Gene
    therapy, with the person's words. Once for each; a request whose run landed shares that run's
    entry, which takes its source and words from here. How many were written."""
    m = _m()
    newest = max([m.FeatureRequest.objects.filter(org_id=org).order_by("-created_at")
                  .values_list("created_at", flat=True).first() or 0,
                  m.Feedback.objects.filter(org_id=org).order_by("-created_at")
                  .values_list("created_at", flat=True).first() or 0])
    if not newest:
        return 0
    marker = f"{newest}:{m.FeatureRequest.objects.filter(org_id=org).count()}:" \
             f"{m.Feedback.objects.filter(org_id=org).count()}"
    if m.AppState.objects.filter(key=GT_KEY + org, value=marker).exists():
        return 0
    R = m.RouhChange
    said = {f.id: f for f in m.Feedback.objects.filter(org_id=org)}
    made = 0
    taken: set[str] = set()
    for r in m.FeatureRequest.objects.filter(org_id=org).order_by("created_at"):
        fb = said.get(r.from_feedback) if r.from_feedback else None
        if fb is not None:
            taken.add(fb.id)
        words = (fb.body if fb is not None else "") or r.body or r.title
        key = f"run:{r.run_id}" if r.run_id else f"request:{r.id}"
        row = R.objects.filter(org_id=org, key=key).first()
        fields = {"source": "gene_therapy", "asked": _text(words), "ref": r.id, "user_id": r.user_id or "",
                  "title": _cut(r.title, 200), "run_id": r.run_id or ""}
        if row is None:
            R.objects.create(org_id=org, key=key, state=GT_STATE.get(r.status, "waiting"),
                             note=_cut(r.run_note, 300), created_at=(fb.created_at if fb else r.created_at),
                             updated_at=_now(), **fields)
            made += 1
        elif row.source != "gene_therapy":
            R.objects.filter(id=row.id).update(updated_at=_now(), **fields)
            made += 1
    for fb in said.values():
        if fb.id in taken:
            continue
        key = f"feedback:{fb.id}"
        if R.objects.filter(org_id=org, key=key).exists():
            continue
        state = "declined" if fb.status == "declined" else "waiting"
        R.objects.create(org_id=org, key=key, source="gene_therapy", asked=_text(fb.body), ref=fb.id,
                         user_id=fb.user_id or "", title=_cut(fb.body, 120), state=state,
                         note="It was never written up as a request." if state == "waiting" else "",
                         created_at=fb.created_at, updated_at=_now())
        made += 1
    m.AppState.objects.update_or_create(key=GT_KEY + org, defaults={"value": marker})
    return made


def catch_up(org: str) -> dict:
    """Both of the above, for the beat and the page. Never raises."""
    out: dict = {}
    try:
        out["gene_therapy"] = bring_in_gene_therapy(org)
    except Exception:  # noqa: BLE001 - tried again next time
        log.exception("Gene therapy's history could not be brought into Every change")
    try:
        out.update(fill(org))
    except Exception:  # noqa: BLE001 - tried again next time
        log.exception("the landed changes could not be written into Every change")
    return out


# --- what the page reads --------------------------------------------------------------------------


_LIVE: dict = {"head": None, "shas": frozenset()}


def _live_shas() -> frozenset:
    """Every commit in the code that runs, read once a head."""
    from . import genelog

    head = genelog._head()
    if head and _LIVE["head"] != head:
        out = genelog._git("rev-list", "HEAD", timeout=60)
        _LIVE.update(head=head, shas=frozenset(out.split()))
    return _LIVE["shas"]


def _admin(who) -> None:
    if who is None:
        raise Refused("Sign in first.")
    if not getattr(who, "is_admin", False):
        raise Refused("Every change is for the administrators of this Rouh.")


def _chat_names(ids: list[str]) -> dict[str, str]:
    from . import runs

    st = runs.store()
    if st is None or not ids:
        return {}
    try:
        return {cid: (getattr(c, "title", "") or "a chat") for cid, c in st.get_chats(ids).items()}
    except Exception:  # noqa: BLE001 - no name is no link
        return {}


def _run_state(run_id: str) -> str:
    if not run_id:
        return ""
    try:
        row = _m().Run.objects.filter(id=run_id).only("state").first()
    except Exception:  # noqa: BLE001
        return ""
    return str(row.state) if row is not None else "gone"


ENDED = ("done", "failed", "lost", "reaped", "killed", "gone")


def view_of(r, live: frozenset, chats: dict[str, str], who=None) -> dict:
    state = r.state
    if state == "building" and _run_state(r.run_id) in ENDED and not r.commits:
        state = "failed"
    newest = (r.commits or [{}])[-1].get("sha", "") if r.commits else ""
    is_live = (newest in live) if (newest and state == "landed") else None
    from . import evolution

    out = {"id": r.id, "source": r.source, "source_name": SOURCES.get(r.source, r.source),
           "asked": r.asked or "", "title": r.title or "", "ref": r.ref or "", "run": r.run_id or "",
           "state": state, "state_name": STATE_NAMES.get(state, state), "note": r.note or "",
           "commits": (r.commits or [])[-10:][::-1], "commit_count": len(r.commits or []),
           "files": (r.files or [])[:40], "file_count": len(r.files or []),
           "landed_at": r.landed_at, "created_at": r.created_at, "live": is_live,
           "when": evolution.when_words(r.landed_at or r.created_at, who) if who is not None else "",
           "undo_run": r.undo_run or "", "can_undo": bool(is_live and not r.undo_run)}
    if r.chat_id:
        name = chats.get(r.chat_id)
        out["chat"] = {"id": r.chat_id, "name": name or "", "gone": name is None,
                       "href": f"/chat/{r.chat_id}"}
    if r.source == "incubator" and r.ref:
        out["ref_href"] = f"/evolution/incubator/{r.ref}"
    return out


def listing(who, *, source: str = "", q: str = "", before: int = 0) -> dict:
    """The page's answer: the newest `PAGE` entries (before an id, for Show more), the counts of
    every source over the whole list, and how many are live."""
    _admin(who)
    org = str(who.org_id)
    if _filled_to(org) != _head_or_blank():
        catch_up(org)
    R = _m().RouhChange
    rows = R.objects.filter(org_id=org)
    from django.db.models import Count, Q
    from django.db.models.functions import Coalesce

    counts = {k: n for k, n in rows.values_list("source").annotate(n=Count("id"))}
    total = sum(counts.values())
    if source:
        rows = rows.filter(source=source)
    words = _cut(q, 200)
    if words:
        rows = rows.filter(Q(asked__icontains=words) | Q(title__icontains=words) | Q(ref__icontains=words)
                           | Q(run_id__icontains=words))
    matching = rows.count()
    # Newest first by when it landed, or, for one that never did, when it was asked for.
    rows = rows.annotate(at=Coalesce("landed_at", "created_at"))
    if before:
        pivot = R.objects.filter(org_id=org, id=int(before)).annotate(
            at=Coalesce("landed_at", "created_at")).values_list("at", flat=True).first()
        if pivot is not None:
            rows = rows.filter(Q(at__lt=pivot) | Q(at=pivot, id__lt=int(before)))
    page = list(rows.order_by("-at", "-id")[:PAGE + 1])
    live = _live_shas()
    chats = _chat_names(sorted({r.chat_id for r in page if r.chat_id}))
    items = [view_of(r, live, chats, who) for r in page[:PAGE]]
    landed = R.objects.filter(org_id=org, state="landed").only("commits")
    live_count = sum(1 for r in landed if r.commits and r.commits[-1].get("sha") in live)
    return {"items": items, "more": len(page) > PAGE, "counts": counts, "total": total,
            "matching": matching, "live": live_count,
            "sources": [{"id": k, "name": SOURCES[k], "count": counts.get(k, 0)} for k in SOURCE_ORDER
                        if counts.get(k)]}


def _head_or_blank() -> str:
    from . import genelog

    try:
        return genelog._head()
    except Exception:  # noqa: BLE001
        return ""


# --- Undo -----------------------------------------------------------------------------------------


def undo_brief(r) -> str:
    shas = [c["sha"] for c in r.commits or []]
    lines = [UNDO_MARK + ".", "",
             f"Take this change out of Rouh's code, and keep everything that came after it working. "
             f"It was: {SOURCES.get(r.source, r.source)}"
             + (f", asked as: {r.asked[:1500]}" if r.asked else f", titled: {r.title}") + ".",
             "", "Its commits, oldest first:"]
    lines += [f"- {c['sha']} {c.get('subject', '')}" for c in (r.commits or [])]
    lines += ["", "Revert them (git revert, newest first), settle any clash so later changes still work, "
                  "prove in a real browser that what the change did is gone and nothing else broke, "
                  "commit and land it. Do not take out anything these commits did not add.",
              "", "Commits: " + " ".join(shas)]
    return "\n".join(lines)


async def undo(who, change_id: int) -> dict:
    """Start the run that takes one change out. An administrator's press, confirmed on the page."""
    import asyncio

    from . import nightly_feature

    _admin(who)
    org = str(who.org_id)

    def claim():
        r = _m().RouhChange.objects.filter(org_id=org, id=int(change_id)).first()
        if r is None:
            raise Refused("That change is not in the list.")
        if r.undo_run:
            raise Refused(f"Undo has already started for it: run {r.undo_run}.")
        if not r.commits:
            raise Refused("Nothing of it landed, so there is nothing to take out.")
        if r.commits[-1].get("sha") not in _live_shas():
            raise Refused("It is not in the code that runs, so there is nothing to take out.")
        return r

    r = await asyncio.to_thread(claim)
    if nightly_feature.hooks.start is None:
        raise Refused("Rouh's runs are not ready yet. Try again in a minute.")
    try:
        got = await nightly_feature.hooks.start(brief=undo_brief(r), title=f"Undo: {_cut(r.asked or r.title, 60)}",
                                                preset="improve_myself", org_id=org)
    except Exception as exc:  # noqa: BLE001 - said, not hidden
        raise Refused(f"The run could not be started: {(str(exc).strip() or type(exc).__name__).rstrip('.')}.") from None
    run = str((got or {}).get("id") or "")
    if not run:
        raise Refused("The run could not be started: nothing said which run it is.")

    def mark():
        _m().RouhChange.objects.filter(id=r.id).update(undo_run=run, undo_at=_now(), updated_at=_now())
        started(org, run_id=run, source="undo", asked=f"Undo: {r.asked or r.title}", user_id=str(who.user_id),
                title=f"Undo of change {r.id}", ref=str(r.id))

    await asyncio.to_thread(mark)
    return {"ok": True, "run": run, "said": f"Undo started: run {run} is taking it out."}
