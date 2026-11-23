"""Not a problem goes; Won't fix with its reason is the one way to set a problem aside (Petar, 23 November 2026:
"I never use that. I always use won't fix and give an explanation").

Every problem marked not_a_problem becomes wont_fix, with the reason "Not a problem" (or "Not a problem: <what
was written>"), so it stays set aside and every count stays the same. The old verdict is kept in a new column,
`verdict_was`, so going back puts each row exactly as it was."""

from django.db import migrations, models


def forward(apps, schema_editor):
    TrialProblem = apps.get_model("rouh", "TrialProblem")
    for p in TrialProblem.objects.filter(verdict="not_a_problem"):
        note = (p.reason or "").strip()
        p.verdict_was = p.verdict
        p.verdict = "wont_fix"
        p.reason = ("Not a problem: " + note) if note else "Not a problem"
        p.save(update_fields=["verdict", "reason", "verdict_was"])


def backward(apps, schema_editor):
    TrialProblem = apps.get_model("rouh", "TrialProblem")
    for p in TrialProblem.objects.filter(verdict_was="not_a_problem", verdict="wont_fix"):
        r = p.reason or ""
        p.reason = r[len("Not a problem: "):] if r.startswith("Not a problem: ") else ("" if r == "Not a problem" else r)
        p.verdict, p.verdict_was = "not_a_problem", ""
        p.save(update_fields=["verdict", "reason", "verdict_was"])


class Migration(migrations.Migration):

    atomic = True

    dependencies = [
        ('rouh', '0275_changes_and_feedback_outbox'),
    ]

    operations = [
        migrations.AddField(
            model_name='trialproblem',
            name='verdict_was',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.RunPython(forward, backward),
    ]
