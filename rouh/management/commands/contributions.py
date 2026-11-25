"""``python manage.py contributions``: rouh-core's pull requests as Rouh knows them, each with its
review, and when the next weekly digest is (`rouh/contributions.py`, task 98, gap G11).

    python manage.py contributions            what is known now
    python manage.py contributions --tick     look at GitHub now, then say it
    python manage.py contributions --json     the record, as JSON

In the containers, from the machine: docker compose exec core python manage.py contributions
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "rouh-core's pull requests, each with Rouh's review, and the next weekly digest."

    def add_arguments(self, parser):
        parser.add_argument("--tick", action="store_true", help="look at GitHub now")
        parser.add_argument("--json", action="store_true")

    def handle(self, *args, **opts):
        os.environ.setdefault("DJANGO_ALLOW_ASYNC_UNSAFE", "true")
        from rouh import contributions as c, telegram
        from rouh.tenancy import Tenancy

        owner = telegram.phone_owner(Tenancy())
        if owner is None:
            raise CommandError("This Rouh has no owner yet.")
        if not c.here():
            self.stdout.write("This Rouh does not make Rouh's releases, so it reviews no pull requests "
                              "(ROUH_CONTRIBUTIONS=1 turns it on).")
            if not opts["tick"]:
                return
        if opts["tick"]:
            got = asyncio.run(c.tick(owner))
            self.stdout.write("Looked: " + json.dumps({k: v for k, v in got.items() if v}))
        doc = c.state()
        if opts["json"]:
            self.stdout.write(json.dumps(doc, indent=1))
            return
        for r in sorted(doc["prs"].values(), key=lambda r: int(r["number"])):
            rec, why = c.recommendation(r)
            where = ("on Decisions" if c.shown(r) else "answered" if r.get("answered")
                     else "waiting for the digest" if r.get("state") == "open" else r.get("state"))
            self.stdout.write(f"#{r['number']} {r.get('title')} by {r.get('author')}: "
                              f"{(r.get('risk') or {}).get('level')} risk, tests {(r.get('checks') or {}).get('state')}, "
                              f"recommends {c.LABELS[rec].lower()} ({why}); {where}"
                              + (" [security]" if r.get("security") else ""))
        if not doc["prs"]:
            self.stdout.write("No pull requests seen yet.")
        nxt = c.next_digest(float(doc.get("digest_at") or time.time()), owner)
        self.stdout.write(f"Next digest: {datetime.fromtimestamp(nxt).isoformat(timespec='minutes')}"
                          " (only if something waits for it).")
