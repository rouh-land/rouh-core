"""Apps (`rouh/apps_hosting.py`): where an app not on an apps server keeps its data, in the person's words.

One column with an empty default on a table of its own, so it touches no other table's rows; going back drops it.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("rouh", "0284_apps_hosting")]

    operations = [
        migrations.AddField(model_name="hostedapp", name="data_at", field=models.TextField(default="")),
    ]
