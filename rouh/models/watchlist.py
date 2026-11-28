"""The watch list: the films and shows the person wants to watch, is watching and has watched
(`rouh/watchlist.py`).

The owner, 28 November 2026: "I want the watch list to be a full feature in the navigation. with all
the bells and whistles you could have." One row a title, keyed by organisation and account, with the
details Rouh looked up for it and the person's own progress, rating and notes.
"""
from django.db import models


class WatchItem(models.Model):
    """One film or show on a person's watch list."""

    id = models.BigAutoField(primary_key=True)
    org_id = models.TextField()
    user_id = models.TextField()
    #: Its number among this person's titles, 1 for their first: its address, /watch/<number>.
    number = models.IntegerField(default=0)
    title = models.TextField()
    #: film, show, documentary or miniseries (`watchlist.KINDS`).
    kind = models.TextField(default="film")
    year = models.IntegerField(null=True, blank=True)
    end_year = models.IntegerField(null=True, blank=True)
    #: A show's seasons, in order: [{"n": 1, "name": "", "episodes": 8, "year": 2022}].
    seasons = models.JSONField(default=list, blank=True)
    #: Minutes: a film's length, or a show's usual episode.
    runtime = models.IntegerField(null=True, blank=True)
    genres = models.JSONField(default=list, blank=True)
    #: A public rating out of 10, and where it is from.
    rating = models.FloatField(null=True, blank=True)
    rating_from = models.TextField(blank=True, default="")
    overview = models.TextField(blank=True, default="")
    cast = models.TextField(blank=True, default="")
    #: Where it streams, as the person or the lookup put it ("Netflix"), and a link to it there.
    where = models.TextField(blank=True, default="")
    where_url = models.TextField(blank=True, default="")
    #: The poster's file in the data directory (`watchlist.poster_path`), and where it came from.
    poster = models.TextField(blank=True, default="")
    poster_from = models.TextField(blank=True, default="")
    imdb_id = models.TextField(blank=True, default="")
    tvmaze_id = models.IntegerField(null=True, blank=True)
    wiki_url = models.TextField(blank=True, default="")
    #: to_watch, watching or watched (`watchlist.STATUSES`).
    status = models.TextField(default="to_watch")
    #: For a show, how many episodes of each season are seen, from the first: {"1": 8, "2": 3}.
    seen = models.JSONField(default=dict, blank=True)
    #: The person's own rating, 1 to 10 (1 to 5 until step 202-04, doubled then), and their notes.
    my_rating = models.IntegerField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    recommended_by = models.TextField(blank=True, default="")
    #: Its place in Up next: lower first.
    rank = models.FloatField(default=0)
    #: page, chat or import: where it was added from.
    added_via = models.TextField(blank=True, default="page")
    added_at = models.FloatField()
    updated_at = models.FloatField()
    started_at = models.FloatField(null=True, blank=True)
    watched_at = models.FloatField(null=True, blank=True)
    looked_up_at = models.FloatField(null=True, blank=True)
    #: The shared list it is on (`WatchList.id`), or None for the owner's own, My list (step 202-03).
    list_id = models.BigIntegerField(null=True, blank=True, db_index=True)
    #: Who added it: "" for the owner, else the email of the person the list is shared with.
    added_by = models.TextField(blank=True, default="")
    #: Every time it was watched, oldest first, as times (step 202-04: "I rewatch stuff"). Watch again
    #: puts a watched title back in Up next and keeps these.
    watches = models.JSONField(default=list, blank=True)
    #: The person's own free tags ("cosy", "with the kids"), which cut across lists (step 202-04).
    tags = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "watch_items"
        indexes = [models.Index(fields=["org_id", "user_id", "status"], name="watch_items_whose")]
        constraints = [models.UniqueConstraint(fields=["org_id", "user_id", "number"],
                                               name="watch_items_number")]


class WatchList(models.Model):
    """A list the owner keeps with other people (step 202-03, 28 November 2026: "let's make a shared
    list with another person"). Who may open it is the one permission record every share is
    (`PageGuest`, path `_watch/<id>`); this row is its name, and what the owner calls each person."""

    id = models.BigAutoField(primary_key=True)
    org_id = models.TextField()
    user_id = models.TextField()
    name = models.TextField()
    #: {email: the name the owner gave them}, so a person is called what the owner calls them.
    names = models.JSONField(default=dict, blank=True)
    created_at = models.FloatField()
    updated_at = models.FloatField()

    class Meta:
        db_table = "watch_lists"
        indexes = [models.Index(fields=["org_id", "user_id"], name="watch_lists_whose")]


class WatchMark(models.Model):
    """One person's own on one title of a shared list: their rating, their note, and whether they
    had seen it before. The list's owner's rating and notes stay on the title itself, as on My list;
    their row holds only whether they had seen it before."""

    id = models.BigAutoField(primary_key=True)
    item = models.ForeignKey(WatchItem, on_delete=models.CASCADE, related_name="marks", db_column="item_id")
    #: "owner", or the email of the person the list is shared with.
    person = models.TextField()
    #: 1 to 10, as on the title (step 202-04).
    my_rating = models.IntegerField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    seen_before = models.BooleanField(default=False)
    updated_at = models.FloatField()

    class Meta:
        db_table = "watch_marks"
        constraints = [models.UniqueConstraint(fields=["item", "person"], name="watch_marks_one")]
