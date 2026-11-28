"""Apps: the apps Rouh builds and looks after for the person, the servers they run on, and setting one up.

Petar, 28 November 2026: "basically a person should know that they can and should have a server hosting
their apps. first of all they should know they can build apps, so rouh can let them know it can build
anything. and then they should know how to let rouh set its own server and then rouh should have all the
instructions on how to set apps on it. and then we should have app management. all of this we are currently
doing kind of on the side but I want to make it official ... maybe the place/feature should be called apps?!"

- **Where apps live.** On an apps server of the person's own, never on Rouh's: Rouh's server holds their mail,
  passwords and boxes, restarts with every update, and apps must outlive Rouh being moved. Finished pages
  (the explainers) stay on Rouh.
- **Setting one up** is one line, or the host's first-boot box, or one press with a Hostinger API token
  (`HOSTS`, `hostinger_setup`). Rouh never buys a server: the person buys it at the host, which is spending.
  The line fetches `deploy/apps-server/setup.sh` from this Rouh with a join code in it (`join_script`), and
  the server calls back once (`join`) and is given its agent's key.
- **Every app on one standard** (`deploy/apps-server/CONTRACT.md`, section 4): its own Linux user, database
  and login, a service with a memory limit, its own git history, pinned packages, nightly backups with a
  test restore, test copy first then live, one-step roll back, its own HTTPS address.
- **The server calls Rouh, never the other way** (`agent`): every 30 seconds it says how it and its apps are
  and takes the commands waiting for it, from a closed list (`VERBS`). Rouh needs no SSH to it, so it works
  behind any firewall and from a Rouh whose jobs may reach only ports 80 and 443.
- **Every app is checked by its address** (`check`), whether it runs on an apps server or elsewhere, every
  five minutes (`watch_loop`), and a notice says once when one stops answering and once when it is back.
- **Apps already running on the side** are added by hand (`add_app`), on a server registered as elsewhere,
  and are checked the same way; moving one onto an apps server is the runbook's (`deploy/apps-server/README.md`).

Every row is the person's and is asked for with both ids (`rouh/models/apps.py`).
"""
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import logging
import os
import re
import secrets
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

log = logging.getLogger("rouh.apps_hosting")

ROUTE = "/apps"
JOIN_PREFIX = "/apps/join/"
AGENT_PATH = "/api/apps/agent"
HERE = Path(__file__).resolve().parent.parent / "deploy" / "apps-server"

#: An app's name: `app-` and it is its Linux user, which stops at 32 characters (`CONTRACT.md`).
NAME = re.compile(r"^[a-z][a-z0-9-]{1,27}$")
#: The commands a server takes (`CONTRACT.md`, section 3), and the arguments each may carry.
VERBS: dict[str, tuple[str, ...]] = {
    "new": ("kind", "repo", "branch", "domain", "memory", "database"),
    "deploy": ("ref",),
    "update": (),
    "rollback": (),
    "restart": (),
    "logs": ("lines",),
    "backup": (),
    "restore-test": (),
    "check": (),
}
#: What the page and the tool call each verb, and what it says while it waits.
VERB_SAID = {"new": "Set up", "deploy": "Deploy", "update": "Update", "rollback": "Roll back",
             "restart": "Restart", "logs": "Logs", "backup": "Back up", "restore-test": "Test restore",
             "check": "Check"}
JOIN_DAYS = 7
SILENT_AFTER = 3600.0
FULL_EVERY = 300.0
CHECK_EVERY = 300.0
OUTPUT_MOST = 20000
SPENT_SCRIPT = "#!/bin/bash\necho 'Rouh: {why}' >&2\nexit 1\n"


class Refused(ValueError):
    """Said to the person as it is."""


@dataclass
class Who:
    user_id: str
    org_id: str


def _ids(who) -> dict:
    return {"user_id": str(who.user_id), "org_id": str(who.org_id or "")}


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


# --- the hosts ------------------------------------------------------------------------------------------

#: The hosts the page walks through, Hostinger first (Petar's word). Each takes the same first-boot script.
HOSTS = [
    {"id": "hostinger", "name": "Hostinger", "recommended": True,
     "why": "Quick to rent, has a command window in the browser, and with its token Rouh sets the server up with one press.",
     "plan": "Their smallest server plan (they call it KVM 1) is enough to start; KVM 2 holds about a dozen small apps.",
     "buy": "https://www.hostinger.com/vps-hosting",
     "token_url": "https://hpanel.hostinger.com/profile/api",
     "steps": [
         "Rent a server at Hostinger (VPS, plan KVM 1 or KVM 2). Rouh never rents it for you.",
         "When their control panel (hPanel) asks which system to put on it, pick Ubuntu 24.04, the plain one without a panel.",
         "Open the server in hPanel and press Browser terminal: a command window opens.",
         "Paste the line below and press Enter. It takes about five minutes.",
     ],
     "boot": "Or, before you install it: in hPanel, VPS, Settings, Post-install script, paste the script below, "
             "then install Ubuntu 24.04. It runs by itself on the first start."},
    {"id": "hetzner", "name": "Hetzner",
     "why": "The best price for what you get in Europe; servers in Germany and Finland.",
     "plan": "A CX22 or CAX11 is enough to start.",
     "buy": "https://console.hetzner.cloud/",
     "steps": [
         "In the Hetzner Cloud console, press Add Server.",
         "Pick a location and the image Ubuntu 24.04.",
         "Under Cloud config, paste the script below.",
         "Press Create & Buy now. The server sets itself up in about five minutes.",
     ],
     "boot": "Already have one? Log in to it and paste the line below."},
    {"id": "digitalocean", "name": "DigitalOcean",
     "why": "Simple and well documented; servers around the world.",
     "plan": "A Basic droplet with 2 GB memory is enough to start.",
     "buy": "https://cloud.digitalocean.com/droplets/new",
     "steps": [
         "Create a Droplet with the image Ubuntu 24.04.",
         "Under Advanced options, tick Add initialization scripts and paste the script below.",
         "Press Create Droplet. It sets itself up in about five minutes.",
     ],
     "boot": "Already have one? Log in to it and paste the line below."},
    {"id": "other", "name": "Any Linux server",
     "why": "A server you already have, with Ubuntu 22.04 or newer, or Debian 12, that you can log in to.",
     "plan": "At least 1 GB memory and 20 GB disk.",
     "buy": "",
     "steps": [
         "Log in to the server as root, or as a user who may use sudo.",
         "Paste the line below and press Enter. It takes about five minutes.",
     ],
     "boot": "Or paste the script below where your host asks for a first-boot or user data script."},
]
HOST_IDS = {h["id"] for h in HOSTS}

#: What the empty page offers to build, each a sentence put into the message box.
IDEAS = [
    {"name": "Travel companion", "say": "Build me a travel companion app for my next trip: the plan by day, "
     "bookings, maps and a shared list for everyone coming."},
    {"name": "Wedding inviter", "say": "Build me a wedding invitation app: a page per guest, replies, "
     "plus-ones and meal choices, and a list I can see."},
    {"name": "Movie watch list", "say": "Build me a movie watch list app we can share at home, with ratings "
     "and what to watch next."},
    {"name": "A game", "say": "Build me a small game I can play on my phone and share with friends."},
    {"name": "Work helper", "say": "Build me a work helper app that "},
    {"name": "Email handler", "say": "Build me an app that handles a kind of email for me: "},
]


# --- Rouh's own address ----------------------------------------------------------------------------------

def _public(url: str) -> bool:
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        return False
    if not host or host == "localhost" or host.endswith(".local"):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return "." in host
    return ip.is_global


def base_address(asked: str = "") -> tuple[str, bool]:
    """The address an apps server reaches this Rouh at, and whether it is on the internet.

    The installation's own public URL, then the relay's born address, then the owner's own domain, and
    last the address the page was opened at (which, on a laptop, the server cannot reach: said so)."""
    from .config import config

    for url in (getattr(config, "public_url", "") or "", _relay(),
                ("https://" + os.environ.get("ROUH_DOMAIN", "").strip().rstrip(".")
                 if os.environ.get("ROUH_DOMAIN", "").strip() else ""), asked or ""):
        url = str(url or "").strip().rstrip("/")
        if url and _public(url):
            return url, True
    return str(asked or "").rstrip("/"), False


def _relay() -> str:
    try:
        from . import relay

        return relay.address()
    except Exception:  # noqa: BLE001 - no relay is the usual case on a server with its own name
        return ""


# --- the page --------------------------------------------------------------------------------------------

def _server_dict(s, now: float) -> dict:
    facts = s.facts or {}
    silent = s.state == "ready" and s.seen_at and now - s.seen_at > SILENT_AFTER
    return {"id": s.id, "name": s.name, "host": s.host, "host_name": _host_name(s.host), "address": s.address,
            "state": "silent" if silent else s.state, "standard": s.standard, "seen_at": s.seen_at,
            "joined_at": s.joined_at, "made_at": s.made_at, "note": s.note,
            "join_until": s.join_until if s.state == "waiting" else 0,
            "os": facts.get("os", ""), "cpus": facts.get("cpus"), "memory_mb": facts.get("memory_mb"),
            "memory_free_mb": facts.get("memory_free_mb"), "disk_gb": facts.get("disk_gb"),
            "disk_free_gb": facts.get("disk_free_gb"), "via_token": bool(s.host_ref)}


def _host_name(host: str) -> str:
    return next((h["name"] for h in HOSTS if h["id"] == host), "Elsewhere" if host == "elsewhere" else "Other")


def _command_dict(c) -> dict:
    return {"id": c.id, "verb": c.verb, "said": VERB_SAID.get(c.verb, c.verb), "app": c.app, "state": c.state,
            "asked_at": c.asked_at, "done_at": c.done_at, "asked_by": c.asked_by,
            "output": (c.output or "")[-4000:], "args": c.args or {}}


def _app_dict(a, servers: dict, commands: list) -> dict:
    rep = a.report or {}
    server = servers.get(a.server_id) if a.server_id else None
    mine = [c for c in commands if c.app == a.slug and c.server_id == a.server_id]
    return {"id": a.id, "slug": a.slug, "name": a.name, "what": a.what, "url": a.url,
            "health_url": a.health_url, "state": a.state, "checked_at": a.checked_at, "check_said": a.check_said,
            "down_since": a.down_since, "server_id": a.server_id,
            "server": server["name"] if server else "", "elsewhere": a.elsewhere,
            "managed": bool(server and server["standard"] and server["state"] in ("ready", "silent")),
            "kind": a.kind or rep.get("kind", ""), "repo": a.repo or rep.get("repo", ""),
            "run_state": rep.get("state", ""), "release": rep.get("release", ""),
            "released_at": rep.get("released_at") or 0, "previous_release": rep.get("previous_release", ""),
            "backup_at": rep.get("backup_at") or 0, "backup_ok": rep.get("backup_ok"),
            "restore_test_at": rep.get("restore_test_at") or 0, "restore_test_ok": rep.get("restore_test_ok"),
            "test_url": rep.get("test_url", ""), "deploy_key": rep.get("deploy_key", ""),
            "memory_mb": rep.get("memory_mb"), "memory_limit": rep.get("memory_limit", ""),
            "last_error": rep.get("last_error") or "", "made_by": a.made_by,
            "data_at": _data_at(a, server),
            "commands": [_command_dict(c) for c in mine[:6]]}


def _data_at(a, server) -> str:
    """Where an app's data is kept: the standard's own words on an apps server, else the person's."""
    if server and server.get("standard"):
        return f"Its own PostgreSQL database, app_{a.slug.replace('-', '_')}, and its files, on {server['name']}"
    return a.data_at or ""


def _page_name(rel: str) -> str:
    """A workspace page's name: its own <title>, else its folder's words."""
    from . import pages
    from .config import config

    try:
        title = pages.title_of(pages.resolve(Path(config.assistant_repo), rel))
    except Exception:  # noqa: BLE001 - a page that moved or went is named by its path
        title = ""
    if title:
        return title
    parts = [p for p in rel.split("/") if p and not p.endswith(".html")]
    last = re.sub(r"^[\d-]+\.", "", parts[-1] if parts else rel).replace("-", " ")
    return last[:1].upper() + last[1:]


#: A person's settings on a page smaller than this are a remembered tab, not data of the page's own.
SETTINGS_ARE_DATA = 512


def data_pages(who) -> list[dict]:
    """The workspace pages that keep data of their own on Rouh, so are apps in all but name.

    Petar, 28 November 2026: "We have dynamic pages with functionalities and databases", running on
    Rouh's own server. A page keeps data in two ways (`rouh/sharedlist.py`, `rouh/pagestate.py`): a
    list everybody who may change the page shares, and each person's choices on it. Read here, never
    moved."""
    from .models import PageSharedList, PageState
    from .pages import ROUTE as PAGES

    found: dict[str, dict] = {}
    for r in PageSharedList.objects.filter(org_id=str(who.org_id or "")).order_by("-updated_at")[:100]:
        one = found.setdefault(r.rel, {"rel": r.rel, "lists": 0, "entries": 0, "settings_kb": 0, "updated_at": 0})
        one["lists"] += 1
        one["entries"] += len(r.items or [])
        one["updated_at"] = max(one["updated_at"], r.updated_at or 0)
    for r in PageState.objects.filter(**_ids(who)).order_by("-updated_at")[:400]:
        size = len(json.dumps(r.settings or {}))
        if size < SETTINGS_ARE_DATA and r.rel not in found:
            continue
        one = found.setdefault(r.rel, {"rel": r.rel, "lists": 0, "entries": 0, "settings_kb": 0, "updated_at": 0})
        one["settings_kb"] = max(1, round(size / 1024))
        one["updated_at"] = max(one["updated_at"], r.updated_at or 0)
    out = []
    for one in found.values():
        kept, keeps = [], []
        if one["lists"]:
            keeps.append(f"A shared list of {one['entries']} entr{'y' if one['entries'] == 1 else 'ies'}")
            kept.append(f"a list shared by everyone who may change the page ({one['entries']} "
                        f"entr{'y' if one['entries'] == 1 else 'ies'})")
        if one["settings_kb"]:
            kept.append(f"your choices on the page (about {one['settings_kb']} KB)")
            keeps.append(("your" if keeps else "Your") + f" choices on the page (about {one['settings_kb']} KB)")
        out.append({"rel": one["rel"], "name": _page_name(one["rel"]), "href": PAGES + one["rel"],
                    "updated_at": one["updated_at"],
                    "data_at": "Rouh's own database: " + " and ".join(kept),
                    # The same, short, for the Apps page's row (designs/apps/HANDOFF.md).
                    "keeps": ", and ".join(keeps)})
    out.sort(key=lambda o: -o["updated_at"])
    return out


def move_plan(apps: list[dict], pages: list[dict], servers: list[dict]) -> dict:
    """What moving everything onto the person's apps server means, one line each. Nothing is moved here."""
    target = next((s["name"] for s in servers if s["standard"] and s["state"] in ("ready", "silent")), "")
    steps = []
    for a in apps:
        if a["managed"]:
            continue
        steps.append({"kind": "app", "id": a["id"], "name": a["name"], "from": a["elsewhere"] or a["server"] or "elsewhere",
                      "how": "Back up its database and files, set it up on the apps server on the standard, restore "
                             "them there and test it, point its address at the new server, then stop the old one."})
    for pg in pages:
        steps.append({"kind": "page", "rel": pg["rel"], "name": pg["name"], "from": "Rouh's own server",
                      "how": "Becomes a small app with a database of its own on the apps server, its data copied "
                             "over; the page in the workspace stays and links to it."})
    return {"target": target, "steps": steps,
            "said": (f"Nothing has been moved. When you say so, Rouh moves them one at a time onto {target}."
                     if target else "Nothing has been moved. Once your apps server is set up, Rouh can move "
                     "them onto it one at a time, when you say so.")}


def page(who, asked: str = "") -> dict:
    """Everything the Apps page draws, and what the `apps` tool says."""
    from .models import AppCommand, AppServer, HostedApp, HostToken

    now = time.time()
    me = _ids(who)
    servers = [_server_dict(s, now) for s in AppServer.objects.filter(**me).order_by("made_at", "id")]
    by_id = {s["id"]: s for s in servers}
    commands = list(AppCommand.objects.filter(**me).order_by("-asked_at", "-id")[:200])
    apps = [_app_dict(a, by_id, commands) for a in HostedApp.objects.filter(**me).order_by("name", "id")]
    base, reachable = base_address(asked)
    tokens = {t.host: {"last4": t.last4, "saved_at": t.saved_at} for t in HostToken.objects.filter(**me)}
    needs = []
    for a in apps:
        if a["state"] == "down":
            needs.append({"kind": "down", "app": a["id"], "server": a["server_id"],
                          "said": f"{a['name']} is not answering", "since": a["down_since"]})
    for a in apps:
        if a["state"] != "down" and a["managed"] and (a["backup_ok"] is False or a["restore_test_ok"] is False):
            what = "backup" if a["backup_ok"] is False else "test restore"
            needs.append({"kind": "backup", "app": a["id"], "server": a["server_id"],
                          "said": f"The last {what} of {a['name']} failed",
                          "since": a["backup_at"] if what == "backup" else a["restore_test_at"]})
    for s in servers:
        if s["state"] == "silent":
            needs.append({"kind": "silent", "server": s["id"], "said": f"{s['name']} has not called in",
                          "since": s["seen_at"]})
    down = {a["id"] for a in apps if a["state"] == "down"}
    said_failed = set()
    for c in commands:
        if c.state == "failed" and now - (c.done_at or 0) < 86400 and c.verb != "logs":
            app = next((a for a in apps if a["slug"] == c.app and a["server_id"] == c.server_id), None)
            if (app and app["id"] in down) or (c.server_id, c.app) in said_failed:
                continue
            said_failed.add((c.server_id, c.app))
            needs.append({"kind": "failed", "command": c.id, "app": app["id"] if app else None,
                          "server": c.server_id,
                          "said": f"{VERB_SAID.get(c.verb, c.verb)} of {app['name'] if app else c.app or 'the server'} failed",
                          "since": c.done_at})
    try:
        pages = data_pages(who)
    except Exception:  # noqa: BLE001 - the pages are a part of the page, never a reason for it to fail
        log.exception("apps: the workspace pages with data could not be read")
        pages = []
    ready = any(s["standard"] and s["state"] in ("ready", "silent") for s in servers)
    return {"apps": apps, "servers": servers, "needs": needs, "hosts": HOSTS, "ideas": IDEAS,
            "pages": pages, "plan": move_plan(apps, pages, servers), "ready": ready,
            "base": base, "reachable": reachable, "tokens": tokens, "now": now,
            "checked_at": max([a["checked_at"] for a in apps] or [0])}


# --- apps --------------------------------------------------------------------------------------------------

def slug_of(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(name or "").lower()).strip("-")
    if s and not s[0].isalpha():
        s = "app-" + s
    s = s[:28].strip("-")
    return s if NAME.fullmatch(s) else ""


def _clean_url(url: str) -> str:
    url = str(url or "").strip()
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise Refused("That address is not a web address. Give one such as https://notes.example.com.")
    return url


def _server_of(who, server_id):
    from .models import AppServer

    if server_id in (None, "", 0, "0", "elsewhere"):
        return None
    try:
        sid = int(server_id)
    except (TypeError, ValueError):
        raise Refused("There is no such server.") from None
    s = AppServer.objects.filter(id=sid, **_ids(who)).first()
    if s is None:
        raise Refused("There is no such server.")
    return s


def add_app(who, *, name: str, url: str = "", server_id=None, elsewhere: str = "", what: str = "",
            slug: str = "", health_url: str = "", repo: str = "", kind: str = "", data_at: str = "",
            by: str = "page") -> dict:
    """List an app: one that runs somewhere already, or one about to be set up on an apps server."""
    from django.db import IntegrityError

    from .models import HostedApp

    name = str(name or "").strip()[:80]
    if not name:
        raise Refused("Give the app a name.")
    slug = slug_of(slug or name)
    if not slug:
        raise Refused("Give it a name with a letter first, such as Notes.")
    server = _server_of(who, server_id)
    try:
        row = HostedApp.objects.create(**_ids(who), slug=slug, name=name, what=str(what or "").strip()[:400],
                                       url=_clean_url(url), health_url=_clean_url(health_url),
                                       server=server, elsewhere="" if server else str(elsewhere or "").strip()[:120],
                                       repo=str(repo or "").strip()[:400], kind=str(kind or "")[:20],
                                       data_at=str(data_at or "").strip()[:300],
                                       made_at=time.time(), made_by=by)
    except IntegrityError:
        raise Refused(f"An app called {slug} is already on the list.") from None
    return {"id": row.id, "slug": row.slug, "name": row.name}


def _app(who, ident):
    from .models import HostedApp

    q = HostedApp.objects.filter(**_ids(who))
    row = None
    if isinstance(ident, int) or str(ident or "").isdigit():
        row = q.filter(id=int(ident)).first()
    if row is None and ident:
        s = str(ident).strip().lower()
        row = q.filter(slug=s).first() or q.filter(name__iexact=str(ident).strip()).first()
    if row is None:
        raise Refused("There is no such app on the list.")
    return row


def edit_app(who, ident, **changes) -> dict:
    row = _app(who, ident)
    if "name" in changes and str(changes["name"] or "").strip():
        row.name = str(changes["name"]).strip()[:80]
    if "url" in changes:
        row.url = _clean_url(changes["url"])
    if "health_url" in changes:
        row.health_url = _clean_url(changes["health_url"])
    if "what" in changes:
        row.what = str(changes["what"] or "").strip()[:400]
    if "repo" in changes:
        row.repo = str(changes["repo"] or "").strip()[:400]
    if "data_at" in changes:
        row.data_at = str(changes["data_at"] or "").strip()[:300]
    if "server_id" in changes or "elsewhere" in changes:
        server = _server_of(who, changes.get("server_id", row.server_id))
        row.server = server
        row.elsewhere = "" if server else str(changes.get("elsewhere", row.elsewhere) or "").strip()[:120]
    row.save()
    return {"id": row.id, "slug": row.slug, "name": row.name}


def remove_app(who, ident) -> str:
    """Off the list only: nothing on any server is stopped or deleted."""
    row = _app(who, ident)
    name = row.name
    row.delete()
    return f"{name} is off the list. Nothing on its server was stopped or deleted."


# --- commands ---------------------------------------------------------------------------------------------

def _args(verb: str, args) -> dict:
    out = {}
    for k, v in dict(args or {}).items():
        if k not in VERBS[verb]:
            raise Refused(f"{VERB_SAID[verb]} takes no {k}.")
        if isinstance(v, bool):
            out[k] = v
            continue
        v = str(v if v is not None else "").strip()
        if not v:
            continue
        if v.startswith("-") or len(v) > 300 or any(ch in v for ch in "\n\r\0"):
            raise Refused(f"That {k} cannot be used.")
        out[k] = v
    return out


def ask(who, ident, verb: str, args=None, *, by: str = "page", server_id=None) -> dict:
    """Queue a command for an app's server; the server takes it within a minute (`agent`)."""
    from .models import AppCommand

    verb = str(verb or "").strip().lower()
    if verb not in VERBS:
        raise Refused(f"{verb or 'That'} is not something an apps server does. It does: {', '.join(VERBS)}.")
    if verb == "check" and not ident:
        server = _server_of(who, server_id)
        if server is None:
            raise Refused("Which server?")
        slug = ""
    else:
        row = _app(who, ident)
        server = row.server
        slug = row.slug
        if server is None:
            raise Refused(f"{row.name} is not on one of your apps servers, so Rouh cannot {VERB_SAID[verb].lower()} it "
                          f"from here. Ask Rouh to move it onto your apps server.")
    if not server.standard:
        raise Refused(f"{server.name} is not set up as an apps server, so it takes no commands.")
    if server.state != "ready":
        raise Refused(f"{server.name} has not called in yet.")
    if AppCommand.objects.filter(server=server, app=slug, verb=verb, state__in=("waiting", "sent", "running")).exists():
        raise Refused(f"{VERB_SAID[verb]} is already on its way.")
    c = AppCommand.objects.create(**_ids(who), server=server, app=slug, verb=verb, args=_args(verb, args),
                                  asked_at=time.time(), asked_by=by)
    return _command_dict(c)


def result(who, command_id) -> dict:
    from .models import AppCommand

    c = AppCommand.objects.filter(id=int(command_id), **_ids(who)).first()
    if c is None:
        raise Refused("There is no such command.")
    return _command_dict(c)


# --- servers ----------------------------------------------------------------------------------------------

def _next_name(who) -> str:
    from .models import AppServer

    taken = set(AppServer.objects.filter(**_ids(who)).values_list("name", flat=True))
    n = 1
    while f"apps-{n}" in taken:
        n += 1
    return f"apps-{n}"


def new_server(who, *, host: str = "hostinger", name: str = "", asked: str = "") -> dict:
    """A server waiting to join: its line and its first-boot script."""
    from django.db import IntegrityError

    from . import encryption
    from .models import AppServer

    host = host if host in HOST_IDS else "other"
    name = slug_of(name) if name else _next_name(who)
    if not name:
        raise Refused("Give the server a short name, such as apps-1.")
    code = secrets.token_urlsafe(32)
    try:
        s = AppServer.objects.create(**_ids(who), name=name, host=host, state="waiting", standard=True,
                                     join_sealed=encryption.box().seal(code), join_until=time.time() + JOIN_DAYS * 86400,
                                     made_at=time.time())
    except IntegrityError:
        raise Refused(f"A server called {name} is already listed.") from None
    return {"server": _server_dict(s, time.time()), **setup_for(who, s.id, asked)}


def setup_for(who, server_id, asked: str = "") -> dict:
    """The line and the first-boot script of a server still waiting, shown again for as long as it waits."""
    from . import encryption
    from .models import AppServer

    s = AppServer.objects.filter(id=int(server_id), **_ids(who)).first()
    if s is None or s.state != "waiting" or not s.join_sealed:
        raise Refused("That server is not waiting to join.")
    base, reachable = base_address(asked)
    code = encryption.box().open_(s.join_sealed)
    url = f"{base}{JOIN_PREFIX}{code}"
    return {"line": f"curl -fsSL {url} | sudo bash", "boot": f"#!/bin/bash\ncurl -fsSL {url} | bash\n",
            "reachable": reachable, "base": base, "until": s.join_until}


def register_server(who, *, name: str, address: str = "", host: str = "other", note: str = "") -> dict:
    """A server that already runs apps, listed without the agent: its apps are checked by their address."""
    from django.db import IntegrityError

    from .models import AppServer

    name = str(name or "").strip()[:60]
    if not name:
        raise Refused("Give the server a name.")
    try:
        s = AppServer.objects.create(**_ids(who), name=name, host=host if host in HOST_IDS else "other",
                                     address=str(address or "").strip()[:200], state="elsewhere", standard=False,
                                     made_at=time.time(), note=str(note or "").strip()[:300])
    except IntegrityError:
        raise Refused(f"A server called {name} is already listed.") from None
    return _server_dict(s, time.time())


def remove_server(who, server_id) -> str:
    """Off the list, and its key no longer good. The machine itself is not touched: it is the person's."""
    from .models import AppServer, HostedApp

    s = _server_of(who, server_id)
    if s is None:
        raise Refused("There is no such server.")
    on = HostedApp.objects.filter(server=s, **_ids(who)).update(elsewhere=s.address or s.name)
    name = s.name
    s.delete()
    if s.state == "waiting":
        return f"{name} is off the list, and its line no longer works."
    return (f"{name} is off the list and can no longer call in. The server itself still runs"
            + (f", with its {on} app{'s' if on != 1 else ''}, now listed as elsewhere." if on else "."))


# --- joining (the server, no sign-in) ---------------------------------------------------------------------

def _waiting(code: str):
    from . import encryption
    from .models import AppServer

    if not code or len(code) > 100:
        return None
    for s in AppServer.objects.filter(state="waiting").exclude(join_sealed=""):
        try:
            if secrets.compare_digest(encryption.box().open_(s.join_sealed), code):
                return s if s.join_until > time.time() else None
        except Exception:  # noqa: BLE001 - a row sealed with another key is nobody's code
            continue
    return None


def _files() -> str:
    """The apps server's own files, as here-documents for setup.sh (`CONTRACT.md`, section 1)."""
    out = []
    for name, mode in (("rouh-app", "0755"), ("rouh-apps-agent", "0755"), ("rouh-apps-agent.service", "0644"),
                       ("rouh-apps-backup.service", "0644"), ("rouh-apps-backup.timer", "0644")):
        text = (HERE / name).read_text()
        if any(line == "ROUH_FILE_END" for line in text.splitlines()):
            raise RuntimeError(f"{name} has a line that would end its here-document")
        out.append(f"put_file {name} {mode} <<'ROUH_FILE_END'\n{text.rstrip(chr(10))}\nROUH_FILE_END")
    return "\n".join(out)


def join_script(code: str, base: str) -> str:
    s = _waiting(code)
    if s is None:
        return SPENT_SCRIPT.format(why="this setup line is used up or out of date. Make a new one on the Apps page.")
    text = (HERE / "setup.sh").read_text()
    return (text.replace("__ROUH_URL__", base.rstrip("/")).replace("__JOIN_CODE__", code)
            .replace("__FILES__", _files()))


def _facts(body: dict) -> dict:
    out = {}
    for k in ("hostname", "ip", "os", "version"):
        out[k] = str(body.get(k) or "")[:120]
    for k in ("cpus", "memory_mb", "disk_gb", "memory_free_mb", "disk_free_gb", "uptime_s"):
        try:
            out[k] = int(float(body.get(k) or 0))
        except (TypeError, ValueError):
            out[k] = 0
    try:
        out["load"] = round(float(body.get("load") or 0), 2)
    except (TypeError, ValueError):
        out["load"] = 0
    return out


def join(code: str, body: dict, base: str) -> dict:
    """The server's one call back: its facts in, its agent's key out, and the code spent."""
    s = _waiting(code)
    if s is None:
        raise Refused("This setup line is used up or out of date. Make a new one on the Apps page.")
    key = secrets.token_urlsafe(32)
    facts = _facts(body)
    keys = [str(k)[:800] for k in (body.get("ssh_host_keys") or []) if isinstance(k, str)][:6]
    facts["ssh_host_keys"] = keys
    s.key_hash = _hash(key)
    s.state = "ready"
    s.join_sealed = ""
    s.joined_at = s.seen_at = time.time()
    s.address = facts.get("ip") or s.address
    s.facts = facts
    s.save()
    _say(Who(s.user_id, s.org_id), title=f"Your apps server {s.name} is ready",
         body=f"It called in from {s.address or 'its address'}. Rouh can now put apps on it.",
         key=f"apps-server-ready-{s.id}")
    return {"server_id": s.id, "name": s.name, "key": key, "rouh": base.rstrip("/"), "every": 30,
            "ssh_keys": ssh_keys(Who(s.user_id, s.org_id))}


# --- the agent (the server, on its key) -------------------------------------------------------------------

def ssh_keys(who) -> list[str]:
    """The public keys that may log in to the person's apps servers as `rouh`: the installation's
    (ROUH_APPS_SSH_KEYS, one per line) and the person's own (`manage.py apps ssh-key`)."""
    from .models import UserSetting

    keys = [k.strip() for k in os.environ.get("ROUH_APPS_SSH_KEYS", "").replace(",", "\n").splitlines() if k.strip()]
    row = UserSetting.objects.filter(**_ids(who), name="apps_ssh_keys").first()
    if row:
        try:
            keys += [str(k).strip() for k in json.loads(row.value) or [] if str(k).strip()]
        except ValueError:
            pass
    good = re.compile(r"^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp\d+|sk-ssh-ed25519@openssh\.com) [A-Za-z0-9+/=]+( [^\n]*)?$")
    return list(dict.fromkeys(k for k in keys if good.match(k)))


def set_ssh_keys(who, keys: list[str]) -> list[str]:
    from .models import UserSetting

    UserSetting.objects.update_or_create(**_ids(who), name="apps_ssh_keys",
                                         defaults={"value": json.dumps([str(k).strip() for k in keys if str(k).strip()]),
                                                   "updated_at": time.time()})
    return ssh_keys(who)


def server_by_key(key: str):
    from .models import AppServer

    key = str(key or "").strip()
    if not key or len(key) > 100:
        return None
    return AppServer.objects.filter(key_hash=_hash(key), state="ready", standard=True).first()


def agent(server, body: dict) -> dict:
    """One call of a server's agent (`CONTRACT.md`, section 2): what it says in, its commands out."""
    from django.db import transaction

    from .models import AppCommand, HostedApp

    now = time.time()
    who = Who(server.user_id, server.org_id)
    me = _ids(who)
    system = body.get("system") if isinstance(body.get("system"), dict) else {}
    facts = dict(server.facts or {})
    facts.update({k: v for k, v in _facts(system).items() if v or k in ("load",)})
    server.facts = facts
    server.seen_at = now
    full = not server.full_at or now - server.full_at > FULL_EVERY
    for t in body.get("taken") or []:
        AppCommand.objects.filter(id=_int(t), server=server, state="sent").update(state="running")
    for r in body.get("results") or []:
        if not isinstance(r, dict):
            continue
        done = AppCommand.objects.filter(id=_int(r.get("id")), server=server,
                                         state__in=("sent", "running")).first()
        if done is None:
            continue
        done.state = "done" if r.get("ok") else "failed"
        done.output = str(r.get("output") or "")[-OUTPUT_MOST:]
        done.done_at = now
        done.save()
        full = True
        if done.state == "failed" and done.verb != "logs":
            app = HostedApp.objects.filter(server=server, slug=done.app, **me).first()
            _say(who, title=f"{VERB_SAID.get(done.verb, done.verb)} of {app.name if app else done.app or server.name} failed",
                 body=_last_line(done.output), key=f"apps-command-failed-{done.id}",
                 link=f"{ROUTE}/{app.slug}" if app else ROUTE)
    if isinstance(body.get("apps"), list):
        server.full_at = now
        _take_report(server, who, body["apps"])
    with transaction.atomic():
        waiting = list(AppCommand.objects.select_for_update().filter(server=server, state="waiting").order_by("asked_at", "id")[:5])
        for c in waiting:
            c.state = "sent"
            c.sent_at = now
            c.save(update_fields=["state", "sent_at"])
    # A command sent ten minutes ago and never taken (the agent restarted mid-way) goes back in the queue once.
    AppCommand.objects.filter(server=server, state="sent", sent_at__lt=now - 600).update(state="waiting")
    server.save(update_fields=["facts", "seen_at", "full_at"])
    return {"commands": [{"id": c.id, "verb": c.verb, "app": c.app, "args": c.args or {}} for c in waiting],
            "ssh_keys": ssh_keys(who), "every": 30, "full": full}


def _int(v) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return 0


def _last_line(text: str) -> str:
    lines = [ln for ln in str(text or "").splitlines() if ln.strip()]
    return lines[-1][:300] if lines else "It gave no reason."


def _take_report(server, who, apps: list) -> None:
    from .models import HostedApp

    me = _ids(who)
    for one in apps[:200]:
        if not isinstance(one, dict):
            continue
        slug = str(one.get("name") or "")
        if not NAME.fullmatch(slug):
            continue
        rep = {k: one.get(k) for k in ("kind", "url", "test_url", "state", "release", "released_at",
                                       "previous_release", "repo", "branch", "deploy_key", "memory_mb",
                                       "memory_limit", "backup_at", "backup_ok", "restore_test_at",
                                       "restore_test_ok", "last_error")}
        rep = {k: (v if isinstance(v, (int, float, bool)) or v is None else str(v)[:800]) for k, v in rep.items()}
        row = HostedApp.objects.filter(slug=slug, **me).first()
        if row is None:
            HostedApp.objects.create(**me, slug=slug, name=slug.replace("-", " ").capitalize(), server=server,
                                     url=str(rep.get("url") or ""), kind=str(rep.get("kind") or ""),
                                     repo=str(rep.get("repo") or ""), report=rep, made_at=time.time(), made_by="server")
            continue
        if row.server_id not in (None, server.id):
            continue
        row.server = server
        row.elsewhere = ""
        row.report = rep
        if not row.url and rep.get("url"):
            row.url = str(rep["url"])
        if rep.get("kind"):
            row.kind = str(rep["kind"])
        if rep.get("repo"):
            row.repo = str(rep["repo"])
        row.save()


# --- checking by address -----------------------------------------------------------------------------------

def _probe(url: str, timeout: float = 8.0) -> tuple[bool, str]:
    """Whether the address answers: any answer under 500 is an app that is up (a sign-in page included)."""
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": "Rouh-Apps-Check/1"})
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - the person's own app
            return True, f"Answered {r.status} in {int((time.time() - started) * 1000)} ms."
    except urllib.error.HTTPError as e:
        if e.code < 500:
            return True, f"Answered {e.code} in {int((time.time() - started) * 1000)} ms."
        return False, f"Answered {e.code}: the app is up but failing."
    except urllib.error.URLError as e:
        why = getattr(e, "reason", e)
        return False, f"No answer: {str(why)[:160]}."
    except Exception as e:  # noqa: BLE001 - a timeout, a reset: all the same to the person
        return False, f"No answer: {str(e)[:160] or type(e).__name__}."


def check(who, ident=None) -> list[dict]:
    """Check one app or all of them by their address, now."""
    from .models import HostedApp

    rows = [_app(who, ident)] if ident else list(HostedApp.objects.filter(**_ids(who)))
    out = []
    for row in rows:
        out.append(_check_row(row))
    return out


def _check_row(row) -> dict:
    url = row.health_url or row.url
    now = time.time()
    if not url:
        row.state, row.check_said = "unknown", "It has no address to check."
    else:
        ok, said = _probe(url)
        was = row.state
        row.state, row.check_said = ("answering" if ok else "down"), said
        if ok:
            if was == "down" and row.down_since:
                _say(Who(row.user_id, row.org_id), title=f"{row.name} is answering again",
                     body=said, key=f"apps-up-{row.id}-{int(row.down_since)}", link=f"{ROUTE}/{row.slug}")
            row.down_since = 0
        elif was != "down":
            row.down_since = now
            _say(Who(row.user_id, row.org_id), title=f"{row.name} is not answering",
                 body=f"{said} Open Apps to restart it, look at its logs or ask Rouh to fix it.",
                 key=f"apps-down-{row.id}-{int(now)}", link=f"{ROUTE}/{row.slug}")
    row.checked_at = now
    row.save(update_fields=["state", "check_said", "checked_at", "down_since"])
    return {"id": row.id, "name": row.name, "state": row.state, "said": row.check_said}


def _say(who, *, title: str, body: str = "", key: str = "", link: str = ROUTE) -> None:
    try:
        from . import notices

        notices.post(who, title=title, body=body, link=link, link_label="Apps", kind="apps", key=key)
    except Exception:  # noqa: BLE001 - a notice that cannot be written leaves the page to say it
        log.exception("apps: a notice could not be written")


async def watch_loop() -> None:
    """Every app of everybody's, checked by its address every five minutes."""
    await asyncio.sleep(90)
    while True:
        try:
            await asyncio.to_thread(_watch_once)
        except Exception:  # noqa: BLE001 - the next round tries again
            log.exception("apps: the round of checks failed")
        await asyncio.sleep(CHECK_EVERY)


def _watch_once() -> None:
    from django.db import close_old_connections

    from .models import HostedApp

    close_old_connections()
    try:
        cutoff = time.time() - CHECK_EVERY + 30
        for row in HostedApp.objects.filter(checked_at__lt=cutoff).exclude(url="", health_url="")[:200]:
            _check_row(row)
    finally:
        close_old_connections()


# --- Hostinger, with the person's API token --------------------------------------------------------------

HOSTINGER_API = "https://developers.hostinger.com"


def _hostinger_base() -> str:
    return os.environ.get("ROUH_HOSTINGER_API", HOSTINGER_API).rstrip("/")


def _hostinger(token: str, method: str, path: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(_hostinger_base() + path, data=data, method=method,
                                 headers={"Authorization": f"Bearer {token}", "Accept": "application/json",
                                          "Content-Type": "application/json", "User-Agent": "Rouh-Apps/1"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:  # noqa: S310 - Hostinger's API
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        try:
            said = json.loads(e.read() or b"{}").get("message") or ""
        except ValueError:
            said = ""
        if e.code in (401, 403):
            raise Refused("Hostinger did not accept the token. Make a new one in hPanel, Profile, API.") from None
        raise Refused(f"Hostinger said no ({e.code}){': ' + said if said else ''}.") from None
    except urllib.error.URLError as e:
        raise Refused(f"Hostinger could not be reached: {getattr(e, 'reason', e)}.") from None


def _token(who, host: str = "hostinger") -> str:
    from . import encryption
    from .models import HostToken

    row = HostToken.objects.filter(**_ids(who), host=host).first()
    if row is None:
        raise Refused("No Hostinger token is saved. Make one in hPanel, Profile, API, and paste it on the Apps page.")
    return encryption.box().open_(row.sealed)


def save_token(who, token: str, host: str = "hostinger") -> dict:
    """Check the token with Hostinger (it lists the VPSs) and keep it sealed."""
    from . import encryption
    from .models import HostToken

    token = str(token or "").strip()
    if len(token) < 20 or len(token) > 400 or any(c.isspace() for c in token):
        raise Refused("That does not look like a Hostinger API token.")
    vms = _hostinger(token, "GET", "/api/vps/v1/virtual-machines")
    HostToken.objects.update_or_create(**_ids(who), host=host,
                                       defaults={"sealed": encryption.box().seal(token), "last4": token[-4:],
                                                 "saved_at": time.time()})
    return {"count": len(vms) if isinstance(vms, list) else 0}


def forget_token(who, host: str = "hostinger") -> str:
    from .models import HostToken

    HostToken.objects.filter(**_ids(who), host=host).delete()
    return "The Hostinger token is forgotten."


def _vm(v: dict) -> dict:
    ips = [i.get("address") for i in (v.get("ipv4") or []) if isinstance(i, dict) and i.get("address")]
    tpl = v.get("template") or {}
    return {"id": v.get("id"), "hostname": v.get("hostname") or "", "state": v.get("state") or "",
            "plan": v.get("plan") or "", "ip": ips[0] if ips else "", "cpus": v.get("cpus"),
            "memory_mb": v.get("memory"), "disk_mb": v.get("disk"),
            "template": tpl.get("name", "") if isinstance(tpl, dict) else "",
            "data_center_id": v.get("data_center_id"), "fresh": v.get("state") == "initial"}


def hostinger_vps(who) -> list[dict]:
    from .models import AppServer

    used = set(AppServer.objects.filter(**_ids(who), host="hostinger").exclude(host_ref="")
               .values_list("host_ref", flat=True))
    out = []
    for v in _hostinger(_token(who), "GET", "/api/vps/v1/virtual-machines") or []:
        if isinstance(v, dict):
            one = _vm(v)
            one["ours"] = str(one["id"]) in used
            out.append(one)
    return out


def _ubuntu(templates) -> int:
    best = None
    for t in templates or []:
        name = str(t.get("name") or "")
        if re.fullmatch(r"Ubuntu 24\.04( LTS)?(| 64bit)", name.strip()) or name.strip() in ("Ubuntu 24.04", "Ubuntu 24.04 LTS"):
            return int(t["id"])
        if best is None and name.startswith("Ubuntu 24.04") and "panel" not in name.lower() and "with" not in name.lower():
            best = int(t["id"])
    if best is None:
        raise Refused("Hostinger offers no plain Ubuntu 24.04 just now. Use the line in the browser terminal instead.")
    return best


def hostinger_setup(who, vm_id, *, name: str = "", wipe: bool = False, confirm: str = "", asked: str = "") -> dict:
    """Make the VPS an apps server through Hostinger's API: a new VPS (state initial) is set up with Ubuntu
    24.04 and Rouh's post-install script; one already installed is wiped and installed again only with
    `wipe` and its hostname typed back as `confirm`, because everything on it is lost."""
    from .models import AppServer

    token = _token(who)
    vms = {str(v["id"]): v for v in hostinger_vps(who)}
    vm = vms.get(str(vm_id))
    if vm is None:
        raise Refused("That VPS is not in your Hostinger account.")
    if vm["ours"]:
        raise Refused("That VPS is already one of your apps servers.")
    if not vm["fresh"]:
        if not wipe:
            raise Refused(f"{vm['hostname']} is already installed. Setting it up wipes everything on it.")
        if str(confirm or "").strip().lower() != vm["hostname"].lower():
            raise Refused(f"Type its name, {vm['hostname']}, to wipe it and set it up.")
    made = new_server(who, host="hostinger", name=name, asked=asked)
    sid = made["server"]["id"]
    if not made["reachable"]:
        AppServer.objects.filter(id=sid, **_ids(who)).delete()
        raise Refused("A new server could not reach this Rouh: it has no address on the internet yet.")
    try:
        script = _hostinger(token, "POST", "/api/vps/v1/post-install-scripts",
                            {"name": f"Rouh apps server {made['server']['name']}", "content": made["boot"]})
        template = _ubuntu(_hostinger(token, "GET", "/api/vps/v1/templates"))
        if vm["fresh"]:
            _hostinger(token, "POST", f"/api/vps/v1/virtual-machines/{int(vm['id'])}/setup",
                       {"template_id": template, "data_center_id": vm["data_center_id"],
                        "post_install_script_id": script.get("id"), "enable_backups": True})
        else:
            _hostinger(token, "POST", f"/api/vps/v1/virtual-machines/{int(vm['id'])}/recreate",
                       {"template_id": template, "post_install_script_id": script.get("id")})
    except Refused:
        AppServer.objects.filter(id=sid, **_ids(who)).delete()
        raise
    AppServer.objects.filter(id=sid, **_ids(who)).update(host_ref=str(vm["id"]), address=vm["ip"])
    return {"server": made["server"], "said": f"Hostinger is installing {vm['hostname']}. It calls in by itself "
                                               f"in about ten minutes."}


# --- the `apps` tool (the chat and every job) ------------------------------------------------------------

def how() -> str:
    """The runbook a job follows to build and run an app on an apps server (`deploy/apps-server/README.md`)."""
    try:
        return (HERE / "README.md").read_text()
    except OSError:
        return ("The runbook is not in this Rouh's code (deploy/apps-server/README.md). In short: each app is a "
                "git repository with rouh-app.json, pinned requirements.txt and a /healthz; put it on an apps "
                "server with the apps tool, command new, then deploy.")


def _when(t: float) -> str:
    if not t:
        return "never"
    gone = time.time() - t
    if gone < 90:
        return "just now"
    if gone < 5400:
        return f"{int(gone // 60)} min ago"
    if gone < 172800:
        return f"{int(gone // 3600)} h ago"
    return f"{int(gone // 86400)} days ago"


def _said_list(p: dict) -> str:
    lines = []
    if not p["apps"]:
        lines.append("No apps on the list yet.")
    for a in p["apps"]:
        where = a["server"] or (a["elsewhere"] and f"elsewhere ({a['elsewhere']})") or "elsewhere"
        bits = [f"{a['name']} [{a['slug']}, id {a['id']}]: {a['state']} ({_when(a['checked_at'])}, {a['check_said'] or 'not checked'})",
                f"address {a['url'] or 'none'}", f"on {where}"]
        if a["managed"]:
            bits.append(f"release {a['release'] or 'none'} ({_when(a['released_at'])})")
            bits.append(f"backup {_when(a['backup_at'])}{' FAILED' if a['backup_ok'] is False else ''}")
            bits.append(f"test restore {_when(a['restore_test_at'])}{' FAILED' if a['restore_test_ok'] is False else ''}")
            if a["deploy_key"]:
                bits.append(f"deploy key {a['deploy_key']}")
        for c in a["commands"][:3]:
            bits.append(f"{c['said']} #{c['id']} {c['state']} {_when(c['done_at'] or c['asked_at'])}")
        if a["data_at"]:
            bits.append(f"data: {a['data_at']}")
        lines.append("; ".join(bits))
    for pg in p["pages"]:
        lines.append(f"Workspace page with its own data, {pg['name']} ({pg['rel']}): {pg['data_at']}; on Rouh's own server.")
    if p["plan"]["steps"]:
        lines.append(f"Moving plan: {len(p['plan']['steps'])} to move onto the apps server, none moved yet.")
    if not p["servers"]:
        lines.append("No apps server yet: new_server makes the line that sets one up.")
    for s in p["servers"]:
        lines.append(f"Server {s['name']} (id {s['id']}, {s['host_name']}, {s['address'] or 'no address yet'}): {s['state']}"
                     + (f", last called in {_when(s['seen_at'])}" if s["seen_at"] else "")
                     + (f", {s['memory_free_mb']} of {s['memory_mb']} MB memory free, {s['disk_free_gb']} of {s['disk_gb']} GB disk free"
                        if s.get("memory_mb") else "")
                     + ("" if s["standard"] else ", not an apps server: its apps are only checked by address"))
    for n in p["needs"]:
        lines.append(f"Needs attention: {n['said']}.")
    return "\n".join(lines)


def _server_named(who, name):
    from .models import AppServer

    if name in (None, "", "elsewhere"):
        return None
    s = AppServer.objects.filter(**_ids(who), name=str(name).strip()).first()
    if s is None and str(name).isdigit():
        s = AppServer.objects.filter(**_ids(who), id=int(name)).first()
    if s is None:
        raise Refused(f"There is no apps server called {name}.")
    return s.id


def tool(who, action: str, args: dict, by: str = "rouh") -> str:
    if action == "list":
        return _said_list(page(who))
    if action == "how":
        return how()
    if action == "check":
        got = check(who, args.get("app") or None)
        return "\n".join(f"{g['name']}: {g['state']}, {g['said']}" for g in got) or "No apps to check."
    if action == "add":
        got = add_app(who, name=args.get("name") or args.get("app"), url=args.get("url"),
                      server_id=_server_named(who, args.get("server")), elsewhere=args.get("elsewhere"),
                      what=args.get("what"), repo=args.get("repo"), data_at=args.get("data_at"), by=by)
        checked = check(who, got["id"])[0]
        return f"{got['name']} is on the list as {got['slug']} (id {got['id']}): {checked['state']}, {checked['said']}"
    if action == "edit":
        fields = {k: args[k] for k in ("name", "url", "what", "repo", "elsewhere", "data_at") if k in args}
        if "server" in args:
            fields["server_id"] = _server_named(who, args.get("server"))
        got = edit_app(who, args.get("app"), **fields)
        return f"{got['name']} is saved."
    if action == "remove":
        return remove_app(who, args.get("app"))
    if action == "command":
        c = ask(who, args.get("app"), args.get("verb"), args.get("args") or {}, by=by)
        return (f"{c['said']} of {c['app']} is queued as command {c['id']}; the server takes it within a minute. "
                f"Ask result with id {c['id']} for its output.")
    if action == "result":
        c = result(who, args.get("id"))
        return f"Command {c['id']} ({c['said']} {c['app']}): {c['state']}.\n{c['output']}".rstrip()
    if action == "new_server":
        got = new_server(who, host=str(args.get("host") or "hostinger"), name=str(args.get("name") or ""))
        warn = "" if got["reachable"] else ("\nWarning: this Rouh has no address on the internet, so a server "
                                           "cannot reach it until it has one.")
        return (f"Server {got['server']['name']} waits to join for {JOIN_DAYS} days. On the server, as root:\n"
                f"{got['line']}\nOr as the host's first-boot script:\n{got['boot']}"
                f"The Apps page (/apps) shows these and turns to Ready when it calls in.{warn}")
    raise Refused("The actions are list, how, check, add, edit, remove, command, result and new_server.")
