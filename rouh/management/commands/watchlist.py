"""``python manage.py watchlist``: a person's watch list from a shell of the core (`rouh/watchlist.py`).

    python manage.py watchlist list                       # every title, in Up next's order
    python manage.py watchlist add "A title" [--imdb tt0000000] [--kind show] [--year 2022]
        [--status to_watch] [--where Netflix] [--notes "..."] [--recommended-by "..."] [--added 2026-11-27]
    python manage.py watchlist dump                       # every title as JSON

It acts for the installation's only person, or for `--user` (a username) where there are several.
`add` looks the title up as the page does: by its IMDb number when one is given, else by its words,
taking a match only when its name is the one given.
"""
from __future__ import annotations

import time
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "A person's watch list: list it, add a title, or dump it as JSON."

    def add_arguments(self, parser):
        parser.add_argument("what", choices=["list", "add", "dump"])
        parser.add_argument("title", nargs="?", default="")
        parser.add_argument("--user", default="")
        parser.add_argument("--imdb", default="")
        parser.add_argument("--kind", default="")
        parser.add_argument("--year", type=int)
        parser.add_argument("--status", default="to_watch")
        parser.add_argument("--where", default="")
        parser.add_argument("--notes", default="")
        parser.add_argument("--recommended-by", default="")
        parser.add_argument("--added", default="", help="the day it was first added, YYYY-MM-DD")

    def handle(self, *args, **o):
        from rouh import watchlist
        from rouh.models import User
        from rouh.tenancy import Tenancy

        tenancy = Tenancy()
        if o["user"]:
            user = User.objects.filter(username=o["user"]).first()
            if user is None:
                raise CommandError(f"There is no account {o['user']!r}.")
            who = tenancy.identity_of(str(user.pk))
        else:
            who = tenancy.only_person()
        if who is None:
            raise CommandError("Say whose watch list with --user.")
        if o["what"] == "list":
            self.stdout.write(watchlist.for_model(who) or "The watch list is empty.")
            return
        if o["what"] == "dump":
            self.stdout.write(watchlist.dump(who))
            return
        title = o["title"].strip()
        if not title:
            raise CommandError("Give the title.")
        pick = None
        if o["imdb"]:
            pick = {"imdb_id": o["imdb"], "title": title, "kind": o["kind"] or "show", "year": o["year"]}
        fields = {k: v for k, v in {"kind": o["kind"], "year": o["year"], "where": o["where"], "notes": o["notes"],
                                    "recommended_by": o["recommended_by"]}.items() if v}
        item, said = watchlist.add(who, title, pick=pick, via="import", status=o["status"], **fields)
        if o["added"]:
            when = time.mktime(datetime.strptime(o["added"], "%Y-%m-%d").timetuple()) + 12 * 3600
            from rouh.models import WatchItem

            WatchItem.objects.filter(org_id=str(who.org_id), user_id=str(who.user_id),
                                     number=item["number"]).update(added_at=when)
        self.stdout.write(watchlist.line(item) + (f"\n{said}" if said else ""))
