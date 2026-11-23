"""Which source fed each memory call, and the item's own key (task 182, step 182-15).

Petar, 23 November 2026: "can we split it by source so we can make that analysis at a later time?"
Two text columns with a default kept in the database, so adding them rewrites no row (PostgreSQL keeps a
constant default in the catalogue), a process still running the code before them writes its rows as
before, and every call before keeps "" (`rouh/synapse/feeds.py`). Going back drops the two columns, which
held nothing before this.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("rouh", "0276_trial_not_a_problem_to_wont_fix")]

    operations = [
        migrations.AddField(model_name="llmrequest", name="source",
                            field=models.TextField(blank=True, default="", db_default="")),
        migrations.AddField(model_name="llmrequest", name="source_key",
                            field=models.TextField(blank=True, default="", db_default="")),
    ]
