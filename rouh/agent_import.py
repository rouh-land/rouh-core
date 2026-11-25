"""Bring in an OpenClaw or Hermes Agent setup: its memory, its persona and its skills, in one command.

‹owner›, 25 November 2026: "Import from OpenClaw and Hermes: memory, persona and skills in one command. Hermes
used exactly this against OpenClaw." Hermes Agent's own `hermes claw migrate` (now `hermes import-agent
openclaw`) is the reference for what is read and how it maps, and OpenClaw's `openclaw migrate hermes` for the
other way round; this does the same for both, into what Rouh already has:

| From | In OpenClaw | In Hermes | Into Rouh |
|---|---|---|---|
| Persona | `workspace/SOUL.md`, and the vibe of `IDENTITY.md` | `SOUL.md` | one rule, Writing and voice |
| About the person | `workspace/USER.md` | `memories/USER.md`, one rule per `§` entry | rules, About you |
| Memory | `workspace/MEMORY.md`, by section; `memory/*.md`, one per day | `memories/MEMORY.md`, by `§` entry | notes in Synapse Master |
| Instructions | `AGENTS.md`, `TOOLS.md`, `HEARTBEAT.md` | `AGENTS.md` | notes, found when needed, never followed every turn |
| Skills | `workspace/skills/`, `workspace/.agents/skills/`, `skills/` | `skills/**/SKILL.md`, flattened | the workspace's `.claude/skills/<name>/` |
| Keys | only when asked: Google's and xAI's | the same | the Models page's keys, when none is set |

Everything else (the model and providers, chat channels, MCP servers, cron, conversation history, the name and
emoji of the old assistant) is reported as not imported, each with where Rouh keeps its own.

The rules of it, which the person set when asking:

- **Found by itself.** OpenClaw at `$OPENCLAW_STATE_DIR`, `~/.openclaw`, or the old `~/.clawdbot` and
  `~/.moltbot`; Hermes at `$HERMES_HOME` or `~/.hermes`. A path can be given instead, a folder or a `.zip` or
  `.tar.gz` of one, such as a file sent in a chat.
- **A preview first.** `plan` reads and changes nothing; `apply` does what the plan said.
- **Nothing overwritten.** Rules and notes are added beside what is there, and one whose words are already in
  Rouh is skipped. A skill whose name is taken is skipped, or added as `<name>-imported` when asked.
- **An undo.** Every import is kept as a record of exactly what it added (`app_state`, keyed by organisation and
  person), and `undo` takes that, and only that, away again.
- **No secrets unless asked.** No `.env`, credential or auth file is opened unless `include_secrets` is given;
  then only Google's and xAI's keys are taken, and only where the organisation has none.

The person's own setup is read as theirs: what it says becomes their rules and notes, as if they had typed it.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import tarfile
import tempfile
import time
import uuid
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path

log = logging.getLogger("rouh.agent_import")

SOURCES = {"openclaw": "OpenClaw", "hermes": "Hermes"}
#: Where an import is kept, for its undo: `<PREFIX><org>:<user>:<id>` in `app_state`.
PREFIX = "agent_import:"
SKILLS_DIR = ".claude/skills"
CONFLICTS = ("skip", "rename")

#: What is read, at most: a file bigger than this is reported and left.
FILE_MOST = 1_000_000
#: A skill bigger than this, or with more files, is reported and left.
SKILL_MOST = 20_000_000
SKILL_FILES_MOST = 2_000
#: An archive that unpacks to more than this is refused.
ARCHIVE_MOST = 500_000_000
#: Never copied out of a skill's folder, whatever it is called.
SKILL_LEAVE = re.compile(r"^(\.git|\.env.*|__pycache__|node_modules|\.DS_Store|.*\.(pem|key|p12|pfx))$", re.I)

#: The keys that can be taken, when asked: the environment names each source uses, and Rouh's provider.
KEY_NAMES = {"GEMINI_API_KEY": "google", "GOOGLE_API_KEY": "google", "XAI_API_KEY": "xai"}
#: Keys found that Rouh keeps somewhere else, said by name and never read.
OWN_KEYS = {"ANTHROPIC_API_KEY": "Anthropic", "OPENAI_API_KEY": "OpenAI"}

KINDS = {
    "persona": "Persona", "about_you": "About you", "memory": "Memory", "daily": "Daily memory",
    "instructions": "Instructions", "skill": "Skill", "key": "Key", "setting": "Setting", "history": "History",
}


class Refused(ValueError):
    """Something the import cannot do, in words to say."""


@dataclass
class Item:
    """One thing found, and what is done with it: `add`, `skip` (already in Rouh, or left for a reason) or
    `not_mapped` (Rouh has no place for it here)."""

    source: str
    kind: str
    title: str
    origin: str
    action: str
    to: str = ""
    why: str = ""
    text: str = ""
    group: str = ""
    home: str = ""
    folder: str = ""
    dest: str = ""
    provider: str = ""
    secret: str = field(default="", repr=False)

    def shown(self) -> dict:
        got = asdict(self)
        got.pop("secret", None)
        got.pop("folder", None)
        if self.text:
            got["text"] = self.text if len(self.text) <= 600 else self.text[:600] + " ..."
        return got


@dataclass
class Source:
    kind: str
    root: Path
    shown: str
    workspace: Path | None = None
    config: dict = field(default_factory=dict)
    config_said: str = ""


# --- finding it -------------------------------------------------------------------------------


def _home() -> Path:
    return Path(os.path.expanduser("~"))


def usual_places(kind: str) -> list[Path]:
    """Where each source is installed when nobody says, in the order it is looked for."""
    home = _home()
    if kind == "openclaw":
        got = [Path(os.environ["OPENCLAW_STATE_DIR"])] if os.environ.get("OPENCLAW_STATE_DIR") else []
        if os.environ.get("OPENCLAW_HOME"):
            got.append(Path(os.environ["OPENCLAW_HOME"]) / ".openclaw")
        return got + [home / ".openclaw", home / ".clawdbot", home / ".moltbot"]
    got = [Path(os.environ["HERMES_HOME"])] if os.environ.get("HERMES_HOME") else []
    return got + [home / ".hermes"]


def _looks_like(p: Path) -> str:
    """Which source a folder is the home of, or a workspace of: "openclaw", "hermes" or ""."""
    if not p.is_dir():
        return ""
    if (p / "memories").is_dir() or ((p / "config.yaml").is_file() and not (p / "openclaw.json").is_file()):
        return "hermes"
    if any((p / n).is_file() for n in ("openclaw.json", "clawdbot.json", "moltbot.json")) \
            or (p / "workspace").is_dir():
        return "openclaw"
    if any((p / n).is_file() for n in ("SOUL.md", "IDENTITY.md", "MEMORY.md", "USER.md")) or (p / "memory").is_dir():
        return "openclaw"
    return ""


def _root_in(p: Path, kind: str) -> tuple[Path, str] | None:
    """The home of a source in a folder: the folder itself, or one up to three levels in (an archive usually
    holds `.openclaw/` or `.hermes/` rather than its contents)."""
    seen = [p]
    for depth in range(3):
        nxt = []
        for d in seen:
            got = _looks_like(d)
            if got and (kind in ("", "auto", got)):
                return d, got
            try:
                nxt += sorted(c for c in d.iterdir() if c.is_dir() and not c.is_symlink()
                              and c.name not in ("node_modules", ".git", "__MACOSX"))
            except OSError:
                pass
        seen = nxt[:200]
    return None


def _unpack(archive: Path, into: Path) -> None:
    """A .zip or a .tar(.gz) unpacked safely: nothing outside `into`, no links, and not too big."""
    total = 0
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as z:
            for info in z.infolist():
                name = info.filename
                if name.startswith(("/", "\\")) or ".." in Path(name).parts:
                    continue
                total += info.file_size
                if total > ARCHIVE_MOST:
                    raise Refused("That archive unpacks to more than 500 MB, so it was not read.")
                if (info.external_attr >> 16) & 0o170000 == 0o120000:
                    continue  # a link
                z.extract(info, into)
        return
    if tarfile.is_tarfile(archive):
        with tarfile.open(archive) as t:
            members = []
            for m in t.getmembers():
                if not (m.isfile() or m.isdir()):
                    continue
                total += m.size
                if total > ARCHIVE_MOST:
                    raise Refused("That archive unpacks to more than 500 MB, so it was not read.")
                members.append(m)
            t.extractall(into, members=members, filter="data")
        return
    raise Refused(f"{archive.name} is not a folder, a .zip or a .tar.gz, so there was nothing to read in it.")


def locate(source: str = "auto", path: str = "", *, scratch: Path | None = None) -> list[Source]:
    """The setups to import: the one at `path`, or every one found where it is usually installed.

    `scratch` is where an archive is unpacked; the caller removes it."""
    source = (source or "auto").strip().lower()
    if source not in ("auto", *SOURCES):
        raise Refused("Say openclaw, hermes or auto.")
    if path:
        p = Path(os.path.expanduser(path))
        if not p.exists():
            raise Refused(f"There is nothing at {path}.")
        if p.is_file():
            if scratch is None:
                raise Refused("An archive needs somewhere to be unpacked.")
            _unpack(p, scratch)
            p = scratch
        got = _root_in(p, source)
        if got is None:
            names = " or ".join(SOURCES[s] for s in (SOURCES if source == "auto" else [source]))
            raise Refused(f"No {names} setup was found in {path}: no SOUL.md, memory, skills or config there.")
        return [_source(got[1], got[0], path)]
    found = []
    for kind in (SOURCES if source == "auto" else [source]):
        for p in usual_places(kind):
            if _looks_like(p) == kind:
                found.append(_source(kind, p, str(p).replace(str(_home()), "~", 1)))
                break
    if not found:
        looked = ", ".join(str(p).replace(str(_home()), "~", 1)
                           for k in (SOURCES if source == "auto" else [source]) for p in usual_places(k))
        raise Refused(f"No OpenClaw or Hermes setup was found here (looked in {looked}). Give the path to one, "
                      "or a .zip of it.")
    return found


def _source(kind: str, root: Path, shown: str) -> Source:
    s = Source(kind=kind, root=root, shown=shown)
    if kind == "openclaw":
        for name in ("openclaw.json", "clawdbot.json", "moltbot.json"):
            if (root / name).is_file():
                s.config, s.config_said = _json5(root / name), name
                break
        s.workspace = _openclaw_workspace(root, s.config)
    else:
        if (root / "config.yaml").is_file():
            s.config, s.config_said = _yaml(root / "config.yaml"), "config.yaml"
    return s


def _openclaw_workspace(root: Path, config: dict) -> Path | None:
    said = (((config.get("agents") or {}).get("defaults") or {}).get("workspace") or "") \
        if isinstance(config.get("agents"), dict) else ""
    picks = []
    if isinstance(said, str) and said:
        p = Path(os.path.expanduser(said))
        picks.append(p if p.is_absolute() else root / p)
        picks.append(root / Path(said).name)
    picks += [root / "workspace", root / "workspace.default", root / "workspace-main", root]
    for p in picks:
        if p.is_dir() and any((p / n).exists() for n in ("SOUL.md", "AGENTS.md", "MEMORY.md", "memory.md", "USER.md",
                                                           "IDENTITY.md", "memory", "skills")):
            return p
    return None


def _read(p: Path) -> str:
    if not p.is_file() or p.is_symlink():
        return ""
    if p.stat().st_size > FILE_MOST:
        raise Refused(f"{p.name} is bigger than 1 MB")
    return p.read_text(encoding="utf-8", errors="replace")


def _json5(p: Path) -> dict:
    """OpenClaw's config, which is JSON5: comments and trailing commas allowed."""
    try:
        text = _read(p)
    except Refused:
        return {}
    try:
        got = json.loads(text)
    except ValueError:
        plain = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
        plain = re.sub(r"(?m)^\s*//.*$|(?<=[,{\[\s])//[^\n\"]*$", "", plain)
        plain = re.sub(r",(\s*[}\]])", r"\1", plain)
        plain = re.sub(r"(?m)([{,]\s*)([A-Za-z_$][\w$]*)\s*:", r'\1"\2":', plain)
        try:
            got = json.loads(plain)
        except ValueError:
            return {}
    return got if isinstance(got, dict) else {}


def _yaml(p: Path) -> dict:
    try:
        import yaml

        got = yaml.safe_load(_read(p))
    except Exception:  # noqa: BLE001 - a config that will not read is a config not used
        return {}
    return got if isinstance(got, dict) else {}


# --- what the words are -----------------------------------------------------------------------


def clean(text: str) -> str:
    """A Markdown file's own words: no front matter, no HTML comments, no blank lines at either end."""
    text = str(text or "").replace("\r\n", "\n").replace("\x00", "")
    text = re.sub(r"\A---\n.*?\n---\n", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"\A\s*# [A-Z]+\.md\b[^\n]*\n", "", text)  # "# SOUL.md - Who You Are", the template's own head
    lines = [ln.rstrip() for ln in text.split("\n")]
    out = "\n".join(lines).strip("\n")
    return re.sub(r"\n{3,}", "\n\n", out)


def _has_words(text: str) -> bool:
    """Whether anything is left once headings, empty template fields and rules are taken out."""
    for ln in text.split("\n"):
        s = ln.strip()
        if not s or s.startswith("#") or re.fullmatch(r"[-*_=\s]+", s):
            continue
        if re.fullmatch(r"[-*]?\s*(\*\*)?[\w ()/'-]{1,40}:(\*\*)?\s*(_?\(.*\)_?)?", s):
            continue  # "- **Name:**" with nothing after it, as OpenClaw's templates leave it
        return True
    return False


def entries(text: str) -> list[tuple[str, str]]:
    """A memory file as entries, (title, words): Hermes's `§` entries; else its `##` sections; else all of it."""
    text = clean(text)
    if "§" in text:
        parts = [p.strip() for p in text.split("§")]
        return [(_title_of(p), p) for p in parts if _has_words(p)]
    sections = re.split(r"(?m)^(?=#{1,3} )", text)
    if len(sections) > 1:
        got = []
        head = ""
        for s in sections:
            s = s.strip()
            if re.match(r"^# ", s) and "\n" not in s:
                head = s.lstrip("# ").strip()
                continue
            if re.match(r"^# ", s):
                first, _, rest = s.partition("\n")
                head = first.lstrip("# ").strip()
                s = rest.strip()
            if _has_words(s):
                got.append((_title_of(s, head), s))
        return got
    return [(_title_of(text), text)] if _has_words(text) else []


def _title_of(text: str, fallback: str = "") -> str:
    for ln in text.split("\n"):
        s = ln.strip().lstrip("#-* ").strip()
        if s:
            return " ".join(s.split())[:90]
    return fallback[:90]


def norm(text: str) -> str:
    return " ".join(str(text or "").lower().split())


def digest(text: str) -> str:
    return hashlib.sha1(norm(text).encode("utf-8")).hexdigest()


def identity(text: str) -> dict:
    """OpenClaw's IDENTITY.md as its fields: name, creature, vibe, emoji, avatar."""
    got = {}
    for ln in clean(text).split("\n"):
        m = re.match(r"^\s*[-*]?\s*\**\s*(name|creature|vibe|emoji|avatar)\s*:?\**\s*:?\s*(.*)$", ln, re.I)
        if m and m.group(2).strip() and not m.group(2).strip().startswith("_("):
            got[m.group(1).lower()] = m.group(2).strip().strip("*_ ")
    return got


def as_rouh(text: str, names: list[str]) -> str:
    """The persona's own name for itself written as Rouh, so the rule does not tell Rouh it is someone else."""
    for n in sorted({n for n in names if n and n.lower() != "rouh"}, key=len, reverse=True):
        text = re.sub(rf"\b{re.escape(n)}\b", "Rouh", text)
    return text


# --- the plan ---------------------------------------------------------------------------------


def _rel(s: Source, p: Path) -> str:
    try:
        return f"{s.shown.rstrip('/')}/{p.relative_to(s.root).as_posix()}" if p != s.root else s.shown
    except ValueError:
        return str(p)


def _skill_name(folder: Path, text: str) -> str:
    m = re.search(r"(?m)^name:\s*['\"]?([^'\"\n]+)", text[:2000]) if text.startswith("---") else None
    raw = (m.group(1) if m else folder.name).strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", raw).strip("-")[:60] or "imported-skill"


def _size(folder: Path) -> tuple[int, int]:
    n = total = 0
    for p in folder.rglob("*"):
        if any(SKILL_LEAVE.match(part) for part in p.relative_to(folder).parts):
            continue
        if p.is_file() and not p.is_symlink():
            n += 1
            total += p.stat().st_size
            if n > SKILL_FILES_MOST or total > SKILL_MOST:
                break
    return n, total


def _skill_folders(s: Source) -> list[tuple[Path, str]]:
    """Every skill of a source: (its folder, its category or "")."""
    got: list[tuple[Path, str]] = []
    if s.kind == "openclaw":
        places = [p for p in ((s.workspace / "skills") if s.workspace else None,
                              (s.workspace / ".agents" / "skills") if s.workspace else None,
                              s.root / "skills") if p is not None]
        seen = set()
        for place in places:
            if not place.is_dir() or place.resolve() in seen:
                continue
            seen.add(place.resolve())
            for d in sorted(place.iterdir()):
                if d.is_dir() and not d.is_symlink() and (d / "SKILL.md").is_file():
                    got.append((d, ""))
        return got
    place = s.root / "skills"
    if not place.is_dir():
        return got
    for md in sorted(place.rglob("SKILL.md")):
        rel = md.parent.relative_to(place)
        if any(part.startswith(".") for part in rel.parts) or md.parent.is_symlink():
            continue
        got.append((md.parent, rel.parts[0] if len(rel.parts) > 1 else ""))
    return got


def _hermes_bundled(s: Source) -> set[str]:
    """The skills Hermes put there itself (`skills/.bundled_manifest`): its own, about its own tools."""
    p = s.root / "skills" / ".bundled_manifest"
    try:
        text = _read(p)
    except Refused:
        return set()
    return {ln.split(":", 1)[0].strip().lower() for ln in text.split("\n") if ln.strip()}


def _hermes_disabled(s: Source) -> set[str]:
    skills = s.config.get("skills") if isinstance(s.config.get("skills"), dict) else {}
    off = skills.get("disabled") or []
    return {str(x).strip().lower() for x in off} if isinstance(off, list) else set()


def _plan_source(s: Source, *, include_secrets: bool, conflict: str, have: dict, taken: set[str],
                 skills_root: Path | None, org_id: str) -> list[Item]:
    name = SOURCES[s.kind]
    items: list[Item] = []
    ws = s.workspace if s.kind == "openclaw" else s.root

    def text_of(p: Path) -> str | None:
        try:
            return _read(p)
        except Refused as exc:
            items.append(Item(s.kind, "memory", p.name, _rel(s, p), "skip", why=f"{exc}, so it was left."))
            return None

    def add(kind: str, title: str, origin: str, text: str, home: str, group: str = "", why: str = "") -> None:
        h = digest(text)
        if h in have:
            items.append(Item(s.kind, kind, title, origin, "skip", to=have[h],
                              why="The same words came earlier in this import." if have[h] == "this import"
                              else "Its words are already in Rouh, so it was not added again."))
            return
        have[h] = "this import"
        to = {"rule": f"a rule in {_group_name(group)}", "note": "a note in Synapse Master"}[home]
        items.append(Item(s.kind, kind, title, origin, "add", to=to, why=why, text=text, group=group, home=home))

    # Persona: SOUL.md, and for OpenClaw the vibe and creature of IDENTITY.md.
    ident: dict = {}
    if ws is not None and (ws / "IDENTITY.md").is_file():
        ident = identity(text_of(ws / "IDENTITY.md") or "")
        if ident.get("name"):
            items.append(Item(s.kind, "persona", f"Name: {ident['name']}", _rel(s, ws / "IDENTITY.md"),
                              "not_mapped", why="Rouh keeps its own name; where the persona says "
                                                f"{ident['name']}, it is written as Rouh."))
        for k in ("emoji", "avatar"):
            if ident.get(k):
                items.append(Item(s.kind, "persona", f"{k.title()}: {ident[k]}", _rel(s, ws / "IDENTITY.md"),
                                  "not_mapped", why="Rouh's look is its orb, so this is not used."))
    soul = s.root / "SOUL.md" if s.kind == "hermes" else (ws / "SOUL.md" if ws else None)
    if soul is not None and soul.is_file():
        words = clean(text_of(soul) or "")
        lead = []
        if ident.get("creature"):
            lead.append(f"What you are: {ident['creature']}.")
        if ident.get("vibe"):
            lead.append(f"Your vibe: {ident['vibe']}.")
        if lead:
            words = "\n".join(lead) + ("\n\n" + words if words else "")
        names = [ident.get("name", "")] + (["Hermes Agent", "Hermes"] if s.kind == "hermes" else [])
        words = as_rouh(words, names)
        if _has_words(words):
            add("persona", f"Persona, from {name}", _rel(s, soul), words, "rule", "voice",
                why="Its character and voice, followed in every conversation.")
        else:
            items.append(Item(s.kind, "persona", "SOUL.md", _rel(s, soul), "skip",
                              why="It is the empty template, with nothing written in it."))

    # About the person.
    user = s.root / "memories" / "USER.md" if s.kind == "hermes" else (ws / "USER.md" if ws else None)
    if user is not None and user.is_file():
        text = text_of(user) or ""
        parts = entries(text) if s.kind == "hermes" else ([("About you", clean(text))] if _has_words(clean(text)) else [])
        for title, words in parts:
            add("about_you", f"About you, from {name}: {title}" if s.kind == "hermes" else f"About you, from {name}",
                _rel(s, user), words, "rule", "you", why="What it knew about you, told in every conversation.")
        if not parts:
            items.append(Item(s.kind, "about_you", "USER.md", _rel(s, user), "skip",
                              why="It is the empty template, with nothing written in it."))

    # Memory.
    if s.kind == "hermes":
        mem = [s.root / "memories" / "MEMORY.md"]
    else:
        mem = [ws / n for n in ("MEMORY.md", "memory.md")] if ws else []
    for m in mem:
        if m.is_file():
            for title, words in entries(text_of(m) or ""):
                add("memory", f"{name} memory: {title}", _rel(s, m), words, "note")
            break
    if s.kind == "openclaw" and ws is not None and (ws / "memory").is_dir():
        for day in sorted((ws / "memory").glob("*.md")):
            words = clean(text_of(day) or "")
            if _has_words(words):
                add("daily", f"{name} memory, {day.stem}", _rel(s, day), f"{name} memory, {day.stem}\n\n{words}",
                    "note")

    # Instructions: kept to be found, never followed every turn.
    for n, why in (("AGENTS.md", "How it was told to work. Kept as a note to be found when it matters; much of "
                                 "it is about the old assistant's own files. Ask Rouh to make any part of it a rule."),
                   ("TOOLS.md", "Its notes on your tools and devices, kept as a note to be found when needed."),
                   ("HEARTBEAT.md", "What it checked on a timer. Kept as a note; ask Rouh to schedule any of it.")):
        p = (ws / n) if ws is not None else None
        if p is not None and p.is_file():
            words = clean(text_of(p) or "")
            if _has_words(words):
                add("instructions", f"{name} {n}", _rel(s, p), f"{name} {n}\n\n{words}", "note", why=why)
    if ws is not None and (ws / "BOOTSTRAP.md").is_file():
        items.append(Item(s.kind, "instructions", "BOOTSTRAP.md", _rel(s, ws / "BOOTSTRAP.md"), "not_mapped",
                          why="Its first-run script; Rouh has its own first run."))

    # Skills.
    bundled = _hermes_bundled(s) if s.kind == "hermes" else set()
    disabled = _hermes_disabled(s) if s.kind == "hermes" else set()
    n_bundled = 0
    for folder, category in _skill_folders(s):
        try:
            body = _read(folder / "SKILL.md")
        except Refused:
            body = ""
        sname = _skill_name(folder, body)
        origin = _rel(s, folder)
        if folder.name.lower() in bundled or sname in bundled:
            n_bundled += 1
            continue
        if folder.name.lower() in disabled or sname in disabled:
            items.append(Item(s.kind, "skill", sname, origin, "skip", why=f"It is switched off in {name}."))
            continue
        files, total = _size(folder)
        if files > SKILL_FILES_MOST or total > SKILL_MOST:
            items.append(Item(s.kind, "skill", sname, origin, "skip",
                              why="It is bigger than 20 MB or 2,000 files, so it was left."))
            continue
        if skills_root is None:
            items.append(Item(s.kind, "skill", sname, origin, "not_mapped",
                              why="This Rouh has no workspace, which is where its skills are kept."))
            continue
        dest = sname
        if dest in taken and category:
            dest = f"{category}-{sname}"[:60]
        if dest in taken or (skills_root / dest).exists():
            if conflict != "rename":
                items.append(Item(s.kind, "skill", sname, origin, "skip", to=f"{SKILLS_DIR}/{dest}",
                                  why="A skill of that name is already in Rouh, so it was left as it is."))
                continue
            base, i = f"{dest}-imported", 2
            dest = base
            while dest in taken or (skills_root / dest).exists():
                dest, i = f"{base}-{i}", i + 1
        taken.add(dest)
        items.append(Item(s.kind, "skill", sname, origin, "add", to=f"{SKILLS_DIR}/{dest}",
                          why=f"{files} file{'s' if files != 1 else ''}, for every job Rouh starts.",
                          home="skill", folder=str(folder), dest=dest))
    if n_bundled:
        items.append(Item(s.kind, "skill", f"{n_bundled} of {name}'s own skills", _rel(s, s.root / "skills"), "skip",
                          why=f"They came with {name} and are about its own tools, so they were left."))

    items += _plan_keys(s, include_secrets, org_id)
    items += _plan_settings(s)
    return items


def _group_name(key: str) -> str:
    from . import rule_groups

    return next((n for k, n, _s, _w in rule_groups.GROUPS if k == key), key)


def _env_file(p: Path) -> dict:
    got = {}
    try:
        text = _read(p)
    except Refused:
        return got
    for ln in text.split("\n"):
        m = re.match(r"^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$", ln)
        if m:
            got[m.group(1)] = m.group(2).strip().strip("'\"")
    return got


def _plan_keys(s: Source, include: bool, org_id: str) -> list[Item]:
    name = SOURCES[s.kind]
    files = [s.root / ".env"]
    if s.kind == "openclaw":
        files += sorted((s.root / "agents").glob("*/agent/auth-profiles.json")) if (s.root / "agents").is_dir() else []
        files += [s.root / "credentials"] if (s.root / "credentials").is_dir() else []
    files = [f for f in files if f.exists()]
    keyish = s.kind == "openclaw" and "apiKey" in json.dumps(s.config)
    if not include:
        if files or keyish:
            return [Item(s.kind, "key", "API keys and tokens", ", ".join(_rel(s, f) for f in files) or s.config_said,
                         "skip", why="Secrets are not imported unless you ask for them, so none of these files was "
                                     "opened.")]
        return []
    found: dict[str, str] = {}
    env = _env_file(s.root / ".env")
    came = {var: f"{s.shown}/.env" for var in env}
    if s.kind == "openclaw":
        cfg_env = s.config.get("env") if isinstance(s.config.get("env"), dict) else {}
        cfg_env = cfg_env.get("vars") if isinstance(cfg_env.get("vars"), dict) else cfg_env
        from_cfg = {k: str(v) for k, v in cfg_env.items() if isinstance(v, str)}
        came = {**{k: f"{s.shown}/{s.config_said}" for k in from_cfg}, **came}
        env = {**from_cfg, **env}
        providers = ((s.config.get("models") or {}).get("providers") or {}) if isinstance(s.config.get("models"), dict) else {}
        for pname, conf in (providers.items() if isinstance(providers, dict) else []):
            key = conf.get("apiKey") if isinstance(conf, dict) else None
            var = {"google": "GEMINI_API_KEY", "gemini": "GEMINI_API_KEY", "xai": "XAI_API_KEY",
                   "anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}.get(str(pname).lower(), "")
            if var and isinstance(key, str) and key and not key.startswith("${") and var not in env:
                env[var] = key
                came[var] = f"{s.shown}/{s.config_said}"
    items: list[Item] = []
    from . import providerkeys

    for var, value in env.items():
        if not value or value.startswith("${"):
            continue
        if var in KEY_NAMES:
            prov = KEY_NAMES[var]
            if found.get(prov):
                continue
            found[prov] = value
            label = "Google (Gemini)" if prov == "google" else "xAI"
            if providerkeys.has(prov, org_id):
                items.append(Item(s.kind, "key", f"{label} key", came.get(var, f"{s.shown}/.env"), "skip",
                                  why="Rouh already has a key for it, so the one there was left."))
            else:
                items.append(Item(s.kind, "key", f"{label} key, ending {value[-4:]}", came.get(var, f"{s.shown}/.env"), "add",
                                  to="Models page keys", home="key", provider=prov, secret=value))
        elif var in OWN_KEYS:
            items.append(Item(s.kind, "key", f"{OWN_KEYS[var]} key", came.get(var, f"{s.shown}/.env"), "not_mapped",
                              why=f"Rouh's own {OWN_KEYS[var]} key is set on the Models page, so it was not taken."))
    others = sorted(v for v, val in env.items() if val and v not in KEY_NAMES and v not in OWN_KEYS
                    and re.search(r"KEY|TOKEN|SECRET|PASSWORD", v))
    if others:
        items.append(Item(s.kind, "key", ", ".join(others[:8]) + (" and more" if len(others) > 8 else ""),
                          f"{s.shown}/.env", "not_mapped",
                          why=f"Keys for {name}'s own services; Rouh connects its own in Settings."))
    return items


def _plan_settings(s: Source) -> list[Item]:
    """What is in the config and its folders that Rouh keeps elsewhere, said and never taken."""
    c, name, out = s.config, SOURCES[s.kind], []

    def tell(title: str, why: str, origin: str = "") -> None:
        out.append(Item(s.kind, "setting", title, origin or f"{s.shown}/{s.config_said}", "not_mapped", why=why))

    if s.kind == "openclaw":
        defaults = ((c.get("agents") or {}).get("defaults") or {}) if isinstance(c.get("agents"), dict) else {}
        if defaults.get("model"):
            tell("Its model", "Which model answers is set on Rouh's Models page.")
        if isinstance(c.get("channels"), dict) and c["channels"]:
            tell("Chat channels: " + ", ".join(sorted(c["channels"])[:8]),
                 "Rouh connects its own Telegram and Slack in Settings; the old bots were not moved.")
        mcp = (c.get("mcp") or {}).get("servers") if isinstance(c.get("mcp"), dict) else None
        if mcp:
            tell(f"{len(mcp)} MCP server{'s' if len(mcp) != 1 else ''}", "Rouh's MCP servers are added on its MCP page.")
        if (s.root / "cron").is_dir():
            tell("Scheduled jobs", "Ask Rouh to schedule what you want on Clockwork.", f"{s.shown}/cron")
        if (s.root / "agents").is_dir() and any((s.root / "agents").glob("*/sessions")):
            out.append(Item(s.kind, "history", "Conversation history", f"{s.shown}/agents", "not_mapped",
                            why="Old conversations are not imported; what mattered in them is in its memory."))
        others = sorted(p.name for p in s.root.glob("workspace-*") if p.is_dir() and p != s.workspace)
        if others:
            out.append(Item(s.kind, "persona", "Other agents: " + ", ".join(others), s.shown, "not_mapped",
                            why="Only the main agent is imported; give the path of another to import it."))
    else:
        if c.get("model"):
            tell("Its model", "Which model answers is set on Rouh's Models page.")
        plats = c.get("platforms") or c.get("gateway") or {}
        if isinstance(plats, dict) and plats:
            tell("Chat platforms: " + ", ".join(sorted(plats)[:8]),
                 "Rouh connects its own Telegram and Slack in Settings; the old bots were not moved.")
        if isinstance(c.get("mcp_servers"), dict) and c["mcp_servers"]:
            n = len(c["mcp_servers"])
            tell(f"{n} MCP server{'s' if n != 1 else ''}", "Rouh's MCP servers are added on its MCP page.")
        if (s.root / "cron").is_dir():
            tell("Scheduled jobs", "Ask Rouh to schedule what you want on Clockwork.", f"{s.shown}/cron")
        if (s.root / "sessions").is_dir() or (s.root / "state.db").is_file():
            out.append(Item(s.kind, "history", "Conversation history", f"{s.shown}/sessions", "not_mapped",
                            why="Old conversations are not imported; what mattered in them is in its memory."))
    return out


def _have(ds: dict) -> dict:
    """What Rouh already holds, by the digest of its words: every rule, and every note an import made."""
    from .synapse import db

    got = {}
    for r in db.rows("SELECT kind, raw, meta->'imported'->>'hash' AS h FROM synapse.item WHERE dataset_id = %s "
                     "AND deleted_at IS NULL AND (kind = 'rule' OR (kind = 'note' AND meta ? 'imported'))",
                     (ds["id"],)):
        where = "a rule" if r["kind"] == "rule" else "a note"
        got[digest(r["raw"] or "")] = where
        if r.get("h"):
            got[r["h"]] = where
    return got


def _have_notes(ds: dict, items: list[Item]) -> None:
    """A note to add whose words are already a note in Master, kept by anything, is skipped too."""
    from .synapse import db

    wanted = {hashlib.md5(i.text.encode("utf-8")).hexdigest(): i for i in items if i.action == "add" and i.home == "note"}
    if not wanted:
        return
    for r in db.rows("SELECT md5(raw) AS m FROM synapse.item WHERE dataset_id = %s AND deleted_at IS NULL "
                     "AND kind = 'note' AND md5(raw) = ANY(%s)", (ds["id"], list(wanted))):
        i = wanted[r["m"]]
        i.action, i.to, i.why = "skip", "a note", "Its words are already in Rouh, so it was not added again."


def skills_root() -> Path | None:
    from .config import config

    root = getattr(config, "assistant_repo", "") or ""
    return Path(root) / SKILLS_DIR if root and os.path.isdir(root) else None


def plan(ds: dict, sources: list[Source], *, include_secrets: bool = False, conflict: str = "skip") -> list[Item]:
    """What an import of these would do, read and changed nothing."""
    if conflict not in CONFLICTS:
        raise Refused("A skill whose name is taken is either skipped or renamed: say skip or rename.")
    have, taken = _have(ds), set()
    root = skills_root()
    items: list[Item] = []
    for s in sources:
        items += _plan_source(s, include_secrets=include_secrets, conflict=conflict, have=have, taken=taken,
                              skills_root=root, org_id=str(ds.get("org_id") or ""))
    _have_notes(ds, items)
    return items


# --- doing it, and undoing it -----------------------------------------------------------------


def _key(org_id: str, user_id: str, ident: str = "") -> str:
    return f"{PREFIX}{org_id}:{user_id}:{ident}"


def _save(ds: dict, record: dict) -> None:
    from .models.memory import AppState

    AppState.objects.update_or_create(key=_key(ds["org_id"], ds["user_id"], record["id"]),
                                      defaults={"value": json.dumps(record, ensure_ascii=False)})


def records(ds: dict) -> list[dict]:
    """This person's imports, newest first."""
    from .models.memory import AppState

    got = []
    for row in AppState.objects.filter(key__startswith=_key(ds["org_id"], ds["user_id"])):
        try:
            got.append(json.loads(row.value))
        except ValueError:
            continue
    return sorted(got, key=lambda r: r.get("at") or 0, reverse=True)


def record(ds: dict, ident: str) -> dict | None:
    from .models.memory import AppState

    row = AppState.objects.filter(key=_key(ds["org_id"], ds["user_id"], str(ident).strip())).first()
    return json.loads(row.value) if row else None


def _copy_skill(src: Path, dest: Path) -> None:
    def leave(folder, names):
        return [n for n in names if SKILL_LEAVE.match(n) or os.path.islink(os.path.join(folder, n))]

    shutil.copytree(src, dest, symlinks=False, ignore=leave)


def apply(ds: dict, sources: list[Source], items: list[Item], *, by: str = "import") -> dict:
    """Do what the plan says, and keep what was made, for its undo."""
    from . import rules, saving
    from .synapse import db, ingest
    from .synapse.db import Json

    ident = time.strftime("%Y%m%d-%H%M") + "-" + uuid.uuid4().hex[:4]
    when = time.strftime("%d %B %Y").lstrip("0")
    rec = {"id": ident, "at": time.time(), "by": by, "sources": [{"kind": s.kind, "from": s.shown} for s in sources],
           "made": [], "skills": [], "keys": [], "failed": [], "undone": None}
    me = rules._me(ds)
    root = skills_root()
    for it in items:
        if it.action != "add":
            continue
        name = SOURCES[it.source]
        mark = {"from": it.source, "origin": it.origin, "hash": digest(it.text) if it.text else "", "import": ident}
        try:
            if it.home == "rule":
                made = rules.add_rule(ds, it.text, [], by=f"{by}: from {name}", group=it.group, title=it.title,
                                      origin=rules.origin_of("manual", f"Imported by you from {name} "
                                                                       f"({it.origin}) on {when}."),
                                      more={"imported": mark})
                rec["made"].append({"kind": "rule", "id": str(made["id"]), "title": it.title})
            elif it.home == "note":
                got = ingest.store(ds, {"kind": "note", "title": it.title, "text": it.text, "source": rules.NOTE_SOURCE,
                                        "source_key": f"import:{ident}:{mark['hash'][:16]}", "readers": [me],
                                        "owner": me}, by=f"{by}: from {name}", lane="backfill")
                if not got.get("ok"):
                    raise Refused(got.get("why") or "it could not be kept")
                db.run("UPDATE synapse.item SET meta = meta || %s::jsonb WHERE id = %s::uuid",
                       (Json({"imported": mark}), str(got["item"])))
                rec["made"].append({"kind": "note", "id": str(got["item"]), "title": it.title})
            elif it.home == "skill" and root is not None:
                dest = root / it.dest
                if dest.exists():
                    raise Refused("a skill of that name appeared meanwhile")
                root.mkdir(parents=True, exist_ok=True)
                _copy_skill(Path(it.folder), dest)
                rec["skills"].append({"name": it.dest, "path": f"{SKILLS_DIR}/{it.dest}"})
            elif it.home == "key":
                from . import providerkeys

                providerkeys.save(ds["org_id"], it.provider, it.secret, by=f"{by}: from {name}")
                rec["keys"].append({"provider": it.provider, "last4": it.secret[-4:]})
            it.action = "added"
        except Exception as exc:  # noqa: BLE001 - one thing that fails is said, and the rest still go in
            log.warning("import %s: %s %s failed: %s", ident, it.kind, it.title, exc)
            it.action, it.why = "failed", f"It could not be added: {exc}"
            rec["failed"].append({"kind": it.kind, "title": it.title, "why": str(exc)[:300]})
        _save(ds, rec)
    if rec["skills"]:
        saving.touched(*(s["path"] for s in rec["skills"]))
    _save(ds, rec)
    log.info("import %s from %s: %d made, %d skills, %d keys", ident, [s.kind for s in sources], len(rec["made"]),
             len(rec["skills"]), len(rec["keys"]))
    return rec


def undo(ds: dict, ident: str, *, by: str = "import undo") -> dict:
    """Take away exactly what one import added: its rules and notes, its skills and its keys."""
    from . import providerkeys, saving
    from .synapse import db, ingest

    rec = record(ds, ident)
    if rec is None:
        raise Refused(f"There is no import {ident}. {listing_text(ds)}")
    if rec.get("undone"):
        raise Refused(f"Import {ident} was already undone.")
    gone = {"rules": 0, "notes": 0, "skills": 0, "keys": 0, "kept": []}
    for m in rec.get("made") or []:
        alive = db.value("SELECT 1 FROM synapse.item WHERE dataset_id = %s AND id = %s::uuid AND deleted_at IS NULL",
                         (ds["id"], m["id"]))
        if alive and ingest.delete(ds, m["id"], by=by, scrub=False).get("ok"):
            gone["rules" if m["kind"] == "rule" else "notes"] += 1
    root = skills_root()
    for sk in rec.get("skills") or []:
        p = (root / sk["name"]) if root is not None else None
        if p is not None and p.is_dir() and p.parent == root:
            shutil.rmtree(p)
            gone["skills"] += 1
    if gone["skills"]:
        saving.touched(*(sk["path"] for sk in rec["skills"]))
    for k in rec.get("keys") or []:
        if providerkeys.key(k["provider"], ds["org_id"]).endswith(k["last4"]):
            providerkeys.save(ds["org_id"], k["provider"], "", by=by)
            gone["keys"] += 1
        else:
            gone["kept"].append(f"the {k['provider']} key, changed since")
    rec["undone"] = {"at": time.time(), "by": by, **gone}
    _save(ds, rec)
    return rec


# --- in words ---------------------------------------------------------------------------------


def _line(it: Item) -> str:
    to = f" -> {it.to}" if it.to and it.action in ("add", "added") else ""
    why = f" ({it.why})" if it.why else ""
    return f"- {KINDS.get(it.kind, it.kind)}: {it.title}{to}{why}  [{it.origin}]"


def report(sources: list[Source], items: list[Item], *, applied: dict | None = None) -> str:
    """The plan, or what was done, as plain lines a person reads."""
    froms = "; ".join(f"{SOURCES[s.kind]} at {s.shown}" for s in sources)
    adding = [i for i in items if i.action in ("add", "added")]
    failed = [i for i in items if i.action == "failed"]
    skipped = [i for i in items if i.action == "skip"]
    unmapped = [i for i in items if i.action == "not_mapped"]
    counts = {}
    for i in adding:
        counts[i.home] = counts.get(i.home, 0) + 1
    said = ", ".join(f"{n} {w}{'s' if n != 1 else ''}" for w, n in
                     (("rule", counts.get("rule", 0)), ("note", counts.get("note", 0)),
                      ("skill", counts.get("skill", 0)), ("key", counts.get("key", 0))) if n) or "nothing"
    out = [f"Found {froms}."]
    if applied is None:
        out.append(f"A preview, nothing changed yet: an import would add {said}.")
    else:
        out.append(f"Imported {said}, as import {applied['id']}. Nothing that was there was changed.")
    if adding:
        out += ["", "Added:" if applied else "Would add:"] + [_line(i) for i in adding]
    if failed:
        out += ["", "Could not be added:"] + [_line(i) for i in failed]
    if skipped:
        out += ["", "Skipped:"] + [_line(i) for i in skipped]
    if unmapped:
        out += ["", "Not imported, because Rouh keeps these its own way:"] + [_line(i) for i in unmapped]
    if applied is not None:
        out += ["", f"To undo it: python manage.py import_agent --undo {applied['id']}, or ask Rouh to undo "
                    f"import {applied['id']}."]
    return "\n".join(out)


def undo_text(rec: dict) -> str:
    u = rec.get("undone") or {}
    parts = [f"{u.get(k, 0)} {k[:-1] if u.get(k, 0) == 1 else k}" for k in ("rules", "notes", "skills", "keys")]
    kept = f" Left as it was: {', '.join(u['kept'])}." if u.get("kept") else ""
    return f"Import {rec['id']} is undone: took away {', '.join(parts)}.{kept}"


def listing_text(ds: dict) -> str:
    got = records(ds)
    if not got:
        return "Nothing has been imported yet."
    lines = ["Imports, newest first:"]
    for r in got[:20]:
        froms = ", ".join(f"{SOURCES.get(s['kind'], s['kind'])} ({s['from']})" for s in r.get("sources") or [])
        n, k = len(r.get("made") or []), len(r.get("skills") or [])
        made = f"{n} rule{'s' if n != 1 else ''} and note{'s' if n != 1 else ''}, {k} skill{'s' if k != 1 else ''}"
        state = " - undone" if r.get("undone") else ""
        lines.append(f"- {r['id']}: {froms}, {made}{state}")
    return "\n".join(lines)


# --- the one entry, for the command and the conversation ---------------------------------------


def run(ds: dict, *, source: str = "auto", path: str = "", do: bool = False, include_secrets: bool = False,
        conflict: str = "skip", by: str = "import") -> dict:
    """Find, plan and, when `do`, import. Returns {"text", "items", "import"}."""
    if ds is None:
        raise Refused("There is no memory to import into yet.")
    scratch = Path(tempfile.mkdtemp(prefix="rouh-import-"))
    try:
        sources = locate(source, path, scratch=scratch)
        items = plan(ds, sources, include_secrets=include_secrets, conflict=conflict)
        rec = apply(ds, sources, items, by=by) if do else None
        return {"text": report(sources, items, applied=rec), "items": [i.shown() for i in items],
                "import": rec["id"] if rec else ""}
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


TOOL_NAME = "import_agent"
DESCRIPTION = (
    "Import the person's existing OpenClaw or Hermes Agent setup into Rouh in one go: its persona (SOUL.md) as a "
    "rule, what it knew about them (USER.md) as About you rules, its memory (MEMORY.md, daily memory) as notes, "
    "and its skills into the workspace's skills. It finds the usual install (~/.openclaw, ~/.hermes) by itself, or "
    "reads `path`: a folder, or a .zip or .tar.gz of one, such as a file sent in this chat (its saved-at path). "
    "Nothing there is overwritten, words already in Rouh are skipped, and every import can be undone. "
    "When the person asks to import, call it with apply true; it can be undone, so do not ask first. Call it "
    "without apply only when they want to see what would come in. Set include_secrets only when they asked for "
    "their API keys too. Give back what it says: what was added, skipped and not imported. To undo one, give "
    "undo with its import id; list shows the imports.")
SCHEMA = {
    "type": "object",
    "properties": {
        "source": {"type": "string", "enum": ["auto", "openclaw", "hermes"],
                   "description": "Which to import; auto finds whichever is there."},
        "path": {"type": "string", "description": "A folder or archive to read instead of the usual install."},
        "apply": {"type": "boolean", "description": "true imports; false (the default) only previews."},
        "include_secrets": {"type": "boolean", "description": "Also take API keys; only when the person asked."},
        "skill_conflict": {"type": "string", "enum": ["skip", "rename"],
                           "description": "A skill whose name is taken: left (skip) or added as -imported."},
        "undo": {"type": "string", "description": "An import's id, to take away exactly what it added."},
        "list": {"type": "boolean", "description": "true lists the imports done so far."},
    },
}


def tool(args: dict, ds: dict | None, *, by: str = "Rouh, asked in a conversation") -> str:
    """The conversation's tool: preview, import, list or undo, answered in words."""
    if ds is None:
        return "There is no memory to import into yet."
    try:
        if args.get("list"):
            return listing_text(ds)
        if str(args.get("undo") or "").strip():
            return undo_text(undo(ds, str(args["undo"]).strip(), by=by))
        got = run(ds, source=str(args.get("source") or "auto"), path=str(args.get("path") or "").strip(),
                  do=bool(args.get("apply")), include_secrets=bool(args.get("include_secrets")),
                  conflict=str(args.get("skill_conflict") or "skip"), by=by)
        return got["text"]
    except Refused as exc:
        return f"Nothing was imported: {exc}"
