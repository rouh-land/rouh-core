"""The watch list (`rouh/watchlist.py`, `models.WatchItem`).

The owner, 28 November 2026: a watch list of films and shows as its own screen in the navigation.
One new table, keyed by organisation and account, touching no other. Going back drops it, and with
it only the titles kept since.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("rouh", "0282_notice_details")]

    operations = [
        migrations.CreateModel(
            name="WatchItem",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("org_id", models.TextField()),
                ("user_id", models.TextField()),
                ("number", models.IntegerField(default=0)),
                ("title", models.TextField()),
                ("kind", models.TextField(default="film")),
                ("year", models.IntegerField(blank=True, null=True)),
                ("end_year", models.IntegerField(blank=True, null=True)),
                ("seasons", models.JSONField(blank=True, default=list)),
                ("runtime", models.IntegerField(blank=True, null=True)),
                ("genres", models.JSONField(blank=True, default=list)),
                ("rating", models.FloatField(blank=True, null=True)),
                ("rating_from", models.TextField(blank=True, default="")),
                ("overview", models.TextField(blank=True, default="")),
                ("cast", models.TextField(blank=True, default="")),
                ("where", models.TextField(blank=True, default="")),
                ("where_url", models.TextField(blank=True, default="")),
                ("poster", models.TextField(blank=True, default="")),
                ("poster_from", models.TextField(blank=True, default="")),
                ("imdb_id", models.TextField(blank=True, default="")),
                ("tvmaze_id", models.IntegerField(blank=True, null=True)),
                ("wiki_url", models.TextField(blank=True, default="")),
                ("status", models.TextField(default="to_watch")),
                ("seen", models.JSONField(blank=True, default=dict)),
                ("my_rating", models.IntegerField(blank=True, null=True)),
                ("notes", models.TextField(blank=True, default="")),
                ("recommended_by", models.TextField(blank=True, default="")),
                ("rank", models.FloatField(default=0)),
                ("added_via", models.TextField(blank=True, default="page")),
                ("added_at", models.FloatField()),
                ("updated_at", models.FloatField()),
                ("started_at", models.FloatField(blank=True, null=True)),
                ("watched_at", models.FloatField(blank=True, null=True)),
                ("looked_up_at", models.FloatField(blank=True, null=True)),
            ],
            options={
                "db_table": "watch_items",
                "indexes": [models.Index(fields=["org_id", "user_id", "status"], name="watch_items_whose")],
                "constraints": [models.UniqueConstraint(fields=("org_id", "user_id", "number"),
                                                        name="watch_items_number")],
            },
        ),
    ]
