"""Jobs, journeys and attempts (Petar, 22 November 2026): "JOB -> JOURNEYS (tries) -> ATTEMPTS (runs)".

Until now every journey (a goal a tester is asked to reach, `trial_jobs`) was shown as a job of its own, so ten
journeys asked for in one request were ten jobs. A job is now one request the person gave, with their own words
(`trial_requests`), and each journey points at its job (`trial_jobs.request_id`). Nothing is taken out or changed
in place: the table is new, the column is new, and the journeys and their attempts stay as they were.

The existing journeys are put into jobs here, per person:

- Journeys a person asked for by hand (their first attempt a review) started within two minutes of each other are
  one request, as the ten guide journeys of 21 November 2026 were, started in the same second.
- Journeys a build's run tested (their first attempt automatic) belong to that run: one job per run.
- Anything else is a job of its own.

Its prompt is recovered only where the chat that asked still says so: the conversation whose tool result named the
very attempt that began the batch, at the second it began, and the person's own last words before it there.
Otherwise it stays empty and the job is titled from its journeys."""
import json

from django.db import migrations, models

NOTE = "[A note from Rouh's own software, not the person:"
BATCH_GAP = 120


def _title(names: list) -> str:
    names = [n for n in names if n]
    if not names:
        return "A test"
    if len(names) == 1:
        return names[0]
    heads = {n.split(":", 1)[0].strip() for n in names if ":" in n}
    if len(heads) == 1 and all(":" in n for n in names):
        return f"{heads.pop()}: {len(names)} journeys"
    return f"{names[0]}, and {len(names) - 1} more"


def _own_words(content: str) -> str:
    """The person's own words in a stored user row, or "" when it is a tool's result or Rouh's own note."""
    try:
        blocks = json.loads(content)
    except (TypeError, ValueError):
        blocks = content
    if isinstance(blocks, list):
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in blocks):
            return ""
        text = " ".join(str(b.get("text") or "") for b in blocks if isinstance(b, dict) and b.get("type") == "text")
    else:
        text = str(blocks or "")
    text = text.strip()
    return "" if not text or text.startswith(NOTE) else text


def _prompt_for(Transcript, number: int, at: float) -> str:
    said = (Transcript.objects.filter(role="user", ts__gte=at - 5, ts__lte=at + 60,
                                      content__contains=f"Review {number} is starting")
            .order_by("ts").first())
    if said is None:
        return ""
    rows = (Transcript.objects.filter(session_id=said.session_id, role="user", live=True, note=False,
                                      ts__lte=said.ts, ts__gte=said.ts - 1800)
            .order_by("-ts", "-id").values_list("content", flat=True)[:200])
    for content in rows:
        words = _own_words(content)
        if words:
            return words[:8000]
    return ""


def place_journeys(apps, schema_editor):
    Request = apps.get_model("rouh", "TrialRequest")
    Journey = apps.get_model("rouh", "TrialJob")
    Trial = apps.get_model("rouh", "Trial")
    Transcript = apps.get_model("rouh", "TranscriptMessage")
    people = Journey.objects.filter(request_id__isnull=True).values_list("org_id", "user_id").distinct()
    for org_id, user_id in list(people):
        journeys = list(Journey.objects.filter(org_id=org_id, user_id=user_id, request_id__isnull=True))
        firsts = {}
        for t in Trial.objects.filter(org_id=org_id, user_id=user_id, job_id__in=[j.id for j in journeys]).order_by(
                "created_at", "number"):
            firsts.setdefault(t.job_id, t)
        groups, reviews = {}, []
        for j in journeys:
            t = firsts.get(j.id)
            if t is not None and (t.mode or "auto") == "review":
                reviews.append((t.created_at, j, t))
            elif t is not None and str(t.by or "").startswith("run ") and t.by != "run ":
                groups.setdefault(("run", t.by), []).append((t.created_at, j, t))
            else:
                groups[("one", j.id)] = [((t.created_at if t else j.created_at), j, t)]
        reviews.sort(key=lambda x: x[0])
        batch, last = 0, None
        for item in reviews:
            if last is None or item[0] - last > BATCH_GAP:
                batch += 1
            last = item[0]
            groups.setdefault(("review", batch), []).append(item)
        top = Request.objects.filter(org_id=org_id, user_id=user_id).aggregate(m=models.Max("number"))["m"] or 0
        for key, items in sorted(groups.items(), key=lambda kv: min(x[0] for x in kv[1])):
            items.sort(key=lambda x: (x[0], x[1].number))
            first_at, _, first_t = items[0]
            prompt = _prompt_for(Transcript, first_t.number, first_t.created_at) if key[0] == "review" and first_t else ""
            top += 1
            r = Request.objects.create(org_id=org_id, user_id=user_id, number=top,
                                       title=_title([x[1].name for x in items])[:160], prompt=prompt,
                                       source="migrated", key=f"{key[0]}:{key[1]}",
                                       created_at=first_at, updated_at=first_at)
            Journey.objects.filter(org_id=org_id, user_id=user_id, id__in=[x[1].id for x in items]).update(request_id=r.id)


def take_back(apps, schema_editor):
    apps.get_model("rouh", "TrialJob").objects.update(request_id=None)
    apps.get_model("rouh", "TrialRequest").objects.filter(source="migrated").delete()


class Migration(migrations.Migration):
    dependencies = [("rouh", "0272_trial_problem_fixed_by_wave")]

    operations = [
        migrations.CreateModel(
            name="TrialRequest",
            fields=[
                ("id", models.BigAutoField(primary_key=True, serialize=False)),
                ("org_id", models.TextField()),
                ("user_id", models.TextField()),
                ("number", models.IntegerField()),
                ("title", models.TextField()),
                ("prompt", models.TextField(blank=True, default="")),
                ("source", models.TextField(blank=True, default="")),
                ("key", models.TextField(blank=True, default="")),
                ("created_at", models.FloatField()),
                ("updated_at", models.FloatField()),
            ],
            options={
                "db_table": "trial_requests",
                "constraints": [models.UniqueConstraint(fields=["org_id", "user_id", "number"],
                                                        name="trial_request_number_once")],
                "indexes": [models.Index(fields=["org_id", "user_id", "key"], name="trial_request_key")],
            },
        ),
        migrations.AddField(model_name="trialjob", name="request_id",
                            field=models.BigIntegerField(null=True, blank=True)),
        migrations.RunPython(place_journeys, take_back),
    ]
