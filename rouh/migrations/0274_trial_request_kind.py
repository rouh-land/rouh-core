"""A job says whether the person started it (manual) or Rouh did (automatic) - Petar, 22 November 2026, on the Testing
dashboard: "Testing the person starts themselves (from the start form / asked in chat) is MANUAL. Testing started by
automatic testing (the ON/OFF switch, builds' own tests after a change) is AUTOMATIC. Store which on each job."

A new column, nothing changed in place. The existing jobs are given theirs from what they already say: one started
from the form or a chat, one migrated from a batch of reviews (key `review:<n>`), or one any of whose attempts is a
review (the person asked for it) is manual; the rest - a build's run, an attempt of the switch's - automatic."""
from django.db import migrations, models


def give_kinds(apps, schema_editor):
    Request = apps.get_model("rouh", "TrialRequest")
    Journey = apps.get_model("rouh", "TrialJob")
    Trial = apps.get_model("rouh", "Trial")
    reviewed = set(Journey.objects.filter(
        id__in=Trial.objects.filter(mode="review").values_list("job_id", flat=True)).values_list("request_id", flat=True))
    for r in Request.objects.all():
        manual = r.source in ("chat", "form") or str(r.key or "").startswith("review:") or r.id in reviewed
        Request.objects.filter(id=r.id).update(kind="manual" if manual else "automatic")


def take_back(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [("rouh", "0273_trial_requests")]

    operations = [
        migrations.AddField(model_name="trialrequest", name="kind",
                            field=models.TextField(blank=True, default="automatic")),
        migrations.RunPython(give_kinds, take_back),
    ]
