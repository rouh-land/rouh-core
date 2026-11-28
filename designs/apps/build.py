#!/usr/bin/env python3
"""Builds the Apps prototype: one self-contained folder per state, from proto.html and the data below.

    python3 designs/apps/build.py

Every name, address and number here is made up, at the scale of a real Rouh on 28 November 2026
(6 apps on 2 servers that are not apps servers, 4 pages with data, a moving plan of 10). Times are
seconds ago, so each page reads true whenever it is opened.
"""
import copy
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent

HOSTS = [
    {"id": "hostinger", "name": "Hostinger", "recommended": True,
     "why": "Cheap, quick to buy, a browser terminal, and an API token lets Rouh do the setup with one press.",
     "plan": "A KVM 2 VPS (2 CPUs, 8 GB memory) holds a dozen small apps; KVM 1 is enough to start.",
     "buy": "https://www.hostinger.com/vps-hosting",
     "steps": ["Buy a KVM VPS at Hostinger. Rouh never buys it for you.",
               "When hPanel asks for the operating system, pick Ubuntu 24.04 (plain, without a panel).",
               "Open the VPS in hPanel and press Browser terminal.",
               "Paste the line below and press Enter. It takes about five minutes."],
     "boot": "Or, before you install it: in hPanel, VPS, Settings, Post-install script, paste the script below, then install Ubuntu 24.04. It runs by itself on the first start."},
    {"id": "hetzner", "name": "Hetzner", "why": "The best price for the power in Europe; servers in Germany and Finland.",
     "plan": "A CX22 or CAX11 is enough to start.", "buy": "https://console.hetzner.cloud/",
     "steps": ["In the Hetzner Cloud console, press Add Server.", "Pick a location and the image Ubuntu 24.04.",
               "Under Cloud config, paste the script below.", "Press Create & Buy now. The server sets itself up in about five minutes."],
     "boot": "Already have one? Log in to it and paste the line below."},
    {"id": "digitalocean", "name": "DigitalOcean", "why": "Simple and well documented; servers around the world.",
     "plan": "A Basic droplet with 2 GB memory is enough to start.", "buy": "https://cloud.digitalocean.com/droplets/new",
     "steps": ["Create a Droplet with the image Ubuntu 24.04.",
               "Under Advanced options, tick Add initialization scripts and paste the script below.",
               "Press Create Droplet. It sets itself up in about five minutes."],
     "boot": "Already have one? Log in to it and paste the line below."},
    {"id": "other", "name": "Any Linux server", "why": "Any server with Ubuntu 22.04 or newer, or Debian 12, that you can log in to.",
     "plan": "At least 1 GB memory and 20 GB disk.", "buy": "",
     "steps": ["Log in to the server as root, or as a user who may use sudo.",
               "Paste the line below and press Enter. It takes about five minutes."],
     "boot": "Or paste the script below where your host asks for a first-boot or user data script."},
]
IDEAS = [
    {"name": "Travel companion", "say": "Build me a travel companion app for my next trip: the plan by day, bookings, maps and a shared list for everyone coming."},
    {"name": "Wedding inviter", "say": "Build me a wedding invitation app: a page per guest, replies, plus-ones and meal choices, and a list I can see."},
    {"name": "Movie watch list", "say": "Build me a movie watch list app we can share at home, with ratings and what to watch next."},
    {"name": "A game", "say": "Build me a small game I can play on my phone and share with friends."},
    {"name": "Work helper", "say": "Build me a work helper app that "},
    {"name": "Email handler", "say": "Build me an app that handles a kind of email for me: "},
]
PAGES = [
    {"name": "New company name: shortlist and word lists", "href": "#page-1", "keeps": "A shared list of 66 entries, and your choices (about 7 KB)", "updated_at": 7200},
    {"name": "Pick the defaults", "href": "#page-2", "keeps": "Your choices on the page (about 18 KB)", "updated_at": 86400 * 2},
    {"name": "Glass orb and pruning", "href": "#page-3", "keeps": "Your choices on the page (about 1 KB)", "updated_at": 86400 * 4},
    {"name": "Pick the projects for each law", "href": "#page-4", "keeps": "Your choices on the page (about 1 KB)", "updated_at": 86400 * 9},
]
SITES = {"id": 1, "name": "the sites server", "host_name": "Any Linux server", "address": "203.0.113.50", "state": "elsewhere",
         "standard": False, "seen_at": 0, "made_at": 86400 * 3}
OLD = {"id": 2, "name": "the old server", "host_name": "Any Linux server", "address": "203.0.113.38", "state": "elsewhere",
       "standard": False, "seen_at": 0, "made_at": 86400 * 3, "data_note": "Rouh cannot see where their data is kept."}


def app(i, slug, name, url, server, what, data, **more):
    a = {"id": i, "slug": slug, "name": name, "url": url, "server_id": server, "elsewhere": "", "what": what,
         "state": "answering", "checked_at": 180, "check_said": "Answered 200 in 220 ms.", "down_since": 0,
         "data_at": data, "commands": [], "release": "", "previous_release": ""}
    a.update(more)
    return a


TODAY_APPS = [
    app(6, "briefings", "Briefings", "https://briefings.example.com", 2, "The morning briefings site", "Not known, because Rouh cannot reach the old server"),
    app(2, "leads", "Lead finder", "https://leads.example.com", 1, "Finds and scores sales leads", "Its own PostgreSQL database, leads, on the sites server"),
    app(1, "notes", "Meeting notes", "https://notes.example.com", 1, "The library of meeting notes", "Its own PostgreSQL database, notes, on the sites server"),
    app(3, "metrics", "Metrics", "https://metrics.example.com", 1, "The company's numbers", "Its own PostgreSQL database, metrics, on the sites server"),
    app(4, "social", "Social planner", "https://social.example.com", 1, "Plans and posts to social accounts", "Its own PostgreSQL database, social, on the sites server"),
    app(5, "bridge", "The Bridge", "https://bridge.example.com", 1, "The partners' meeting place", "Its own PostgreSQL database, bridge, on the sites server"),
]
BASE = {"hosts": HOSTS, "ideas": IDEAS, "reachable": True,
        "line": "curl -fsSL https://rouh.example.com/apps/join/k7Qm2xR9 | sudo bash",
        "boot": "#!/bin/bash\ncurl -fsSL https://rouh.example.com/apps/join/k7Qm2xR9 | bash",
        "vps": [{"id": 11, "hostname": "srv-4471.hstgr.cloud", "plan": "KVM 2", "state": "running, Ubuntu 24.04 with a panel", "fresh": False},
                {"id": 12, "hostname": "srv-5120.hstgr.cloud", "plan": "KVM 1", "state": "new, nothing installed", "fresh": True}]}


def state_today():
    return {**BASE, "apps": copy.deepcopy(TODAY_APPS), "servers": [SITES, OLD], "pages": PAGES}


def state_down():
    apps_srv = {"id": 3, "name": "apps-1", "host_name": "Hostinger", "address": "198.51.100.7", "state": "silent", "standard": True,
                "seen_at": 3 * 3600, "made_at": 86400 * 20, "joined_at": 86400 * 20, "os": "Ubuntu 24.04", "cpus": 2,
                "memory_mb": 8192, "disk_gb": 100, "disk_free_gb": 71}
    managed = dict(server_id=3, release="r14", released_at=86400, previous_release="r13", backup_at=6 * 3600, backup_ok=True,
                   restore_test_at=86400, restore_test_ok=True, memory_mb=180, memory_limit="512 MB",
                   repo="git@example.com:apps/notes.git", deploy_key="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK2 apps-1-notes")
    apps = [
        app(1, "notes", "Meeting notes", "https://notes.example.com", 3, "The library of meeting notes", "",
            **{**managed, "state": "down", "down_since": 42 * 60, "check_said": "No answer in 8 s.",
               "commands": [{"id": 90, "verb": "update", "said": "Update", "state": "done", "asked_at": 86400, "asked_by": "rouh", "output": "r14 on the test copy: answered 200\nr14 live: answered 200"}]}),
        app(7, "wedding", "Wedding invitations for Ana and Boris", "https://invitations.ana-and-boris.example.com", 3,
            "A page per guest, replies, plus-ones and meal choices", "",
            **{**managed, "backup_ok": False, "backup_at": 5 * 3600, "memory_mb": 140, "repo": "git@example.com:apps/wedding.git",
               "deploy_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIQ2 apps-1-wedding"}),
        app(8, "watch", "Movie watch list", "https://watch.example.com", 3, "What to watch next at home", "",
            **{**managed, "memory_mb": 96, "repo": "git@example.com:apps/watch.git", "deploy_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIM7 apps-1-watch",
               "last_error": "r15 on the test copy did not answer, so r14 stays live",
               "commands": [{"id": 92, "verb": "update", "said": "Update", "state": "failed", "asked_at": 2 * 3600, "done_at": 2 * 3600 - 300,
                             "asked_by": "rouh", "output": "r15 on the test copy: no answer in 30 s\nr14 stays live"}]}),
        app(2, "leads", "Lead finder", "https://leads.example.com", 1, "Finds and scores sales leads", "Its own PostgreSQL database, leads, on the sites server"),
        app(3, "metrics", "Metrics", "https://metrics.example.com", 1, "The company's numbers", "Its own PostgreSQL database, metrics, on the sites server"),
    ]
    for a in apps[:3]:
        a["data_at"] = f"Its own PostgreSQL database, app_{a['slug']}, and its files, on apps-1"
    return {**BASE, "apps": apps, "servers": [apps_srv, SITES], "pages": PAGES[:2]}


def state_app():
    d = state_down()
    d["servers"][0].update(state="ready", seen_at=25)
    a = d["apps"][0]
    a["commands"].insert(0, {"id": 91, "verb": "restart", "said": "Restart", "state": "running", "asked_at": 20, "asked_by": "page", "output": ""})
    return d


def state_setup():
    d = state_today()
    d["servers"] = [{"id": 4, "name": "apps-1", "host_name": "Hostinger", "address": "", "state": "waiting", "standard": True,
                     "seen_at": 0, "made_at": 120, "join_until": -(7 * 86400 - 120)}] + d["servers"]
    return d


def state_empty():
    return {**BASE, "apps": [], "servers": [], "pages": []}


STATES = {
    "a-today": (state_today, {"view": "home"}),
    "a-down": (state_down, {"view": "home"}),
    "a-app": (state_app, {"view": "app", "app": "notes"}),
    "a-setup": (state_setup, {"view": "setup", "line": True}),
    "a-plan": (state_today, {"view": "plan"}),
    "a-empty": (state_empty, {"view": "home"}),
}


def main():
    src = (HERE / "proto.html").read_text(encoding="utf-8")
    for name, (make, start) in STATES.items():
        out = HERE / name
        out.mkdir(exist_ok=True)
        page = src.replace("/*DATA*/", "var DATA = " + json.dumps(make(), ensure_ascii=False) + ";")
        page = page.replace("/*START*/", json.dumps(start))
        (out / "index.html").write_text(page, encoding="utf-8")
    print("built", ", ".join(STATES))


if __name__ == "__main__":
    main()
