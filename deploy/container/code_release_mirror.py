#!/usr/bin/env python3
"""Each signed release of Rouh's code, mirrored to rouh-core's GitHub Releases and CHANGELOG.md (task 98, G10 and G21).

Petar, 25 November 2026: "g10 - okay do it" (a number like 1.1.0 on every release, a tagged GitHub
Release, a CHANGELOG.md written by itself) and "G21, yes" (each GitHub Release carries the signed
file rouh.land serves, so a Rouh can update from GitHub when rouh.land does not answer).

Run by .github/workflows/code-release.yml in a checkout of main, with GH_TOKEN:

1. rouh.land's /mac/code/release.json, the newest release's signature checked with the keys in
   rouh/code_release_keys.json (mac_release.check_code_release). A release nobody signed (from
   before 26 November 2026) is left alone.
2. If GitHub has no release v<number> yet: the tag v<number> on the release's own commit, which must
   be on main, and the GitHub Release "Rouh <number>", its notes the release's own lines, carrying
   code-release.json, the very file rouh.land served. It is never marked GitHub's latest: that stays
   the newest base release, whose release.json a Linux machine reads when rouh.land does not answer.
3. CHANGELOG.md gets a section for every signed release in that file that it does not have yet,
   newest first, and pyproject.toml's version becomes the number (when it is higher): one commit
   on main, "Changelog: Rouh <number>".

    code_release_mirror.py [--dry-run]     --dry-run says what it would do and changes nothing

Standard library, git, gh and openssl.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import mac_release  # noqa: E402

REPO = HERE.parents[1]
CHANGELOG = REPO / "CHANGELOG.md"
HEAD = """# Changelog

Every release of Rouh's code, newest first, written by itself from each signed release
(`deploy/container/code_release_mirror.py`). The last part of a number goes up for an ordinary
release, the middle one for a release that changes the database or an installation's settings.
Each release is also a GitHub Release, tagged `v<number>`, carrying `code-release.json`: the signed
file rouh.land serves at /mac/code/release.json, which a Rouh checks before it takes it.
"""
GENE = "code-updates"


def sh(*args: str, check: bool = True, cwd: Path = REPO) -> subprocess.CompletedProcess:
    r = subprocess.run(list(args), cwd=str(cwd), capture_output=True, text=True)
    if check and r.returncode:
        raise SystemExit(f"{' '.join(args[:3])} failed: {(r.stderr or r.stdout).strip()[-600:]}")
    return r


def day(iso: str) -> str:
    try:
        when = dt.datetime.strptime(str(iso), "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return ""
    return f"{when.day} {when:%B %Y}"


def section(r: dict, released_at: str = "") -> str:
    when = day(released_at or r.get("signed_at") or "")
    lines = [f"## Rouh {r['number']}" + (f" - {when}" if when else ""), ""]
    said = [f"Commit `{r['commit'][:12]}`."]
    if r.get("database"):
        said.append("Changes the database: a Rouh saves a copy of it first.")
    if r.get("settings"):
        said.append("Changes an installation's settings.")
    lines += [" ".join(said), ""]
    lines += [f"- {n}" for n in r.get("notes") or []] or ["- Small fixes"]
    return "\n".join(lines) + "\n"


def signed_rows(doc: dict) -> list[tuple[dict, str]]:
    """Every row of release.json whose signature checks: (the signed payload, when rouh.land released it),
    oldest first."""
    out, seen = [], set()
    for row in [doc, *(doc.get("recent") or [])]:
        if not isinstance(row, dict) or not row.get("signed"):
            continue
        try:
            r = mac_release.check_code_release(row["signed"])
        except ValueError as e:
            print(f"skipped a row that does not check ({e})")
            continue
        if r["number"] not in seen:
            seen.add(r["number"])
            out.append((r, str(row.get("released_at") or "")))
    return sorted(out, key=lambda x: tuple(int(p) for p in x[0]["number"].split(".")))


def changelog(rows: list[tuple[dict, str]]) -> tuple[str, list[str]]:
    """CHANGELOG.md with a section for each row it does not have, and the numbers added."""
    text = CHANGELOG.read_text() if CHANGELOG.exists() else HEAD
    body = text[len(HEAD):] if text.startswith(HEAD) else text
    added = []
    for r, at in rows:
        if re.search(rf"^## Rouh {re.escape(r['number'])}\b", body, re.M):
            continue
        rest = body.lstrip("\n")
        body = "\n" + section(r, at) + ("\n" + rest if rest.strip() else "")
        added.append(r["number"])
    return HEAD + body, added


def bump_version(number: str) -> bool:
    """pyproject.toml's and uv.lock's version of Rouh to `number`, when it is higher. Whether it changed."""
    key = lambda v: tuple(int(p) for p in v.split("."))  # noqa: E731
    py = REPO / "pyproject.toml"
    text = py.read_text()
    m = re.search(r'^version = "([^"]*)"$', text, re.M)
    if m and re.fullmatch(r"\d+\.\d+\.\d+", m[1]) and key(m[1]) >= key(number):
        return False
    py.write_text(re.sub(r'^version = "[^"]*"$', f'version = "{number}"', text, count=1, flags=re.M))
    lock = REPO / "uv.lock"
    if lock.exists():
        lock.write_text(re.sub(r'(\nname = "rouh"\nversion = )"[^"]*"', rf'\1"{number}"', lock.read_text(), count=1))
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--release-file", help="release.json as rouh.land serves it, instead of asking rouh.land")
    a = ap.parse_args()

    if a.release_file:
        raw = Path(a.release_file).read_bytes()
    else:
        try:
            raw = json.dumps(mac_release._get("/mac/code/release.json")).encode()
        except mac_release.FetchError as e:
            print(f"rouh.land gave no release: {e}; nothing to do")
            return 0
    doc = json.loads(raw)
    if not doc.get("signed"):
        print(f"rouh.land's newest release ({str(doc.get('commit'))[:12]}) is from before releases were signed; nothing to do")
        return 0
    newest = mac_release.check_code_release(doc["signed"])
    if newest["commit"] != doc.get("commit"):
        raise SystemExit("rouh.land's row and its signature name different commits")
    tag = f"v{newest['number']}"
    print(f"rouh.land's newest: Rouh {newest['number']} ({newest['commit'][:12]}), signed by {newest['signed_by']}")

    sh("git", "fetch", "-q", "origin", "main", "--tags")
    if sh("git", "merge-base", "--is-ancestor", newest["commit"], "origin/main", check=False).returncode:
        raise SystemExit(f"{newest['commit'][:12]} is not on rouh-core's main; nothing published")

    have = sh("gh", "release", "view", tag, "--json", "tagName", check=False).returncode == 0
    if have:
        print(f"GitHub already has the release {tag}")
    elif a.dry_run:
        print(f"would publish the GitHub Release {tag} on {newest['commit'][:12]}")
    else:
        with tempfile.TemporaryDirectory() as t:
            asset = Path(t, mac_release.CODE_RELEASE_ASSET)
            asset.write_bytes(raw)
            notes = Path(t, "notes.md")
            notes.write_text(section(newest, str(doc.get("released_at") or ""))
                             + f"\n`{mac_release.CODE_RELEASE_ASSET}` is the signed release as rouh.land serves it "
                             f"(signed by `{newest['signed_by']}`); a Rouh takes it from here when rouh.land does not answer.\n")
            sh("gh", "release", "create", tag, "--target", newest["commit"], "--title", f"Rouh {newest['number']}",
               "--notes-file", str(notes), "--latest=false", str(asset))
        print(f"published the GitHub Release {tag}")

    text, added = changelog(signed_rows(doc))
    if not added:
        print("CHANGELOG.md already has it")
        return 0
    if a.dry_run:
        print(f"would add Rouh {', '.join(added)} to CHANGELOG.md")
        return 0
    for attempt in range(4):
        sh("git", "checkout", "-q", "-B", "changelog", "origin/main")
        text, added = changelog(signed_rows(doc))
        if not added:
            return 0
        CHANGELOG.write_text(text)
        bump_version(newest["number"])
        sh("git", "add", "CHANGELOG.md", "pyproject.toml", "uv.lock")
        # [skip ci]: pushed with the deploy key it would start "Tests on main", which a commit of
        # CHANGELOG.md and the version alone never needed (pushed with GITHUB_TOKEN it started none).
        msg = (f"Changelog: Rouh {newest['number']} [skip ci]\n\nWritten by .github/workflows/code-release.yml from the signed "
               f"release rouh.land serves ({', '.join('Rouh ' + n for n in added)}); pyproject.toml's version is the "
               f"newest release's number.\n\nGene: {GENE}\n")
        sh("git", "-c", "user.name=Rouh releases", "-c", "user.email=releases@rouh.land", "commit", "-q", "-s", "-m", msg)
        # "main-push" is tools/github/main-push-remote.sh's (the deploy key main's rule set lets
        # through); "origin" where that was not run, such as by hand.
        remote = "main-push" if sh("git", "remote", "get-url", "main-push", check=False).returncode == 0 else "origin"
        if sh("git", "push", "-q", remote, "HEAD:refs/heads/main", check=False).returncode == 0:
            print(f"CHANGELOG.md: added Rouh {', '.join(added)} on main")
            return 0
        sh("git", "fetch", "-q", "origin", "main")
    raise SystemExit("main kept moving; CHANGELOG.md is written on the next run")


if __name__ == "__main__":
    sys.exit(main())
