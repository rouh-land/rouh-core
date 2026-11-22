"""Trials' page laid out step by step (Petar, 22 November 2026): each step has a short name for what the
tester was doing, and the fixes the owner ticks run together as a wave, which is written down."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("rouh", "0268_page_shared_lists")]

    operations = [
        migrations.AddField(model_name="trialstep", name="name",
                            field=models.TextField(blank=True, default="")),
        migrations.CreateModel(
            name="TrialWave",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("org_id", models.TextField()),
                ("user_id", models.TextField()),
                ("trial_id", models.BigIntegerField()),
                ("number", models.IntegerField()),
                ("problems", models.JSONField(blank=True, default=list)),
                ("decisions", models.JSONField(blank=True, default=dict)),
                ("state", models.TextField(default="running")),
                ("run_id", models.TextField(blank=True, default="")),
                ("said", models.TextField(blank=True, default="")),
                ("started_at", models.FloatField()),
                ("ended_at", models.FloatField(blank=True, null=True)),
            ],
            options={"db_table": "trial_waves"},
        ),
        migrations.AddConstraint(model_name="trialwave", constraint=models.UniqueConstraint(
            fields=("trial_id", "number"), name="trial_wave_number_once")),
        migrations.AddIndex(model_name="trialwave", index=models.Index(
            fields=["org_id", "user_id", "trial_id"], name="trial_wave_whose")),
    ]
