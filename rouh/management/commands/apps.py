"""``python manage.py apps``: the owner's apps and apps servers from a shell (`rouh/apps_hosting.py`).

    python manage.py apps                                   # what the Apps page says, as text
    python manage.py apps add-server NAME --address ADDR --note "..."      # a server that already runs apps
    python manage.py apps add NAME --url URL [--server NAME | --elsewhere TEXT] [--what TEXT] [--repo URL]
    python manage.py apps check
    python manage.py apps ssh-key list | add "ssh-ed25519 AAAA... name" | remove "ssh-ed25519 AAAA..."

For the apps that ran "on the side" before Apps existed (Petar, 28 November 2026): each is listed with its
address, on a server registered as elsewhere, and is checked by its address from then on; nothing on its
server is changed. `--user` names the account (its username or email); the owner otherwise.
"""
from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = "The owner's apps and apps servers: list, add, check, and the SSH keys apps servers let in."

    def add_arguments(self, parser):
        parser.add_argument("what", nargs="?", default="list",
                            choices=["list", "add", "add-server", "check", "ssh-key"])
        parser.add_argument("rest", nargs="*")
        parser.add_argument("--user", default="")
        parser.add_argument("--url", default="")
        parser.add_argument("--server", default="")
        parser.add_argument("--elsewhere", default="")
        parser.add_argument("--what", dest="about", default="")
        parser.add_argument("--repo", default="")
        parser.add_argument("--data", default="", help="where its data is kept")
        parser.add_argument("--address", default="")
        parser.add_argument("--note", default="")

    def _who(self, name: str):
        from django.db.models import Q

        from rouh import apps_hosting
        from rouh.models import User
        from rouh.web import firstrun

        user = (User.objects.filter(Q(username=name) | Q(email__iexact=name), is_active=True).first() if name
                else firstrun.the_owner())
        if user is None:
            raise CommandError("No such account." if name else "This Rouh has no owner yet.")
        return apps_hosting.Who(str(user.pk), str(user.org_id or ""))

    def handle(self, *args, **o):
        from rouh import apps_hosting

        who = self._who(o["user"])
        rest = o["rest"]
        try:
            if o["what"] == "list":
                self.stdout.write(apps_hosting.tool(who, "list", {}))
            elif o["what"] == "check":
                self.stdout.write(apps_hosting.tool(who, "check", {}))
            elif o["what"] == "add-server":
                if not rest:
                    raise CommandError("Name the server.")
                s = apps_hosting.register_server(who, name=rest[0], address=o["address"], note=o["note"])
                self.stdout.write(f"{s['name']} is listed (id {s['id']}).")
            elif o["what"] == "add":
                if not rest:
                    raise CommandError("Name the app.")
                args = {"name": " ".join(rest), "url": o["url"], "what": o["about"], "repo": o["repo"],
                        "elsewhere": o["elsewhere"], "data_at": o["data"]}
                if o["server"]:
                    args["server"] = o["server"]
                self.stdout.write(apps_hosting.tool(who, "add", args, by="rouh"))
            elif o["what"] == "ssh-key":
                verb = rest[0] if rest else "list"
                keys = apps_hosting.ssh_keys(who)
                if verb == "add" and len(rest) > 1:
                    keys = apps_hosting.set_ssh_keys(who, keys + [" ".join(rest[1:])])
                elif verb == "remove" and len(rest) > 1:
                    gone = " ".join(rest[1:]).strip()
                    keys = apps_hosting.set_ssh_keys(who, [k for k in keys if not k.startswith(gone)])
                elif verb != "list":
                    raise CommandError("ssh-key list | add KEY | remove KEY")
                self.stdout.write("\n".join(keys) or "No keys: apps servers let nobody in by SSH as rouh.")
        except apps_hosting.Refused as exc:
            raise CommandError(str(exc)) from None
