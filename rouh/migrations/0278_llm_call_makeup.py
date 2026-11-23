"""What one call to a model was made of, kept once it is worked out (task 182, step 182-18).

Petar, 24 November 2026: "where the 380,000 tokens come from". A new table of its own, empty, so adding it
touches no row of any other table, and code still running from before it never reads or writes it. Going back
drops it; what it held is worked out again from the log's pieces when a call is opened.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("rouh", "0277_llm_request_source")]

    operations = [
        migrations.CreateModel(
            name="LLMCallMakeup",
            fields=[
                ("request_id", models.BigIntegerField(primary_key=True, serialize=False)),
                ("version", models.IntegerField(default=1)),
                ("made_at", models.FloatField()),
                ("body", models.JSONField(default=dict)),
            ],
            options={"db_table": "llm_call_makeup"},
        ),
    ]
