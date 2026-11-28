"""Apps: the person's own apps, the servers they run on, and the commands Rouh sends those servers.

Petar, 28 November 2026: "basically a person should know that they can and should have a server hosting
their apps ... then we should have app management ... maybe the place/feature should be called apps?!"
`rouh/apps_hosting.py` has the whole of it, and `deploy/apps-server/CONTRACT.md` the wire between a server
and Rouh.

Every row carries `user_id` and `org_id` and is always asked for with both (`AGENTS.md`, "Whose data is
it"). Nothing secret is kept in the clear: a join code and a host's API token are sealed
(`rouh/encryption.py`), and a server's agent key is kept only as its SHA-256.
"""
from django.db import models


class AppServer(models.Model):
    """One apps server of the person's: set up by Rouh (`standard`), or one that already ran apps.

    `state`: waiting (a join line was made, the server has not called in), ready (it called in), or
    elsewhere (registered by hand, no agent: its apps are checked only by their address).
    """

    id = models.BigAutoField(primary_key=True)
    user_id = models.TextField()
    org_id = models.TextField()
    name = models.TextField()
    #: hostinger, hetzner, digitalocean or other.
    host = models.TextField(default="other")
    address = models.TextField(default="")
    state = models.TextField(default="waiting")
    standard = models.BooleanField(default=True)
    #: The join code, sealed, while the server has not called in; "" once it has.
    join_sealed = models.TextField(default="")
    join_until = models.FloatField(default=0)
    #: SHA-256 of the agent's key, hex; "" until it joined.
    key_hash = models.TextField(default="", db_index=True)
    made_at = models.FloatField(default=0)
    joined_at = models.FloatField(default=0)
    seen_at = models.FloatField(default=0)
    full_at = models.FloatField(default=0)
    #: What the server said of itself: os, cpus, memory, disk, load, the ip.
    facts = models.JSONField(default=dict)
    #: The host's own id for it, where Rouh set it up through the host's API (Hostinger's VM id).
    host_ref = models.TextField(default="")
    note = models.TextField(default="")

    class Meta:
        db_table = "app_servers"
        constraints = [models.UniqueConstraint(fields=("org_id", "user_id", "name"), name="app_servers_one_name")]


class HostedApp(models.Model):
    """One app of the person's, on one of their apps servers or elsewhere (`server` empty)."""

    id = models.BigAutoField(primary_key=True)
    user_id = models.TextField()
    org_id = models.TextField()
    #: Its name on the server, ^[a-z][a-z0-9-]{1,30}$; what rouh-app knows it by.
    slug = models.TextField()
    name = models.TextField()
    what = models.TextField(default="")
    url = models.TextField(default="")
    #: The address its check reads; "" is its url.
    health_url = models.TextField(default="")
    server = models.ForeignKey(AppServer, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    #: Where it runs when not on one of the servers above, in the person's words ("the old server").
    elsewhere = models.TextField(default="")
    kind = models.TextField(default="")
    repo = models.TextField(default="")
    #: answering, down or unknown (never checked, or no address).
    state = models.TextField(default="unknown")
    checked_at = models.FloatField(default=0)
    check_said = models.TextField(default="")
    down_since = models.FloatField(default=0)
    #: What the server last said of it (`CONTRACT.md`, a full report's app).
    report = models.JSONField(default=dict)
    made_at = models.FloatField(default=0)
    #: page, rouh, job or server (seen on a server's report before anybody listed it).
    made_by = models.TextField(default="page")

    class Meta:
        db_table = "hosted_apps"
        constraints = [models.UniqueConstraint(fields=("org_id", "user_id", "slug"), name="hosted_apps_one_slug")]


class AppCommand(models.Model):
    """A command waiting for, run by, or answered by an apps server's agent (`CONTRACT.md`, section 3)."""

    id = models.BigAutoField(primary_key=True)
    user_id = models.TextField()
    org_id = models.TextField()
    server = models.ForeignKey(AppServer, on_delete=models.CASCADE, related_name="+")
    app = models.TextField(default="")
    verb = models.TextField()
    args = models.JSONField(default=dict)
    #: waiting, sent, running, done or failed.
    state = models.TextField(default="waiting")
    asked_at = models.FloatField(default=0)
    sent_at = models.FloatField(default=0)
    done_at = models.FloatField(default=0)
    output = models.TextField(default="")
    asked_by = models.TextField(default="page")

    class Meta:
        db_table = "app_commands"
        indexes = [models.Index(fields=("server", "state"), name="app_commands_server_state")]


class HostToken(models.Model):
    """A host's API token the person gave Rouh (Hostinger's), sealed; only its last four are shown."""

    id = models.BigAutoField(primary_key=True)
    user_id = models.TextField()
    org_id = models.TextField()
    host = models.TextField()
    sealed = models.TextField()
    last4 = models.TextField(default="")
    saved_at = models.FloatField(default=0)

    class Meta:
        db_table = "app_host_tokens"
        constraints = [models.UniqueConstraint(fields=("org_id", "user_id", "host"), name="app_host_tokens_one")]
