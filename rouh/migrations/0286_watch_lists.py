"""Shared watch lists (`rouh/watchlist.py`, `models.WatchList`, `models.WatchMark`; step 202-03).

The owner, 28 November 2026: "let's make a shared list with another person". Expand only: two new
tables, and two new columns on watch_items with defaults that leave every title as it was, on the
owner's own list. Going back drops them, and with them only what was shared since.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("rouh", "0285_app_data_at")]

    operations = [
        migrations.AddField(model_name="watchitem", name="list_id",
                            field=models.BigIntegerField(blank=True, db_index=True, null=True)),
        migrations.AddField(model_name="watchitem", name="added_by",
                            field=models.TextField(blank=True, default="")),
        migrations.CreateModel(
            name="WatchList",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("org_id", models.TextField()),
                ("user_id", models.TextField()),
                ("name", models.TextField()),
                ("names", models.JSONField(blank=True, default=dict)),
                ("created_at", models.FloatField()),
                ("updated_at", models.FloatField()),
            ],
            options={"db_table": "watch_lists",
                     "indexes": [models.Index(fields=["org_id", "user_id"], name="watch_lists_whose")]},
        ),
        migrations.CreateModel(
            name="WatchMark",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("item", models.ForeignKey(db_column="item_id", on_delete=django.db.models.deletion.CASCADE,
                                           related_name="marks", to="rouh.watchitem")),
                ("person", models.TextField()),
                ("my_rating", models.IntegerField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("seen_before", models.BooleanField(default=False)),
                ("updated_at", models.FloatField()),
            ],
            options={"db_table": "watch_marks",
                     "constraints": [models.UniqueConstraint(fields=("item", "person"), name="watch_marks_one")]},
        ),
    ]
