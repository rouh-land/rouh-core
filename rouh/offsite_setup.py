"""Anatomy, Meta, Copy off this machine: the weekly copy set up in Rouh, step by step, and asked about once.

Task 98, gap G18 (25 November 2026). Petar: "we should offer only s3, r2 backups" ... "We should have a
sign in settings -> meta, no other nagging. one time ask at some point with a modal popup."

What `rouh/offsite.py` sends needs a bucket, a token, a key and a way to lock the copy. Until now that
was a settings file or six boxes on Anatomy, Connections, Keys. Here it is:

- **Two kinds of bucket, nothing else**: Cloudflare R2 and Amazon S3 (not S3 Files, Amazon's mount
  feature: a plain upload of one locked file). Each has its own steps, written for the person who has
  never made a bucket, and only the boxes that kind needs: R2 its account id (or its S3 API address,
  pasted whole), S3 its region. The address Rouh sends to is made from those.
- **Checked before it is kept**: Rouh lists the bucket and writes and deletes one small file under
  this Rouh's own prefix, so a token without write rights is refused at once, with what to change.
- **A password Rouh makes**, 30 letters and digits that cannot be mistaken for each other, shown once
  as it is made, to be kept in a password manager: it is the only thing that opens a copy on another
  machine. It is kept here sealed, like every key (`rouh/service_keys.py`), so the weekly copy can be
  locked with it, and it is never shown again: a new one can be made, and the older copies still need
  the older password. A Rouh already locking its copies with its own age key keeps that key.
- **Asked once** (`ask`): to the owner, in a popup, at least `ASK_AFTER_DAYS` after this Rouh was set
  up (never during setup), while no copy is set up: why a copy off the machine matters, with R2, S3 or
  Not now. Showing it counts as asking. After that the only reminder is a small sign on Anatomy's
  board under Meta, "No copy off this machine" (`anatomy.CHECKS`). Nothing in the chat, the morning
  brief or the notifications ever says it.

The values are the ones `rouh/service_keys.py` already keeps for the service `offsite`, so a copy
set up before, in a settings file or on the Keys page (Petar's own, to R2), keeps working unchanged.
"""
from __future__ import annotations

import logging
import os
import re
import secrets
import threading
import time

log = logging.getLogger("rouh.offsite_setup")

ROUTE = "/anatomy/meta/backups"
SECTION = "backups"
#: The popup waits until this Rouh has been in use this long: never during setup.
ASK_AFTER_DAYS = float(os.environ.get("ROUH_OFFSITE_ASK_AFTER_DAYS") or 3)
ASKED = "offsite_asked"
#: Copies set up but none arrived for this long: the board's sign says so again.
STALE_DAYS = 14
#: A password made and not yet confirmed saved: shown again on the page until it is.
UNSAVED = "offsite_password_unsaved"
#: Where each kind of bucket is, {account} or {region} filled in. Settings only so a test world can
#: put a stand-in there, as ROUH_CARDDAV_URL does for iCloud.
R2_ENDPOINT = os.environ.get("ROUH_OFFSITE_R2_ENDPOINT") or "https://{account}.r2.cloudflarestorage.com"
S3_ENDPOINT = os.environ.get("ROUH_OFFSITE_S3_ENDPOINT") or "https://s3.{region}.amazonaws.com"
#: Letters and digits that cannot be read as each other (no 0 and O, 1 and I and L).
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
GROUPS, GROUP = 6, 5

KINDS = {
    "r2": {
        "name": "Cloudflare R2",
        "short": "R2",
        "why": "Free for the first 10 GB a month, and no charge for downloading a copy back.",
        "steps": [
            "Sign in at dash.cloudflare.com. In the menu on the left, open R2 Object Storage. "
            "The first time, Cloudflare asks you to turn R2 on; it asks for a card, and a Rouh's copies "
            "usually fit in the free 10 GB.",
            "Press Create bucket. Name it, for example rouh-backups, leave the rest as it is, and press "
            "Create bucket again.",
            "Back on R2's page, find Account details and copy the Account ID. Paste it below.",
            "Press Manage next to API Tokens, then Create Account API token. Give it the permission "
            "Object Read & Write, and under Specify bucket(s) choose only the bucket you made. Press "
            "Create API Token.",
            "Cloudflare shows the Access Key ID and the Secret Access Key once. Paste both below "
            "before you leave that page.",
        ],
        "where": {"label": "Account ID", "placeholder": "32 letters and digits",
                  "hint": "On R2's page, under Account details. The S3 API address, pasted whole, works too."},
    },
    "s3": {
        "name": "Amazon S3",
        "short": "S3",
        "why": "Amazon's storage, in the region you choose; you pay for what is kept and for downloads.",
        "steps": [
            "Sign in at console.aws.amazon.com and open S3. Choose the region at the top right, the "
            "one nearest you, for example Europe (Frankfurt), which is eu-central-1.",
            "Press Create bucket. Give it a name no one else has used, for example rouh-backups-"
            "and-your-name. Leave Block all public access on, and press Create bucket.",
            "Open IAM, then Users, and press Create user. Name it rouh-backups; it needs no access to "
            "the console.",
            "On Set permissions choose Attach policies directly, then Create policy. In its JSON tab paste "
            "the policy below, with your bucket's name in place of your-bucket, save it as rouh-backups, "
            "and attach it to the user.",
            "Open the user, then Security credentials, and press Create access key. Choose Other, and "
            "copy the Access key and the Secret access key below; Amazon shows the secret only once.",
        ],
        "where": {"label": "Region", "placeholder": "eu-central-1",
                  "hint": "The code of the bucket's region, as S3 shows it beside the bucket."},
        # What the user may do: the bucket listed, and its own objects read, written and deleted.
        "policy": ('{\n  "Version": "2012-10-17",\n  "Statement": [\n'
                   '    {\n      "Effect": "Allow",\n      "Action": "s3:ListBucket",\n'
                   '      "Resource": "arn:aws:s3:::your-bucket"\n    },\n'
                   '    {\n      "Effect": "Allow",\n'
                   '      "Action": ["s3:GetObject", "s3:PutObject",\n                 "s3:DeleteObject"],\n'
                   '      "Resource": "arn:aws:s3:::your-bucket/*"\n    }\n  ]\n}'),
    },
}

_SENDING = threading.Lock()
_SENT: dict = {}


class Refused(ValueError):
    """Not done, with why in words a person can read: never a value that was typed."""


# --- the password ---------------------------------------------------------------------------

def make_password() -> str:
    """30 letters and digits in six groups, about 148 bits: typed in by hand on another machine if it
    has to be, and never confused for one another."""
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(GROUP)) for _ in range(GROUPS))


# --- where it goes --------------------------------------------------------------------------

def endpoint(kind: str, where: str) -> tuple[str, str]:
    """(the address copies are sent to, the region), from what was typed for that kind; Refused,
    saying what is wrong, otherwise."""
    where = (where or "").strip()
    if kind == "r2":
        found = re.search(r"(?i)\b([0-9a-f]{32})(?:\.r2\.cloudflarestorage\.com)?\b", where)
        if not found:
            raise Refused("An R2 Account ID is 32 letters and digits (0 to 9 and a to f). It is on R2's page in "
                          "Cloudflare, under Account details.")
        return R2_ENDPOINT.replace("{account}", found.group(1).lower()), "auto"
    if kind == "s3":
        region = where.lower()
        found = re.search(r"s3[.-]([a-z0-9-]+)\.amazonaws\.com", region)
        if found:
            region = found.group(1)
        if not re.fullmatch(r"[a-z]{2}(-gov)?-[a-z]+-\d", region):
            raise Refused("A region is written like eu-central-1 or us-east-1: S3 shows it beside the bucket.")
        return S3_ENDPOINT.replace("{region}", region), region
    raise Refused("Choose Cloudflare R2 or Amazon S3.")


def _bucket_name(text: str) -> str:
    name = (text or "").strip().strip("/")
    # The S3 API address R2 shows for a bucket, pasted whole: its last part is the bucket.
    if "/" in name:
        name = name.rsplit("/", 1)[-1]
    if not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", name):
        raise Refused("A bucket's name is 3 to 63 small letters, digits, dots and dashes, as it was made.")
    return name


# --- what the page shows --------------------------------------------------------------------

def _admin(who) -> None:
    from .tenancy import DEFAULT_ORG_ID

    if not getattr(who, "is_admin", False) or str(getattr(who, "org_id", "")) != DEFAULT_ORG_ID:
        raise Refused("Only this Rouh's administrator sets up its copy off the machine.")


def _saved_at(name: str) -> float:
    from . import service_keys

    row = service_keys._rows().get(name)
    return float(row[2] or 0) if row else 0.0


def _when(ts: float) -> str:
    if not ts:
        return ""
    from . import clock

    return clock.moment(ts).strftime("%-d %b %Y")


def _at(text: str) -> str:
    """A time `rouh/offsite.py` keeps as "2026-11-25 16:12 UTC", in the person's own clock and words."""
    import datetime as dt

    try:
        ts = dt.datetime.strptime(str(text or ""), "%Y-%m-%d %H:%M UTC").replace(tzinfo=dt.timezone.utc).timestamp()
    except ValueError:
        return str(text or "")
    from . import clock

    return clock.moment(ts).strftime("%-d %b %Y, %H:%M")


def state(who) -> dict:
    """Everything Copy off this machine shows: whether it is set up, where to, how it is locked,
    the last copy and what the bucket holds, and the two kinds with their steps. Never a key or the
    password."""
    from . import offsite

    try:
        s = offsite.settings()
    except offsite.NotSetUp as exc:
        s, why = None, str(exc)
    else:
        why = ""
    out: dict = {"admin": bool(getattr(who, "is_admin", False)), "set_up": s is not None,
                 "kinds": [{"id": k, **v} for k, v in KINDS.items()], "sending": _SENDING.locked(),
                 "nightly": offsite.nightly(), "asked": asked(who)}
    if s is None:
        # Half set up (a settings file missing a value) is said; not set up at all is the plain case.
        out["problem"] = why if "half set up" in why or "needs ROUH_OFFSITE" in why else ""
        return out
    kind = offsite.provider_of(s)
    host = re.sub(r"^https?://", "", s["endpoint"]).split("/", 1)[0]
    last = offsite.status()
    good = last.get("last_good") or {}
    out.update({
        "kind": kind, "kind_name": KINDS[kind]["name"] if kind in KINDS else "an S3 bucket",
        "bucket": s["bucket"], "host": host, "region": offsite.region_of(s) if kind == "s3" else "",
        "prefix": s["prefix"],
        "lock": "key" if s["recipient"] else "password",
        "password_made": _when(_saved_at("ROUH_OFFSITE_PASSPHRASE")) if s["passphrase"] else "",
        "every_days": offsite.EVERY_DAYS, "keep": offsite.KEEP, "retry_hours": offsite.RETRY_HOURS,
        "last_good": {"at": _at(good.get("at", "")), "bytes": int(good.get("bytes") or 0)} if good else None,
        "last_failed": ({"at": _at(last.get("at", "")), "error": last.get("error", "")}
                        if last and not last.get("ok") else None),
        "in_bucket": {**(bucket := offsite.in_bucket()), "arrived_at": _at(bucket.get("arrived_at", ""))},
        "sent_now": _sent_now(last),
    })
    if s["passphrase"] and _flag(who, UNSAVED) and getattr(who, "is_admin", False):
        # Made and never confirmed saved: shown again until "I have saved it", or the copies would be
        # locked with a password nobody holds.
        out["password"] = s["passphrase"]
    return out


def _sent_now(last: dict) -> dict:
    """What the last press of Send a copy now did, until the weekly copy says something newer."""
    if not _SENT or _SENDING.locked():
        return dict(_SENT)
    if float(last.get("ts") or 0) > float(_SENT.get("started") or 0) + 120:
        return {}
    return {**_SENT, **({"at": _at(_SENT["at"])} if _SENT.get("at") else {})}


def _flag(who, name: str) -> bool:
    from .models import UserSetting

    user_id, org_id = _ids(who)
    return UserSetting.objects.filter(user_id=user_id, org_id=org_id, name=name).exists()


def _set_flag(who, name: str, on: bool) -> None:
    from .models import UserSetting

    user_id, org_id = _ids(who)
    if not on:
        UserSetting.objects.filter(user_id=user_id, org_id=org_id, name=name).delete()
        return
    UserSetting.objects.bulk_create(
        [UserSetting(user_id=user_id, org_id=org_id, name=name, value="true", updated_at=time.time())],
        update_conflicts=True, unique_fields=["user_id", "name"], update_fields=["org_id", "value", "updated_at"])


def password_saved(who) -> dict:
    """The owner pressed "I have saved it": the password is not shown again."""
    _admin(who)
    _set_flag(who, UNSAVED, False)
    return state(who)


# --- setting it up --------------------------------------------------------------------------

def _check(values: dict) -> None:
    """The bucket listed, and one small file written and deleted under this Rouh's prefix: the token
    can do what the weekly copy does. Refused with what to change otherwise."""
    from . import offsite

    s = {"endpoint": values["ROUH_OFFSITE_ENDPOINT"], "bucket": values["ROUH_OFFSITE_BUCKET"],
         "key_id": values["ROUH_OFFSITE_KEY_ID"], "secret": values["ROUH_OFFSITE_SECRET"],
         "provider": values["ROUH_OFFSITE_PROVIDER"], "region": values["ROUH_OFFSITE_REGION"]}
    prefix = offsite.prefix()
    kind = KINDS[values["ROUH_OFFSITE_PROVIDER"]]["name"]
    try:
        c = offsite.client(s, quick=True)
    except Exception:  # noqa: BLE001 - the kind only, never what was typed
        raise Refused("Rouh could not make a connection with those values. Check them and try again.") from None
    step = "listed"
    try:
        c.list_objects_v2(Bucket=s["bucket"], Prefix=prefix, MaxKeys=1)
        step = "written to"
        key = prefix + ".rouh-check"
        c.put_object(Bucket=s["bucket"], Key=key, Body=b"Rouh checks it can write here; this is deleted at once.\n")
        step = "cleaned up in"
        c.delete_object(Bucket=s["bucket"], Key=key)
    except Exception as exc:  # noqa: BLE001 - said in words, never with a key
        code = ""
        resp = getattr(exc, "response", None)
        if isinstance(resp, dict):
            code = str((resp.get("Error") or {}).get("Code") or "")
        if code in ("NoSuchBucket",):
            raise Refused(f"{kind} has no bucket named {s['bucket']} there. Check its name"
                          + (" and the region." if values["ROUH_OFFSITE_PROVIDER"] == "s3" else
                             " and the Account ID.")) from None
        if code in ("InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied", "403", "Forbidden",
                    "AuthorizationHeaderMalformed", "PermanentRedirect", "301"):
            raise Refused(f"The bucket could not be {step} with those keys ({code}). "
                          + ("The token needs Object Read & Write on that bucket."
                             if values["ROUH_OFFSITE_PROVIDER"] == "r2" else
                             "The user needs s3:ListBucket on the bucket and s3:PutObject, s3:GetObject and "
                             "s3:DeleteObject on what is in it, in the region the bucket is in.")) from None
        raise Refused(f"{kind} could not be reached, or did not answer as a bucket does "
                      f"({code or type(exc).__name__}). Check the values and try again.") from None


def save(who, kind: str, where: str, bucket: str, key_id: str, secret: str) -> dict:
    """The bucket checked and kept, with a new password unless the copies are locked already: then
    {"password": ..., shown once} beside what the page shows. Nothing is kept when the check fails."""
    from . import offsite, service_keys

    _admin(who)
    kind = str(kind or "").strip().lower()
    if kind not in KINDS:
        raise Refused("Choose Cloudflare R2 or Amazon S3.")
    url, region = endpoint(kind, where)
    values = {"ROUH_OFFSITE_PROVIDER": kind, "ROUH_OFFSITE_REGION": "" if kind == "r2" else region,
              "ROUH_OFFSITE_ENDPOINT": url, "ROUH_OFFSITE_BUCKET": _bucket_name(bucket or where),
              "ROUH_OFFSITE_KEY_ID": "".join(str(key_id or "").split()),
              "ROUH_OFFSITE_SECRET": "".join(str(secret or "").split())}
    if not values["ROUH_OFFSITE_SECRET"]:
        # Changing the bucket only: the secret already kept, when there is one.
        values["ROUH_OFFSITE_SECRET"] = service_keys.value("ROUH_OFFSITE_SECRET")
    if not values["ROUH_OFFSITE_KEY_ID"] or not values["ROUH_OFFSITE_SECRET"]:
        raise Refused("Paste the access key id and the secret access key first. Nothing was saved.")
    _check(values)
    recipient = service_keys.value("ROUH_OFFSITE_RECIPIENT")
    passphrase = service_keys.value("ROUH_OFFSITE_PASSPHRASE")
    made = ""
    if not recipient and not passphrase:
        passphrase = made = make_password()
    values.update(ROUH_OFFSITE_RECIPIENT=recipient, ROUH_OFFSITE_PASSPHRASE="" if recipient else passphrase)
    _keep(who, values, f"the {KINDS[kind]['name']} bucket was listed and written to")
    if made:
        _set_flag(who, UNSAVED, True)
    log.info("the copy off this machine was set up to %s by user %s", KINDS[kind]["name"], who.user_id)
    _answer(who, "set up")
    return {**state(who), **({"password": made} if made else {})}


def new_password(who) -> dict:
    """A new password for the copies from now on, shown once. The copies already made still open only
    with the password they were locked with."""
    from . import offsite, service_keys

    _admin(who)
    if not offsite.set_up():
        raise Refused("There is no copy off this machine to lock yet.")
    values = {f.name: service_keys.value(f.name) for f in service_keys.BY_ID["offsite"].fields}
    made = make_password()
    values.update(ROUH_OFFSITE_RECIPIENT="", ROUH_OFFSITE_PASSPHRASE=made)
    _keep(who, values, "a new password was made")
    _set_flag(who, UNSAVED, True)
    log.info("a new password for the copies off this machine was made by user %s", who.user_id)
    return {**state(who), "password": made}


def stop(who) -> dict:
    """No more copies: what was kept here for them is forgotten. The copies in the bucket stay there."""
    from . import offsite, service_keys

    _admin(who)
    service_keys.remove(who, "offsite")
    _set_flag(who, UNSAVED, False)
    _SENT.clear()
    offsite.forget_bucket()
    return state(who)


def _keep(who, values: dict, said: str) -> None:
    from . import service_keys

    from . import offsite

    service_keys._keep(who, service_keys.BY_ID["offsite"], values, said)
    values.clear()
    offsite.forget_bucket()


def send_now(who) -> dict:
    """One copy now, in the background; the page looks again for how it went."""
    from . import offsite

    _admin(who)
    if not offsite.set_up():
        raise Refused("Set up where the copy goes first.")
    if not _SENDING.acquire(blocking=False):
        raise Refused("A copy is being sent now.")
    _SENT.clear()
    _SENT.update(started=time.time())

    def go() -> None:
        from django.db import close_old_connections

        try:
            got = offsite.run()
            _SENT.update(ok=True, at=got["at"], bytes=got["bytes"])
        except Exception as exc:  # noqa: BLE001 - kept with the reason (offsite.status too)
            log.warning("the copy sent from the page failed: %s", exc)
            _SENT.update(ok=False, error=str(exc)[:300])
        finally:
            _SENDING.release()
            close_old_connections()

    threading.Thread(target=go, name="rouh-offsite-now", daemon=True).start()
    return state(who)


# --- asked once -----------------------------------------------------------------------------

def _ids(who) -> tuple[str, str]:
    return str(getattr(who, "user_id", "") or ""), str(getattr(who, "org_id", "") or "")


def asked(who) -> dict:
    """When the popup was shown to this person, and what they pressed: {} for never."""
    import json

    from .models import UserSetting

    user_id, org_id = _ids(who)
    value = (UserSetting.objects.filter(user_id=user_id, org_id=org_id, name=ASKED)
             .values_list("value", flat=True).first())
    try:
        got = json.loads(value) if value else {}
    except (TypeError, ValueError):
        got = {}
    return got if isinstance(got, dict) else {}


def _answer(who, answer: str) -> dict:
    import json

    from .models import UserSetting

    user_id, org_id = _ids(who)
    got = asked(who)
    if not got.get("at"):
        got["at"] = time.time()
    got["answer"] = answer
    UserSetting.objects.bulk_create(
        [UserSetting(user_id=user_id, org_id=org_id, name=ASKED, value=json.dumps(got), updated_at=time.time())],
        update_conflicts=True, unique_fields=["user_id", "name"], update_fields=["org_id", "value", "updated_at"])
    return got


def _in_use_since(who) -> float:
    """When this Rouh was set up: its organisation's start, else the person's account's."""
    from .models import Organisation, User

    org = Organisation.objects.filter(id=str(getattr(who, "org_id", "") or "")).values_list("created_at", flat=True).first()
    if org:
        return float(org)
    joined = User.objects.filter(id=getattr(who, "user_id", None)).values_list("date_joined", flat=True).first()
    return joined.timestamp() if joined else time.time()


def ask_now(who, now: float | None = None) -> bool:
    """Whether the popup is shown now: to the administrator, once, after this Rouh has been in use a
    while, and only while no copy is set up."""
    from . import offsite

    if not getattr(who, "is_admin", False) or asked(who).get("at") or offsite.set_up():
        return False
    return (now or time.time()) - _in_use_since(who) >= ASK_AFTER_DAYS * 86400


def answered(who, answer: str) -> dict:
    """The popup shown ("shown"), or answered: "r2", "s3" or "later". Any of them counts as asked."""
    answer = str(answer or "")
    if answer not in ("shown", "r2", "s3", "later"):
        raise Refused("That is not an answer to the question.")
    got = asked(who)
    if answer == "shown" and got.get("answer"):
        return got
    return _answer(who, answer)


# --- the one sign ----------------------------------------------------------------------------

def sign(me) -> list[tuple[str, str]]:
    """Anatomy's board, under Meta: the only reminder there is."""
    from . import offsite

    if offsite.set_up():
        last = offsite.status()
        good = float((last.get("last_good") or {}).get("ts") or 0)
        if last and not last.get("ok") and not good:
            return [(SECTION, "The copy off this machine has not gone yet")]
        if good and time.time() - good > STALE_DAYS * 86400:
            return [(SECTION, f"No copy off this machine in {STALE_DAYS} days")]
        return []
    return [(SECTION, "No copy off this machine")]
