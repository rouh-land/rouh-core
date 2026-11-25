"""What a run saw while it proved its change: its pictures, and the screens its design check covered.

Night 54 of Rouh's nightly feature run (25 November 2026), for two of Rouh's genes, `run_pictures`
and `run_screens` (`rouh/build_proof.py`). A run of Rouh's code proves its change in a test world:
it takes screenshots over Playwright MCP, and its design record (`tools/design/record.py screens`,
`.design/record.json`) names every address it checked. Both lived in the run's checkout, which goes
when the run ends with its work saved (`Runs._tidy_once`), so the person could only read the run's
sentence about what it saw.

Now, as the checkout is tidied, `keep` copies them into the run's own folder beside its terminal log
(`Terminals.folder`), and `read` gives them to Rouh's page with the ``proof`` message, from that
folder or, while the run is still going or its checkout is kept, from the checkout itself.

What counts as a picture: an image file the repository does not track (a screenshot, never one of
the code's own images), written after the run started, outside the folders that are never a run's
own (`SKIP`). The newest `MOST` of them, each at most `BYTES`.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger("one.proof")

#: The pictures kept and given, at most, newest first; and how big each may be.
MOST = 12
BYTES = 3_000_000
#: The image kinds a screenshot is.
KINDS = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}
#: Folders never looked in: the repository's own, the environments, the libraries.
SKIP = {".git", "node_modules", "__pycache__", ".venv", ".venv-e2e", ".mypy_cache", ".pytest_cache",
        "baselines", "static", "mmroot", "pg", "site-packages"}
#: How deep a picture may be in the checkout.
DEPTH = 7
#: The folder in the run's own folder that holds what was kept.
KEPT = "proof"


def _tracked(cwd: str) -> set[str]:
    try:
        out = subprocess.run(["git", "-C", cwd, "ls-files", "-z"], capture_output=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return set()
    return {p for p in out.decode("utf-8", "replace").split("\0") if p}


def pictures(cwd: str, since: float = 0.0) -> list[Path]:
    """The run's own pictures in its checkout, newest first, at most `MOST`."""
    root = Path(cwd)
    if not cwd or not root.is_dir():
        return []
    tracked = _tracked(cwd)
    found: list[tuple[float, Path]] = []
    base = len(root.parts)
    for here, dirs, files in os.walk(root, followlinks=False):
        depth = len(Path(here).parts) - base
        dirs[:] = [d for d in dirs if d not in SKIP and depth < DEPTH
                   and not os.path.islink(os.path.join(here, d))]
        for name in files:
            if Path(name).suffix.lower() not in KINDS:
                continue
            p = Path(here) / name
            try:
                st = p.lstat()
            except OSError:
                continue
            if not p.is_file() or p.is_symlink() or st.st_size <= 0 or st.st_size > BYTES or st.st_mtime < since:
                continue
            if str(p.relative_to(root)) in tracked:
                continue
            found.append((st.st_mtime, p))
    found.sort(key=lambda t: -t[0])
    return [p for _, p in found[:MOST]]


def screens(cwd: str) -> list[str]:
    """The addresses the run's design check covered (`.design/record.json`, `screens.pages`), as
    paths of Rouh's own: the test world's address taken off."""
    try:
        rec = json.loads((Path(cwd) / ".design" / "record.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    pages = ((rec or {}).get("screens") or {}).get("pages") or {}
    out = []
    for path in pages:
        path = str(path or "").strip()
        if path.startswith("/") and not path.startswith("//") and path not in out and len(path) < 300:
            out.append(path)
    return out[:20]


def keep(cwd: str, into: Path, since: float = 0.0) -> int:
    """Copy the run's pictures and the screens it checked into `into`, before its checkout goes.
    How many pictures were kept; never raises."""
    try:
        got = pictures(cwd, since)
        seen = screens(cwd)
        if not got and not seen:
            return 0
        into.mkdir(parents=True, exist_ok=True)
        for i, p in enumerate(got):
            shutil.copy2(p, into / f"{i:02d}-{p.name}")
        (into / "screens.json").write_text(json.dumps(seen), encoding="utf-8")
        return len(got)
    except OSError as exc:
        log.warning("could not keep what the run saw from %s: %s", cwd, exc)
        return 0


def read(cwd: str | None, kept: Path, since: float = 0.0) -> dict:
    """``{"pictures": [{name, type, data}], "screens": [...]}``: from the checkout while it is
    there, else from what `keep` kept."""
    if cwd and Path(cwd).is_dir():
        files, seen = pictures(cwd, since), screens(cwd)
    else:
        files = sorted((p for p in kept.glob("*") if p.suffix.lower() in KINDS), key=lambda p: p.name) \
            if kept.is_dir() else []
        try:
            seen = json.loads((kept / "screens.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            seen = []
    out = []
    for p in files[:MOST]:
        try:
            data = p.read_bytes()
        except OSError:
            continue
        if len(data) > BYTES:
            continue
        name = p.name[3:] if p.parent == kept and p.name[:2].isdigit() and p.name[2:3] == "-" else p.name
        out.append({"name": name, "type": KINDS[p.suffix.lower()], "data": base64.b64encode(data).decode("ascii")})
    return {"pictures": out, "screens": [s for s in seen if isinstance(s, str)]}
