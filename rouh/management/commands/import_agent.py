"""``python manage.py import_agent``: an OpenClaw or Hermes Agent setup brought into Rouh (`rouh/agent_import.py`).

    python manage.py import_agent                       # a preview of whatever is installed here: nothing changes
    python manage.py import_agent openclaw --apply      # import OpenClaw's persona, memory and skills
    python manage.py import_agent hermes --path /tmp/hermes-backup.zip --apply
    python manage.py import_agent --apply --include-secrets      # Google's and xAI's keys too
    python manage.py import_agent --apply --skill-conflict rename   # a taken skill name added as <name>-imported
    python manage.py import_agent --list                # the imports so far
    python manage.py import_agent --undo 20261125-1432-ab12      # take one import away again

It goes into the first account's memory unless --user says whose. In the containers it is run in the core:
docker compose exec core python manage.py import_agent ...
"""
from __future__ import annotations

import json

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "Import an OpenClaw or Hermes Agent setup: memory, persona and skills. A preview unless --apply."

    def add_arguments(self, parser):
        parser.add_argument("source", nargs="?", default="auto", choices=["auto", "openclaw", "hermes"])
        parser.add_argument("--path", default="", help="A folder, .zip or .tar.gz to read instead of the usual install")
        parser.add_argument("--apply", action="store_true", help="Import; without it only a preview is shown")
        parser.add_argument("--dry-run", action="store_true", help="Only a preview (the default)")
        parser.add_argument("--include-secrets", action="store_true", help="Take Google's and xAI's API keys too")
        parser.add_argument("--skill-conflict", default="skip", choices=["skip", "rename"])
        parser.add_argument("--undo", default="", help="An import's id: take away exactly what it added")
        parser.add_argument("--list", action="store_true", help="The imports so far")
        parser.add_argument("--json", action="store_true", help="Say it as JSON")
        parser.add_argument("--user", default="")
        parser.add_argument("--org", default="")

    def handle(self, *args, **o):
        from rouh import agent_import, rules
        from rouh.models.accounts import User

        user = (User.objects.filter(id=o["user"]).first() if o["user"]
                else User.objects.order_by("id").first())
        if user is None:
            raise CommandError(f"There is no account {o['user']}." if o["user"] else "There is no account yet.")
        org = o["org"] or str(user.org_id or "org-default")
        ds = rules.master(str(user.id), org)
        if ds is None:
            raise CommandError("That account has no memory to import into yet.")
        by = "python manage.py import_agent"
        try:
            if o["list"]:
                got = agent_import.records(ds)
                self.stdout.write(json.dumps(got, indent=1, ensure_ascii=False) if o["json"]
                                  else agent_import.listing_text(ds))
                return
            if o["undo"]:
                rec = agent_import.undo(ds, o["undo"], by=by)
                self.stdout.write(json.dumps(rec, indent=1, ensure_ascii=False) if o["json"]
                                  else agent_import.undo_text(rec))
                return
            got = agent_import.run(ds, source=o["source"], path=o["path"], do=o["apply"] and not o["dry_run"],
                                   include_secrets=o["include_secrets"], conflict=o["skill_conflict"], by=by)
        except agent_import.Refused as exc:
            raise CommandError(str(exc)) from None
        self.stdout.write(json.dumps(got, indent=1, ensure_ascii=False) if o["json"] else got["text"])
        if not got["import"] and not o["json"]:
            self.stdout.write("\nThis was a preview. Run it again with --apply to import.")
