"""Which built-in rules each message was given, by tier (task 182, step 182-23, `rouh/rule_tiers.py`).

A new table of its own, empty, so adding it touches no row of any other table, and code still running from
before it never reads or writes it. Going back drops it; it holds only names and numbers about turns.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("rouh", "0279_chat_summary")]

    operations = [
        migrations.CreateModel(
            name="TurnTiers",
            fields=[
                ("turn_id", models.CharField(max_length=64, primary_key=True, serialize=False)),
                ("chat_id", models.CharField(blank=True, db_index=True, default="", max_length=64)),
                ("at", models.FloatField(db_index=True)),
                ("version", models.CharField(blank=True, default="", max_length=32)),
                ("topics", models.JSONField(default=list)),
                ("tier3", models.JSONField(default=list)),
                ("tier3_chars", models.IntegerField(default=0)),
                ("tier2", models.JSONField(default=list)),
                ("touched", models.JSONField(default=list)),
                ("flags", models.JSONField(default=list)),
            ],
            options={"db_table": "rule_tier_turn"},
        ),
    ]
