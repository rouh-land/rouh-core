"""Rewatches, tags and ratings out of 10 on the watch list (`rouh/watchlist.py`, step 202-04).

The owner, 28 November 2026: "I rewatch stuff ... tags also? also ratings should be out of 10, not 5."
Expand only: two new columns on watch_items with defaults that leave every title as it was. A title
already watched gets its one watch from `watched_at`, so its history starts true. Every rating of 1
to 5, on a title and on each person's own mark of a shared list, is doubled onto the 10-point scale,
which loses nothing: going back halves them again (every one is even), and drops the two columns.
"""
from django.db import migrations, models


def forward(apps, schema_editor):
    WatchItem = apps.get_model("rouh", "WatchItem")
    WatchMark = apps.get_model("rouh", "WatchMark")
    for item in WatchItem.objects.all():
        changed = []
        if item.my_rating is not None:
            item.my_rating = max(1, min(10, int(item.my_rating) * 2))
            changed.append("my_rating")
        if item.status == "watched" and item.watched_at and not item.watches:
            item.watches = [float(item.watched_at)]
            changed.append("watches")
        if changed:
            item.save(update_fields=changed)
    for mark in WatchMark.objects.exclude(my_rating=None):
        mark.my_rating = max(1, min(10, int(mark.my_rating) * 2))
        mark.save(update_fields=["my_rating"])


def backward(apps, schema_editor):
    WatchItem = apps.get_model("rouh", "WatchItem")
    WatchMark = apps.get_model("rouh", "WatchMark")
    for model in (WatchItem, WatchMark):
        for row in model.objects.exclude(my_rating=None):
            row.my_rating = max(1, min(5, (int(row.my_rating) + 1) // 2))
            row.save(update_fields=["my_rating"])


class Migration(migrations.Migration):

    dependencies = [("rouh", "0286_watch_lists")]

    operations = [
        migrations.AddField(model_name="watchitem", name="watches",
                            field=models.JSONField(blank=True, default=list)),
        migrations.AddField(model_name="watchitem", name="tags",
                            field=models.JSONField(blank=True, default=list)),
        migrations.RunPython(forward, backward),
    ]
