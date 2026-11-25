"""Trusted contacts' accounts on Discord, Signal and WhatsApp, linked by the owner (task 98, gap G24,
`rouh/chat_apps.py`).

A new table of its own, empty, so adding it touches no row of any other table, and code still running from
before it never reads or writes it. Going back drops it; it holds only which account is whose.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("rouh", "0280_rule_tier_turn")]

    operations = [
        migrations.CreateModel(
            name="ChatAppLink",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("user_id", models.TextField()),
                ("org_id", models.TextField()),
                ("app", models.TextField()),
                ("ident", models.TextField()),
                ("made_at", models.FloatField(default=0)),
                ("contact", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="+",
                                              to="rouh.trustedcontact")),
            ],
            options={"db_table": "chat_app_links"},
        ),
        migrations.AddConstraint(
            model_name="chatapplink",
            constraint=models.UniqueConstraint(fields=("org_id", "user_id", "app", "contact"),
                                               name="chat_app_links_one_per_contact"),
        ),
        migrations.AddConstraint(
            model_name="chatapplink",
            constraint=models.UniqueConstraint(fields=("org_id", "user_id", "app", "ident"),
                                               name="chat_app_links_one_per_account"),
        ),
    ]
