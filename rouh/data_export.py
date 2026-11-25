"""Your data, in plain formats, in one zip: what the owner downloads from Settings, You, Your account.

Task 98, step 98-25, gap G22 (25 November 2026): "a plain export of the owner's data in normal formats -
chats, contacts, tasks, files and settings in one zip - from Settings, beside the existing database dump".
The dump is `python manage.py export_rouh` (`rouh/bundle.py`): the whole Rouh, keys and all, to move it
into another stack. This is the other thing a person wants: their own words and records, readable
without Rouh, in formats any other program opens.

    README.txt                what is in it, and what is not
    chats/<when> <title>.md   every chat, one file each, as it was said; chats.json the same as data
    contacts/contacts.vcf     every person Rouh knows, as vCards: a phone's card as the phone holds it
    contacts/contacts.csv     the same people as a table
    tasks/tasks.csv           every project and task: number, title, status, summary, folder, dates
    tasks/tasks.json          the same, with each task's steps and tags
    tasks/workspace/...       the workspace's own documents: notes, pages, tables (text formats only)
    files/...                 every file kept in Rouh's file store, as it is, by where it belongs
    settings/settings.json    the account, its settings and which models answer

What is never in it: a password, a key, a token or a saved login, nor any setting whose name says it holds
one (`SECRET_WORDS`); incognito chats, which are not kept at all; what is in the person's mailbox, calendar
or Drive, which is theirs at Google already. Only an administrator of this Rouh downloads it, since its
chats and tasks are the whole Rouh's (AGENTS.md, "Whose data is it": the account's own ids in every query
that has them).
"""
from __future__ import annotations

import csv
import io
import json
import logging
import os
import re
import tempfile
import time
import zipfile
from datetime import datetime, timezone

log = logging.getLogger("rouh.data_export")

#: A setting whose name holds one of these is a secret and never leaves.
SECRET_WORDS = ("key", "token", "secret", "password", "pass", "sealed", "cookie", "session", "credential")
#: Documents of the workspace that are put in: text formats a person opens anywhere.
DOC_ENDINGS = (".md", ".txt", ".html", ".htm", ".csv", ".json", ".css", ".svg")
#: Folders of the workspace that are never put in: git's own, scratch, and libraries.
SKIP_DIRS = {".git", "temp", "node_modules", ".venv", "__pycache__", ".rouh", ".design", ".one"}
#: Rouh's own files in the workspace, never the person's.
SKIP_FILES = {"_migration-map.json"}
#: Larger than this, a workspace document is left out and listed in the README.
MOST_DOC = 20 * 1024 * 1024
#: Larger than this, a stored file is left out and listed in the README.
MOST_FILE = 2 * 1024 * 1024 * 1024


class Refused(Exception):
    """Said to the person as it is."""


def _iso(at) -> str:
    try:
        return datetime.fromtimestamp(float(at), tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC") if at else ""
    except (TypeError, ValueError, OSError):
        return ""


def _day(at) -> str:
    return _iso(at)[:10]


def _safe(name: str, most: int = 80) -> str:
    """A name a file may have on every system."""
    name = re.sub(r"[\x00-\x1f<>:\"/\\|?*]+", " ", str(name or "")).strip(" .")
    return re.sub(r"\s+", " ", name)[:most].strip(" .") or "untitled"


def _secret(name: str) -> bool:
    low = str(name or "").lower()
    return any(w in low for w in SECRET_WORDS)


# --- chats ---------------------------------------------------------------------------------------


def _text_of(content) -> str:
    """What a message said, as words: its text, and a line for each tool it used or file it held."""
    if isinstance(content, str):
        try:
            content = json.loads(content)
        except (TypeError, ValueError):
            return content
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        content = [content]
    if not isinstance(content, list):
        return str(content or "")
    out = []
    for block in content:
        if isinstance(block, str):
            out.append(block)
            continue
        if not isinstance(block, dict):
            continue
        kind = block.get("type")
        if kind == "text":
            out.append(str(block.get("text") or ""))
        elif kind == "tool_use":
            out.append(f"[used {block.get('name') or 'a tool'}]")
        elif kind in ("image", "document", "file"):
            out.append(f"[{kind}]")
    return "\n\n".join(t for t in out if t.strip())


def chats() -> list[dict]:
    """Every kept chat, General first, each with what was said in it, oldest first."""
    from . import conversations
    from .models import Chat
    from .models.memory import TranscriptMessage

    rows = {c.id: c for c in Chat.objects.filter(incognito=False)}
    order = [conversations.GENERAL] + sorted((i for i in rows if i != conversations.GENERAL),
                                             key=lambda i: rows[i].created_at or 0)
    out = []
    for cid in order:
        said = []
        q = (TranscriptMessage.objects.filter(session_id=cid, live=True, notice=False)
             .order_by("ts", "id").values_list("ts", "role", "content"))
        for ts, role, content in q.iterator():
            text = _text_of(content).strip()
            if text and role in ("user", "assistant"):
                said.append({"at": _iso(ts), "who": "You" if role == "user" else "Rouh", "said": text})
        if not said:
            continue
        c = rows.get(cid)
        title = "General" if cid == conversations.GENERAL else ((c.title if c else "") or "Untitled chat")
        out.append({"id": cid, "title": title, "started": _iso(c.created_at) if c else (said[0]["at"]),
                    "messages": said})
    return out


def chat_markdown(chat: dict) -> str:
    lines = [f"# {chat['title']}", "", f"Started {chat['started'] or 'at an unknown time'}.", ""]
    for m in chat["messages"]:
        lines += [f"**{m['who']}**, {m['at']}", "", m["said"], ""]
    return "\n".join(lines)


# --- contacts ------------------------------------------------------------------------------------


def _values(items) -> list[str]:
    out = []
    for v in items or []:
        if isinstance(v, dict):
            v = v.get("value") or v.get("number") or v.get("address") or ""
        v = str(v or "").strip()
        if v:
            out.append(v)
    return out


def people(user_id: str, org_id: str) -> list[dict]:
    """Every person this person's Synapse Master holds: their contacts and everybody else Rouh knows."""
    from .synapse import db
    from .synapse.sources import contacts

    ds = contacts.master_of(user_id, org_id, make=False)
    if ds is None:
        return []
    out = []
    for r in db.rows("SELECT id, title, meta FROM synapse.item WHERE dataset_id = %s AND kind = 'person' "
                     "AND deleted_at IS NULL ORDER BY title", (ds["id"],)):
        meta = r.get("meta") or {}
        ic = meta.get("icloud") if isinstance(meta.get("icloud"), dict) else {}
        name = str(meta.get("name") or r.get("title") or "").strip()
        if not name:
            continue
        out.append({"name": name, "organisation": str(meta.get("organisation") or ""),
                    "emails": _values(ic.get("emails") or meta.get("emails")),
                    "phones": _values(ic.get("phones") or meta.get("phones")),
                    "birthday": str(meta.get("birthday") or ""), "note": str(meta.get("note") or ""),
                    "relationship": str(meta.get("relationship") or "") if not isinstance(meta.get("relationship"), dict)
                    else str(meta["relationship"].get("value") or ""),
                    "contact": bool(ic.get("href")), "vcard": str(ic.get("vcard") or "")})
    return out


def vcard_of(p: dict) -> str:
    """A person as a vCard: the phone's own card when they are a contact, else one made of what is known."""
    if p["vcard"].strip().upper().startswith("BEGIN:VCARD"):
        text = p["vcard"].strip().replace("\r\n", "\n").replace("\n", "\r\n")
        return text + "\r\n"
    from . import vcard

    lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + vcard.escape(p["name"])]
    parts = p["name"].split()
    lines.append("N:" + ";".join([vcard.escape(parts[-1] if len(parts) > 1 else p["name"]),
                                  vcard.escape(" ".join(parts[:-1]) if len(parts) > 1 else ""), "", "", ""]))
    if p["organisation"]:
        lines.append("ORG:" + vcard.escape(p["organisation"]))
    lines += ["EMAIL:" + vcard.escape(e) for e in p["emails"]]
    lines += ["TEL:" + vcard.escape(t) for t in p["phones"]]
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", p["birthday"]):
        lines.append("BDAY:" + p["birthday"])
    if p["note"]:
        lines.append("NOTE:" + vcard.escape(p["note"]))
    lines.append("END:VCARD")
    return "".join(vcard.fold(line) + "\r\n" for line in lines)


def contacts_csv(found: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Name", "Organisation", "Emails", "Phones", "Birthday", "Who they are to you", "Note", "On your phone"])
    for p in found:
        w.writerow([p["name"], p["organisation"], "; ".join(p["emails"]), "; ".join(p["phones"]), p["birthday"],
                    p["relationship"], p["note"], "yes" if p["contact"] else "no"])
    return buf.getvalue()


# --- tasks ---------------------------------------------------------------------------------------


def tasks() -> list[dict]:
    """Every project and task, as the task browser knows them."""
    from .models import Project, Task

    out = []
    for p in Project.objects.order_by("number", "created_at"):
        out.append({"kind": "project", "number": p.number, "title": p.title, "status": p.status,
                    "summary": p.description or "", "folder": p.folder, "created": _iso(p.created_at),
                    "updated": _iso(p.updated_at), "archived": "", "steps": [], "tags": []})
    for t in Task.objects.order_by("number", "created_at"):
        meta = t.meta if isinstance(t.meta, dict) else {}
        steps = meta.get("steps") if isinstance(meta.get("steps"), dict) else {}
        out.append({"kind": "task", "number": t.number, "title": t.title, "status": t.status,
                    "summary": t.summary or "", "folder": t.folder, "created": _iso(t.created_at),
                    "updated": _iso(t.updated_at), "archived": _iso(t.archived_at),
                    "steps": [{"folder": k, "title": str((v or {}).get("title") or k),
                               "description": str((v or {}).get("description") or "")}
                              for k, v in steps.items() if isinstance(v, dict)],
                    "tags": [str(x) for x in (meta.get("tags") or []) if isinstance(x, str)]})
    return out


def tasks_csv(found: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Kind", "Number", "Title", "Status", "Summary", "Folder", "Created", "Updated", "Archived", "Steps"])
    for t in found:
        w.writerow([t["kind"], "" if t["number"] is None else t["number"], t["title"], t["status"], t["summary"],
                    t["folder"], t["created"], t["updated"], t["archived"], len(t["steps"])])
    return buf.getvalue()


def workspace_docs(root: str):
    """(path inside the workspace, full path) of each document of the workspace worth keeping, and what
    was left out as too large."""
    found, left = [], []
    if not root or not os.path.isdir(root):
        return found, left
    for top, dirs, files in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith(".")
                         and not os.path.islink(os.path.join(top, d)))
        for name in sorted(files):
            full = os.path.join(top, name)
            # Rouh's own bookkeeping (`.object.json`, the migration map) is not the person's.
            if os.path.islink(full) or name.startswith(".") or name in SKIP_FILES or not name.lower().endswith(DOC_ENDINGS):
                continue
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            try:
                size = os.path.getsize(full)
            except OSError:
                continue
            if size > MOST_DOC:
                left.append(rel)
                continue
            found.append((rel, full))
    return found, left


# --- files ---------------------------------------------------------------------------------------


def stored_files(user_id: str, org_id: str):
    """(path inside the zip, full path) of each file in Rouh's store that belongs to this person's
    organisation and is not in the bin, and what was left out."""
    from . import filestore
    from .models import File

    top = filestore.root()
    found, left, seen = [], [], set()
    q = File.objects.filter(deleted_at__isnull=True, storage="disk").filter(org_id__in=[str(org_id), ""])
    for f in q.order_by("created_at").iterator():
        path = f.path or ""
        if not path or path in seen or not os.path.isfile(path) or not filestore.inside(path):
            continue
        seen.add(path)
        rel = os.path.relpath(path, top).replace(os.sep, "/")
        if rel.startswith((filestore.SIDE + "/", filestore.BIN + "/", filestore.VERSIONS + "/")):
            continue
        try:
            if os.path.getsize(path) > MOST_FILE:
                left.append(rel)
                continue
        except OSError:
            continue
        found.append((rel, path))
    return found, left


# --- settings ------------------------------------------------------------------------------------


def _plain(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(k): _plain(v) for k, v in value.items() if not _secret(k)}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    return str(value)


def settings_of(user_id: str, org_id: str) -> dict:
    from django.forms.models import model_to_dict

    from . import signin
    from .models import ModelDefaults, User, UserSetting

    user = User.objects.filter(pk=user_id, org_id=org_id).first()
    account = {}
    if user is not None:
        account = {"username": user.username, "name": user.get_full_name(), "email": signin.primary(user),
                   "administrator": bool(user.is_org_admin), "joined": user.date_joined.isoformat() if user.date_joined else ""}
    mine = {}
    for s in UserSetting.objects.filter(user_id=str(user_id), org_id=str(org_id)).order_by("name"):
        if _secret(s.name):
            continue
        try:
            mine[s.name] = json.loads(s.value)
        except (TypeError, ValueError):
            mine[s.name] = s.value
    models = ModelDefaults.objects.filter(org_id=str(org_id)).first()
    return {"account": account, "settings": _plain(mine),
            "models": _plain({k: v for k, v in model_to_dict(models).items() if k != "org_id"}) if models else {}}


# --- the zip -------------------------------------------------------------------------------------


def _readme(counts: dict, left: list[str], made: str) -> str:
    lines = [
        "Your data from Rouh",
        "===================",
        "",
        f"Made {made}.",
        "",
        "Everything here is in plain formats that other programs open without Rouh:",
        "",
        f"chats/       {counts['chats']} chats, one Markdown file each (opens in any text editor), and chats.json with the same as data.",
        f"contacts/    {counts['people']} people as vCards (contacts.vcf, which a phone, Apple Contacts or Google Contacts imports) and as a table (contacts.csv).",
        f"tasks/       {counts['tasks']} tasks and projects as a table (tasks.csv) and as data with their steps (tasks.json),",
        f"             and {counts['docs']} documents of your workspace (notes, pages, tables) under tasks/workspace/.",
        f"files/       {counts['files']} files kept in Rouh, as they are.",
        "settings/    settings.json: your account, your settings and which models answer.",
        "",
        "Not in here, on purpose:",
        "- passwords, keys, tokens and saved logins, and any setting that holds one;",
        "- incognito chats, which Rouh never keeps;",
        "- your mail, calendar and Drive, which stay where they are, at Google;",
        "- Rouh itself. A copy of the whole Rouh, to move it to another machine, is a different file:",
        "  python manage.py export_rouh --out rouh.bundle (see deploy/container/INSTALL-LINUX.md).",
    ]
    if left:
        lines += ["", "Left out because each is very large (copy them from the machine itself):"]
        lines += [f"- {p}" for p in left[:200]]
        if len(left) > 200:
            lines.append(f"- and {len(left) - 200} more")
    return "\n".join(lines) + "\n"


def make(who, folder: str | None = None) -> str:
    """The zip, written to a new file only its owner can read; its path. The caller deletes it."""
    from .config import config

    if not getattr(who, "is_admin", False):
        raise Refused("Only an administrator of this Rouh downloads its data.")
    user_id, org_id = str(who.user_id), str(who.org_id)
    made = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    fd, path = tempfile.mkstemp(prefix="rouh-your-data-", suffix=".zip", dir=folder)
    os.close(fd)
    os.chmod(path, 0o600)
    started = time.monotonic()
    try:
        with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as z:
            said = chats()
            names = set()
            for c in said:
                base = f"{c['started'][:10] or 'undated'} {_safe(c['title'], 60)}"
                name, n = base, 2
                while name in names:
                    name, n = f"{base} ({n})", n + 1
                names.add(name)
                z.writestr(f"chats/{name}.md", chat_markdown(c))
            z.writestr("chats/chats.json", json.dumps(said, ensure_ascii=False, indent=1))

            found = people(user_id, org_id)
            z.writestr("contacts/contacts.vcf", "".join(vcard_of(p) for p in found))
            z.writestr("contacts/contacts.csv", contacts_csv(found))

            all_tasks = tasks()
            z.writestr("tasks/tasks.csv", tasks_csv(all_tasks))
            z.writestr("tasks/tasks.json", json.dumps(all_tasks, ensure_ascii=False, indent=1))
            docs, left_docs = workspace_docs(config.assistant_repo)
            for rel, full in docs:
                try:
                    z.write(full, "tasks/workspace/" + rel)
                except OSError:
                    left_docs.append(rel)

            files, left_files = stored_files(user_id, org_id)
            for rel, full in files:
                try:
                    z.write(full, "files/" + rel)
                except OSError:
                    left_files.append(rel)

            z.writestr("settings/settings.json", json.dumps(settings_of(user_id, org_id), ensure_ascii=False, indent=1))
            counts = {"chats": len(said), "people": len(found), "tasks": len(all_tasks), "docs": len(docs),
                      "files": len(files)}
            z.writestr("README.txt", _readme(counts, ["tasks/workspace/" + p for p in left_docs]
                                             + ["files/" + p for p in left_files], made))
    except Exception:
        try:
            os.unlink(path)
        except OSError:
            pass
        raise
    log.info("data export: %s chats, %s people, %s tasks, %s documents, %s files in %.1f s",
             counts["chats"], counts["people"], counts["tasks"], counts["docs"], counts["files"],
             time.monotonic() - started)
    return path


def file_name(who) -> str:
    """What the download is called: the Rouh's own name and the day."""
    from . import birth

    try:
        row = birth.current(str(who.org_id))
        name = row.name if row is not None else "Rouh"
    except Exception:  # noqa: BLE001 - the name is only a nicety
        name = "Rouh"
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "rouh"
    return f"{slug}-your-data-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.zip"
