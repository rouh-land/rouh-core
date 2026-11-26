"""A notice's details beside its summary (`Notice.details`).

Petar, 26 November 2026: a finished job used to reach him three times - a short message in the
chat, a card on the canvas and the notification. Now it is one result: a short overview first and
the details under it, and that is the notification too. `body` stays the overview, which the stack
and an unopened row show; `details` is everything under it, shown when the notice is opened on the
Notifications page and under the overview in the chat (`notices.post`, `assistant_job._phone`).

One column with an empty default, so it touches no row, and code still running from before it never
reads it. Every notice written before it has none, and opens to its `body` as before. Going back
drops the column, and with it only the details of the notices written since.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("rouh", "0281_chat_app_links")]

    operations = [
        migrations.AddField(
            model_name="notice",
            name="details",
            field=models.TextField(blank=True, default=""),
        ),
    ]
