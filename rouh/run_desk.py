"""Four genes for building Rouh faster, around a run of the one program (night 52 of the ledger, 23 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
helps build Rouh faster. A run is opened on the canvas (`app/runs.js`, `oneRenderHead`), and a new
one is started from Metabolism's Start dialog (`#oneStartDialog`). Each gene has its own switch:

- **Its twin, compared** (`run_twin`, shows up by itself). Both agents at once (night 51,
  `run_both`) starts one brief on Claude Code and on Codex, as two runs, and nothing tied them
  together: which did it better was found by opening each in turn. Now the head of each says, in
  one line, how its twin on the other agent stands (working, ended, landed and live or not, how
  many files, how long it took) and which of the two is ahead, with Open it. The twin is the run
  of the other agent with the same brief in the same workspace, asked for within two minutes.
- **Not started twice** (`start_twice`, invisible). Start a run started a second run of a brief
  that was already running in the same workspace, on the same agent, and the two then fought
  over the same files and the same landing. Now Start says which run is already doing it, with
  Open it and Start anyway, and starts nothing until one is pressed.
- **Copy its report** (`run_copy`, you ask for it). Handing what one run did to another run, a
  task's notes or a message meant copying its title, its state, its commit, whether it is live,
  its files and its last words one by one. Now a run's head has Copy report, which puts all of it
  on the clipboard as a few lines of Markdown.
- **Start with the keyboard** (`start_keys`, changes how you work). The Start dialog's brief box
  took Enter as a new line, and a run was started only by reaching for the Start button. Now
  Ctrl+Enter (Cmd+Enter on a Mac) in the brief starts it, the box says so under it, and ? lists
  the key.

The page is told which are on in `#rouhRunDesk` (`for_page`), and each reports its use through
`POST /api/run-desk` (`rouh/web/run_desk.py`). Everything shown is the runs' own records in the
one program, already on the page; no model is asked by Rouh, and nothing is kept on the server.
"""
from __future__ import annotations

#: Each gene's switch, its title, and the events it reports.
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "run_twin": ("Its twin, compared: the same brief's run on the other agent, on a run's head", ("opened", "seen")),
    "start_twice": ("Not started twice: a brief already running in the workspace is not started again",
                    ("opened", "caught")),
    "run_copy": ("Copy its report: a run's title, state, commit, files and last words in one press", ("copied",)),
    "start_keys": ("Start with the keyboard: Ctrl+Enter in the brief starts the run", ("started",)),
}

#: A run's state in words, as its head says it (`ONE_WORDS` in app/runs.js).
WORDS = {"queued": "Queued", "starting": "Starting", "working": "Working", "asking": "Needs you",
         "saving": "Saving its work", "idle": "Finished its turn", "done": "Done", "unfinished": "Unfinished",
         "failed": "Failed", "lost": "Died", "refused": "Refused", "reaped": "Cleaned up"}

#: How close in time two runs of one brief must be asked for to be twins, in seconds.
TWIN_WITHIN = 120


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation, for the page."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def for_page(who) -> dict:
    """What `#rouhRunDesk` tells the page: which are on, and how near in time twins are."""
    return {"on": on_for(who), "twin_within": TWIN_WITHIN}


def twin_of(run: dict, runs: list[dict]) -> dict | None:
    """The run that is `run`'s twin among `runs`: the other agent, the same brief, the same
    workspace, asked for within `TWIN_WITHIN` seconds. The page does the same with the runs it
    holds (`runTwinOf` in app/runs.js); this is the rule written once, for the stack test."""
    import datetime

    def at(r: dict) -> float:
        try:
            return datetime.datetime.fromisoformat(str(r.get("requested_at") or "").replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0

    brief = str(run.get("brief") or "").strip()
    if not brief:
        return None
    best = None
    for other in runs:
        if other is run or other.get("id") == run.get("id"):
            continue
        if (other.get("engine") or "claude") == (run.get("engine") or "claude"):
            continue
        theirs = str(other.get("brief") or "").strip()
        same = theirs == brief or (min(len(theirs), len(brief)) >= 12 and (brief in theirs or theirs in brief))
        if not same or other.get("space") != run.get("space"):
            continue
        gap = abs(at(other) - at(run))
        if gap <= TWIN_WITHIN and (best is None or gap < best[0]):
            best = (gap, other)
    return best[1] if best else None


def report(run: dict) -> str:
    """A run's report, as Copy report puts it on the clipboard: the page writes the same lines
    (`runReport` in app/runs.js); this is the shape written once, for the stack test."""
    state = WORDS.get(str(run.get("state") or ""), run.get("state"))
    lines = [f"**{run.get('title') or 'A run'}** (run {run.get('id')})", f"- State: {state}"]
    if run.get("landed"):
        live = ("live" if run.get("deployed") else "nothing here deploys it" if run.get("deploy") == "none" else
                f"NOT live: {run.get('deploy_reason')}" if run.get("deploy_reason") else "")
        lines.append(f"- Landed on {run.get('target') or 'main'} at {str(run['landed'])[:7]}" + (f", {live}" if live else ""))
    files = run.get("files") or []
    if files:
        lines.append(f"- Files changed ({len(files)}): " + ", ".join(str(f) for f in files[:30])
                     + (", ..." if len(files) > 30 else ""))
    said = str(run.get("land_reason") if run.get("land_reason") and not run.get("landed") else run.get("last_message") or "")
    if said.strip():
        lines.append("- It said: " + " ".join(said.split())[:1500])
    return "\n".join(lines)


def used(who, switch: str, event: str, run: str) -> bool:
    """One of the four used: counted, nothing else. False for one not known, an event it does not
    report, or a switch that is off."""
    from . import evolution, switches

    if switch not in GENES or event not in GENES[switch][1] or who is None:
        return False
    if not switches.on(switch, _org(who)):
        return False
    run = str(run or "")[:40]
    if switch == "run_twin":
        if event == "opened":
            evolution.used("run_twin", "opened", who=who, detail=run)
        else:
            evolution.used("run_twin", "seen", who=who, detail=run)
    elif switch == "start_twice":
        if event == "opened":
            evolution.used("start_twice", "opened", who=who, detail=run)
        else:
            evolution.used("start_twice", "caught", who=who, detail=run)
    elif switch == "run_copy":
        evolution.used("run_copy", "copied", who=who, detail=run)
    else:
        evolution.used("start_keys", "started", who=who, detail=run)
    return True
