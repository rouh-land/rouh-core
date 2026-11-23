"""Every change to Rouh's code, and the feedback people send about Rouh (23 November 2026).

Petar, 23 November 2026: "Replace Gene therapy with Feedback, and make Evolution > Mutations
(/evolution/mutations) the one list of every change made to Rouh, including changes made from chat."

* `RouhChange` is one change to this Rouh's code, whatever started it: a chat (improve_myself), a
  Gene therapy request of before that day, the Incubator's Go, a nightly run, a gene grown, a Rouh
  update, a commit by hand. One row per run that landed (`key` "run:<id>"), per commit no run is
  written down for ("commit:<sha>"), or per Gene therapy request or feedback that never landed
  anything ("request:<id>", "feedback:<id>"). `rouh/everychange.py` owns what the rows mean.
* `FeedbackOutbox` is what a person sent with the Feedback panel, kept here until rouh.land has it
  and then followed for its status there (`rouh/feedback.py`). Only the person who sent one ever
  sees it in this Rouh.
"""
from django.db import models
from django.db.models import Q

CHANGE_STATES = ("landed", "building", "failed", "declined", "waiting")
FEEDBACK_STATES = ("queued", "sent")
FEEDBACK_REMOTE = ("", "received", "looking", "done")


class RouhChange(models.Model):
    id = models.BigAutoField(primary_key=True)
    org_id = models.TextField()
    #: Whoever asked for it, "" for a change nobody of this Rouh asked for (a night, an update).
    user_id = models.TextField(blank=True, default="")
    key = models.TextField()
    #: chat, gene_therapy, incubator, mutation, night, refactor, gene, pool, undo, update,
    #: process, hand, unknown (`everychange.SOURCES`).
    source = models.TextField(default="unknown")
    #: What was asked, in the person's own words where there are any.
    asked = models.TextField(blank=True, default="")
    title = models.TextField(blank=True, default="")
    chat_id = models.TextField(blank=True, default="")
    run_id = models.TextField(blank=True, default="")
    #: What it came from: a Gene therapy request or feedback id, an Incubator idea's code.
    ref = models.TextField(blank=True, default="")
    #: [{sha, subject, at}], oldest first.
    commits = models.JSONField(default=list)
    #: The files its commits changed.
    files = models.JSONField(default=list)
    state = models.TextField(default="landed")
    #: Why it is not landed, in words, for a request that never built.
    note = models.TextField(blank=True, default="")
    landed_at = models.FloatField(null=True, blank=True)
    created_at = models.FloatField()
    updated_at = models.FloatField(null=True, blank=True)
    #: The run started to take it out again (Undo), and when.
    undo_run = models.TextField(blank=True, default="")
    undo_at = models.FloatField(null=True, blank=True)

    class Meta:
        db_table = "rouh_changes"
        indexes = [models.Index(fields=["org_id", "-created_at"], name="rouh_change_org"),
                   models.Index(fields=["org_id", "run_id"], name="rouh_change_run")]
        constraints = [
            models.UniqueConstraint(fields=["org_id", "key"], name="rouh_change_one"),
            models.CheckConstraint(condition=Q(state__in=CHANGE_STATES), name="rouh_change_state_known"),
        ]


class FeedbackOutbox(models.Model):
    id = models.TextField(primary_key=True)
    org_id = models.TextField()
    user_id = models.TextField()
    author = models.TextField(blank=True, default="")
    email = models.TextField(blank=True, default="")
    body = models.TextField(blank=True, default="")
    #: The screen they were on.
    page = models.TextField(blank=True, default="")
    #: [{id, session, name, media_type, kind, size, path}] (`rouh/attachments.py`).
    files = models.JSONField(default=list)
    #: The code it was sent from.
    version = models.TextField(blank=True, default="")
    state = models.TextField(default="queued")
    remote_id = models.TextField(blank=True, default="")
    remote_status = models.TextField(blank=True, default="")
    #: When rouh.land last said its status moved.
    status_at = models.FloatField(null=True, blank=True)
    created_at = models.FloatField()
    sent_at = models.FloatField(null=True, blank=True)
    tries = models.IntegerField(default=0)
    next_try_at = models.FloatField(default=0)
    error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "feedback_outbox"
        indexes = [models.Index(fields=["org_id", "user_id", "-created_at"], name="feedback_outbox_whose"),
                   models.Index(fields=["state", "next_try_at"], name="feedback_outbox_due")]
        constraints = [
            models.CheckConstraint(condition=Q(state__in=FEEDBACK_STATES), name="feedback_outbox_state_known"),
            models.CheckConstraint(condition=Q(remote_status__in=FEEDBACK_REMOTE),
                                   name="feedback_outbox_remote_known"),
        ]
