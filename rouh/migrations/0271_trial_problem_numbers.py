"""Problems numbered within their own try (Petar, 22 November 2026): 1, 2, 3 ... in the order of the steps they
were met at, then the order they were found, kept once given. Every existing try is numbered here; a try's new
problems are numbered after its last when it is read (`trials.local_numbers`). Nothing existing is changed."""
from django.db import migrations, models


def number_every_try(apps, schema_editor):
    Sighting = apps.get_model("rouh", "TrialSighting")
    Number = apps.get_model("rouh", "TrialProblemNumber")
    firsts: dict = {}
    for s in Sighting.objects.exclude(trial_id=None).order_by("at", "id").iterator():
        key = (s.org_id, s.user_id, s.trial_id)
        rank = (s.step if s.step else 10 ** 6, s.at, s.id)
        got = firsts.setdefault(key, {})
        if s.problem_id not in got or rank < got[s.problem_id]:
            got[s.problem_id] = rank
    rows = []
    for (org_id, user_id, trial_id), got in firsts.items():
        for n, pid in enumerate(sorted(got, key=got.get), 1):
            rows.append(Number(org_id=org_id, user_id=user_id, trial_id=trial_id, problem_id=pid, n=n))
    Number.objects.bulk_create(rows, batch_size=1000)


class Migration(migrations.Migration):
    dependencies = [("rouh", "0270_trial_problem_reason")]

    operations = [
        migrations.CreateModel(
            name="TrialProblemNumber",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("org_id", models.TextField()),
                ("user_id", models.TextField()),
                ("trial_id", models.BigIntegerField()),
                ("problem_id", models.BigIntegerField()),
                ("n", models.IntegerField()),
            ],
            options={"db_table": "trial_problem_numbers"},
        ),
        migrations.AddConstraint(model_name="trialproblemnumber",
                                 constraint=models.UniqueConstraint(fields=["trial_id", "problem_id"], name="trial_problem_number_one")),
        migrations.AddConstraint(model_name="trialproblemnumber",
                                 constraint=models.UniqueConstraint(fields=["trial_id", "n"], name="trial_problem_number_n_once")),
        migrations.AddIndex(model_name="trialproblemnumber",
                            index=models.Index(fields=["org_id", "user_id", "problem_id"], name="trial_problem_number_whose")),
        # Taking it back drops the numbers only: they are worked out again from the sightings.
        migrations.RunPython(number_every_try, migrations.RunPython.noop),
    ]
