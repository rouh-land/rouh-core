"""Why a problem won't be fixed (Petar, 22 November 2026): Won't fix asks for the reason, which is kept with the
choice, shown on the problem, and read later to see why problems were declined. Added, never filled from old rows."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("rouh", "0269_trial_step_names_waves")]

    operations = [
        migrations.AddField(model_name="trialproblem", name="reason",
                            field=models.TextField(blank=True, default="")),
    ]
