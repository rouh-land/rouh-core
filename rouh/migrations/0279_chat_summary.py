"""A chat's running summary and where its window starts (task 182, step 182-21).

Petar, 25 November 2026: "let's do 1,2,3 ... I should be able to select in the context options to send the
full text or the summary, summary being default for people." A new table of its own, empty, so adding it
touches no row of any other table, and code still running from before it never reads or writes it. Going back
drops it; a chat with no row is sent whole, as every chat but General was before.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("rouh", "0278_llm_call_makeup")]

    operations = [
        migrations.CreateModel(
            name="ChatSummary",
            fields=[
                ("chat_id", models.TextField(primary_key=True, serialize=False)),
                ("since", models.BigIntegerField(default=0)),
                ("text", models.TextField(blank=True, default="")),
                ("exchanges", models.IntegerField(default=0)),
                ("covered_tokens", models.IntegerField(default=0)),
                ("at", models.FloatField(default=0)),
                ("checked_at", models.FloatField(default=0)),
            ],
            options={"db_table": "chat_summary"},
        ),
    ]
