"""``python manage.py device``: the keys a device of the person's own talks to Rouh with (`rouh/devices.py`).

    python manage.py device add --user alex --name beast      # prints the key once, on stdout alone
    python manage.py device list --user alex
    python manage.py device revoke --user alex --name beast

The device shows the key on Rouh's WebSocket as ``Authorization: Bearer <key>`` and reaches its own chat
and nothing else. Only the key's sha256 is kept. Adding a name that has a live key revokes that one first.
"""
from __future__ import annotations

import time

from django.core.management.base import BaseCommand, CommandError

from rouh import devices


class Command(BaseCommand):
    help = "Make, list or revoke the keys a device (the robot) talks to Rouh with."

    def add_arguments(self, parser):
        parser.add_argument("action", choices=("add", "list", "revoke"))
        parser.add_argument("--user", default="", help="whose device it is, by username; the owner if left out")
        parser.add_argument("--name", default="", help="the device's name, such as beast")

    def handle(self, *args, action="list", user="", name="", **options):
        from rouh.models import User

        if user:
            account = User.objects.filter(username=user, is_guest=False).first()
        else:
            account = User.objects.filter(is_guest=False, is_active=True).order_by("id").first()
        if account is None or not account.org_id:
            raise CommandError("Say whose device it is with --user, by their username.")
        uid, org = str(account.id), str(account.org_id)
        if action == "list":
            rows = devices.listed(uid, org)
            for r in rows:
                state = ("revoked " + time.strftime("%Y-%m-%d", time.localtime(r["revoked_at"]))
                         if r["revoked_at"] else "live")
                used = (time.strftime("%Y-%m-%d %H:%M", time.localtime(r["last_used_at"]))
                        if r["last_used_at"] else "never")
                self.stdout.write(f"{r['name']}\t{state}\tchat {r['chat']}\tlast used {used}\tkey {r['key_starts']}...")
            if not rows:
                self.stdout.write("no devices")
            return
        if action == "add":
            try:
                key, rec = devices.add(uid, org, name)
            except ValueError as exc:
                raise CommandError(str(exc)) from exc
            self.stdout.write(key)
            self.stderr.write(f"Shown once. The device {rec['name']} reaches the chat {rec['chat']} only. "
                              "Keep it readable by the device's own user alone.")
            return
        self.stdout.write(f"revoked {devices.revoke(uid, org, name.strip().lower())} key(s)")
