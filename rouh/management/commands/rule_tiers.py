"""Move this Rouh's built-in rules into their tiers, take them back, or say where they stand (`rouh/rule_tiers.py`).

    python manage.py rule_tiers status
    python manage.py rule_tiers apply
    python manage.py rule_tiers revert

Task 182, step 182-23: the tiers are this Rouh's own rules' data, so they are changed here, one step each way,
and never published to rouh.land by this.
"""
import json

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "The tiered built-in rules on this Rouh: status, apply or revert."

    def add_arguments(self, parser):
        parser.add_argument("what", choices=("status", "apply", "revert"), nargs="?", default="status")

    def handle(self, *args, **options):
        from rouh import rule_tiers

        what = options["what"]
        got = (rule_tiers.apply(by="manage.py rule_tiers") if what == "apply"
               else rule_tiers.revert(by="manage.py rule_tiers") if what == "revert" else rule_tiers.status())
        self.stdout.write(json.dumps(got, indent=1, default=str))
