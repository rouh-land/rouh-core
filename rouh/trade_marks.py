"""An EU trade mark read from EUIPO's own register: where an application or a registration stands,
straight from the office's public data, rather than from a page Rouh cannot open.

Built 28 November 2026, for the weekly watch on an EU trade mark application on Clockwork. The
watch was told to look in eSearch plus or TMview, both of them JavaScript apps that web_fetch reads
as an empty page, so three Mondays running it wrote to the contact it was made for that the
register could not be checked, while the application had in fact been published on the first day
of the watch and its opposition period had opened.

eSearch plus draws its page from three public answers of EUIPO's own service, the same for anybody
and with no account (`BASE`): the mark itself (`/copla/trademark/data/withOppoRelations/<n>`),
its timeline of milestones (`/copla/timeline/trademark/<n>`) and the documents on its file
(`/copla/trademark/data/withDocuments/<n>`). The first of them is refused to a caller that has not
opened eSearch plus first: the office's firewall drops the connection unless the cookies the
eSearch page sets come with it. So `read` opens that page first, as a browser would, keeps its
cookies for this one reading, and then asks.

The tool `eu_trade_mark` takes a number (019441683, 19441683 or EM019441683) and says the mark,
its status and since when, the applicant, the classes, its publications, the opposition period
with its dates, any opposition, appeal or cancellation, where it is on the timeline, its latest
events and documents, and the address of its page in eSearch plus. It reads and changes nothing,
keeps nothing and asks no model.

**Whose.** A public register, the same for everybody; nothing of the person's is sent.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

log = logging.getLogger("rouh.trade_marks")

TOOL_NAME = "eu_trade_mark"
TITLE = "An EU trade mark read from EUIPO's register"
#: EUIPO's own public service, which eSearch plus draws its pages from.
BASE = "https://euipo.europa.eu"
SEARCH_PAGE = BASE + "/eSearch/"
TIMEOUT = 30.0
USER_AGENT = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/130.0 Safari/537.36")
#: How many of the latest events and documents are said.
LATEST = 8

DESCRIPTION = (
    "Where an EU trade mark application or registration stands, read from the EU trade mark "
    "office's (EUIPO's) own public register, the data eSearch plus shows, which web_fetch cannot "
    "open. Give `number`, the EU trade mark's number (such as 019441683). It says the mark, its "
    "status and the date of it, the applicant, the classes, its publications, the opposition "
    "period with its start and end dates, any opposition, appeal or cancellation, where it is on "
    "the office's timeline, its latest events and documents, and its eSearch plus address. Use "
    "it whenever asked to check, watch or report on an EU trade mark, instead of opening "
    "eSearch plus or TMview.")

SCHEMA = {
    "type": "object",
    "properties": {
        "number": {"type": "string", "description": "The EU trade mark's number, such as 019441683 "
                                                    "(EM019441683 and 19441683 are read the same)."},
    },
    "required": ["number"],
}


class Unreadable(Exception):
    """The register could not be read, with why, in words to say."""


def number_of(said) -> str:
    """The nine-digit EU trade mark number in what was said, or ""."""
    text = re.sub(r"[\s.\-/]", "", str(said or "")).upper()
    text = re.sub(r"^(EUTM|EM|EU|CTM)", "", text)
    if not text.isdigit() or not 1 <= len(text) <= 9:
        return ""
    return text.zfill(9)


def page_of(number: str) -> str:
    return f"{SEARCH_PAGE}#details/trademarks/{number}"


async def read(number: str, *, transport=None) -> dict:
    """The register's three answers for one mark: {"mark", "timeline", "documents"}. Raises
    Unreadable when the office does not answer or knows no such mark."""
    import httpx

    headers = {"User-Agent": USER_AGENT, "Accept-Language": "en"}
    asks = {"Referer": SEARCH_PAGE, "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01"}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers=headers,
                                     transport=transport) as client:
            # The office's firewall lets the data through only with the cookies this page sets.
            await client.get(SEARCH_PAGE)
            got = await client.get(f"{BASE}/copla/trademark/data/withOppoRelations/{number}",
                                   headers=asks)
            if got.status_code == 404:
                raise Unreadable(f"EUIPO's register has no EU trade mark {number}.")
            if got.status_code >= 400:
                raise Unreadable(f"EUIPO's register answered {got.status_code} for {number}.")
            try:
                mark = (got.json() or {}).get("entity") or {}
            except ValueError:
                raise Unreadable("EUIPO's register answered with something that is not its "
                                 "data.") from None
            if not mark.get("number"):
                raise Unreadable(f"EUIPO's register has no EU trade mark {number}.")
            timeline, documents = {}, []
            try:
                t = await client.get(f"{BASE}/copla/timeline/trademark/{number}", headers=asks)
                if t.status_code < 400:
                    timeline = t.json() or {}
            except (httpx.HTTPError, ValueError) as exc:
                log.info("the timeline of %s was not read: %s", number, exc)
            try:
                d = await client.get(f"{BASE}/copla/trademark/data/withDocuments/{number}",
                                     params={"iDisplayStart": 0, "iDisplayLength": 50,
                                             "iSortCol_0": 5, "sSortDir_0": "desc"}, headers=asks)
                if d.status_code < 400:
                    documents = (d.json() or {}).get("aaData") or []
            except (httpx.HTTPError, ValueError) as exc:
                log.info("the documents of %s were not read: %s", number, exc)
    except httpx.HTTPError as exc:
        raise Unreadable(f"EUIPO's register did not answer ({type(exc).__name__}).") from None
    return {"mark": mark, "timeline": timeline, "documents": documents}


def _day(ms) -> str:
    """A date of the register's, which it gives as milliseconds, as YYYY-MM-DD."""
    try:
        return datetime.fromtimestamp(int(ms) / 1000, timezone.utc).strftime("%Y-%m-%d")
    except (TypeError, ValueError, OverflowError, OSError):
        return ""


def _event(label: str) -> str:
    """An event's label in words: SYS_PERFORM_PUBLICATION is "perform publication"."""
    words = re.sub(r"^SYS_", "", str(label or "")).replace("_", " ").strip().lower()
    return words or "an event"


def _timeline_day(label: str) -> str:
    """The timeline's 30/10/2026 as 2026-10-30."""
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", str(label or "").strip())
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else str(label or "")


def summary(found: dict, today: str = "") -> dict:
    """What matters of a reading, as plain values: the numbers and dates a watch compares."""
    mark = found.get("mark") or {}
    applicants = [a.get("name") or a.get("orga") or "" for a in mark.get("applicants") or []]
    start, end = _day(mark.get("oppositionStartDate")), _day(mark.get("oppositionEndDate"))
    steps = []
    for stone in (found.get("timeline") or {}).get("milestones") or []:
        for step in stone.get("steps") or []:
            steps.append({"stage": stone.get("name") or "", "step": step.get("name") or "",
                          "date": _timeline_day(step.get("dateLabel")),
                          "current": bool(step.get("current"))})
    events = sorted(mark.get("events") or [], key=lambda e: e.get("date") or 0)
    documents = []
    for row in found.get("documents") or []:
        if isinstance(row, list) and len(row) >= 5:
            side = row[0] if isinstance(row[0], dict) else {}
            documents.append({"title": str(row[3] or ""), "date": _timeline_day(row[4]),
                              "from": "EUIPO" if side.get("fromType") == "OUTGOING" else "the applicant"})
    return {
        "number": mark.get("numberToShow") or mark.get("number") or "",
        "name": mark.get("name") or "",
        "status": mark.get("status") or mark.get("rawStatus") or "",
        "status_date": _day(mark.get("currentStatusDate")),
        "filed": _day(mark.get("filingdate")),
        "registered": _day(mark.get("regdate")),
        "expires": _day(mark.get("expirydate")),
        "applicants": [a for a in applicants if a],
        "kind": " ".join(x for x in (mark.get("feature"), "mark") if x),
        "classes": [str(c) for c in mark.get("niceclasses") or []],
        "publications": [{"date": _day(p.get("date")), "bulletin": p.get("bulletinNumber") or "",
                          "section": p.get("section") or ""} for p in mark.get("publications") or []],
        "opposition_start": start,
        "opposition_end": end,
        "opposition_open": bool(start and end and today and start <= today <= end),
        "oppositions": len(mark.get("oppositions") or []),
        "appeals": len(mark.get("appeals") or []),
        "cancellations": len(mark.get("cancellations") or []),
        "timeline": steps,
        "events": [{"date": _day(e.get("date")), "event": _event(e.get("label"))}
                   for e in events][-LATEST:],
        "documents": documents[:LATEST],
        "page": page_of(mark.get("number") or ""),
    }


def words(s: dict, today: str = "") -> str:
    """The reading said in plain words, the dates as YYYY-MM-DD."""
    lines = [f"EU trade mark {s['number']}, {s['name'] or 'no name'} ({s['kind']}), read from "
             f"EUIPO's register" + (f" on {today}" if today else "") + "."]
    lines.append(f"Status: {s['status'] or 'not given'}" + (f", since {s['status_date']}" if s["status_date"] else "") + ".")
    if s["filed"]:
        lines.append(f"Filed: {s['filed']}.")
    if s["applicants"]:
        lines.append("Applicant: " + "; ".join(s["applicants"]) + ".")
    if s["classes"]:
        lines.append("Nice classes: " + ", ".join(s["classes"]) + ".")
    for p in s["publications"]:
        lines.append(f"Published: {p['date']}, EU Trade Marks Bulletin {p['bulletin']}, part {p['section']}.")
    if s["opposition_start"] or s["opposition_end"]:
        state = ("open now" if s["opposition_open"] else
                 "closed" if today and s["opposition_end"] and today > s["opposition_end"] else
                 "not open yet" if today and s["opposition_start"] and today < s["opposition_start"] else "")
        lines.append(f"Opposition period: {s['opposition_start'] or '?'} to {s['opposition_end'] or '?'}"
                     + (f" ({state})" if state else "") + ".")
    lines.append(f"Oppositions filed: {s['oppositions']}. Appeals: {s['appeals']}. "
                 f"Cancellations: {s['cancellations']}.")
    if s["registered"]:
        lines.append(f"Registered: {s['registered']}" + (f", until {s['expires']}" if s["expires"] else "") + ".")
    if s["timeline"]:
        lines.append("Timeline: " + "; ".join(
            f"{t['step']} {t['date']}" + (" (where it is now)" if t["current"] else "")
            for t in s["timeline"]) + ".")
    if s["events"]:
        lines.append("Latest events: " + "; ".join(f"{e['date']} {e['event']}" for e in s["events"]) + ".")
    if s["documents"]:
        lines.append("Documents on the file, newest first: " + "; ".join(
            f"{d['date']} {d['title']} (from {d['from']})" for d in s["documents"]) + ".")
    lines.append(f"Its page in eSearch plus: {s['page']}")
    return "\n".join(lines)


async def answer(args: dict, today: str = "", *, transport=None) -> tuple[str, dict]:
    """(what to say, the summary) for a call of the tool; the summary is {} when nothing was read."""
    number = number_of((args or {}).get("number"))
    if not number:
        return ("Give the EU trade mark's number, nine digits such as 019441683.", {})
    try:
        found = await read(number, transport=transport)
    except Unreadable as exc:
        said = str(exc)
        if "has no EU trade mark" not in said:
            said += " Nothing was read: say that the register could not be reached this time."
        return (said, {})
    s = summary(found, today)
    return words(s, today), s


__all__ = ["DESCRIPTION", "SCHEMA", "TOOL_NAME", "Unreadable", "answer", "number_of", "page_of",
           "read", "summary", "words"]
