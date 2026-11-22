"""A problem counts as fixed as soon as the wave of fixes that worked on it has finished (Petar, 22 November 2026):
"many times I would do one single trial and fixes, not a second test for verification." So a problem keeps the wave
that fixed it (`closed_wave`), and every problem a finished wave already fixed, and that was not chosen again after
the wave began, is closed by that wave now. Only open problems are touched; nothing is taken out, and a later try
that meets one again still opens it again."""
from django.db import migrations, models


def close_by_finished_waves(apps, schema_editor):
    Wave = apps.get_model("rouh", "TrialWave")
    Problem = apps.get_model("rouh", "TrialProblem")
    Trial = apps.get_model("rouh", "Trial")
    for w in Wave.objects.filter(state="done").order_by("started_at"):
        numbers = [n for n in (w.problems or []) if isinstance(n, int)]
        if not numbers:
            continue
        t = Trial.objects.filter(id=w.trial_id, org_id=w.org_id, user_id=w.user_id).first()
        rows = Problem.objects.filter(org_id=w.org_id, user_id=w.user_id, number__in=numbers, status="open",
                                      verdict="decided", verdict_at__lte=w.started_at)
        rows.update(status="closed", closed_at=w.ended_at or w.started_at, closed_by=None, closed_wave=w.id,
                    closed_note=f"Wave {w.number}" + (f" of try {t.number}" if t else "") + " fixed this.")


def open_again(apps, schema_editor):
    Problem = apps.get_model("rouh", "TrialProblem")
    Problem.objects.filter(closed_wave__isnull=False, status="closed").update(
        status="open", closed_at=None, closed_note="")


class Migration(migrations.Migration):
    dependencies = [("rouh", "0271_trial_problem_numbers")]

    operations = [
        migrations.AddField(model_name="trialproblem", name="closed_wave",
                            field=models.BigIntegerField(null=True, blank=True)),
        migrations.RunPython(close_by_finished_waves, open_again),
    ]
