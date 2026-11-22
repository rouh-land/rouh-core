"""Four genes for building Rouh faster, around a run of the one program (night 51 of the ledger, 22 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
helps build Rouh faster. A run is opened on the canvas (`app/runs.js`, `oneRenderHead`), and a new
one is started from Metabolism's Start dialog (`#oneStartDialog`). Each gene has its own switch:

- **Start again** (`run_again`, you ask for it). An ended run that went wrong, or that should be
  done once more on another model, was started again by copying its brief into the Start dialog
  by hand. Now an ended run's head has Start again, which opens the dialog with its brief, its
  space and its agent filled in; nothing starts until Start is pressed.
- **What stopped it, and Fix it** (`land_fix`, shows up by itself). A run whose landing was
  refused said only "Could not save to main: Nothing was pushed: <the check's words>". Now the
  head says, in plain words, which check stopped it and the one thing that fixes it (`FIXES`), with
  a Fix it button that sends the run that, the same as typing it.
- **Both agents at once** (`run_both`, changes how you work). Which agent does a piece of work
  better, Claude Code or Codex, was found out by starting it twice by hand. Now Start a run has
  "Also start it on Codex" (or on Claude Code, when Codex is picked): Start starts the same brief
  on both, each a run of its own, to compare (from the Incubator's AI council, INC-371).
- **The Start dialog keeps your place** (`start_kept`, invisible). The dialog forgot an unsent
  brief when it was closed and always offered the first space. Now it keeps, on this device, the
  brief being written until it is sent and the space last started in.

The page is told which are on, and the fixes, in `#rouhRunTools` (`for_page`), and each reports its
use through `POST /api/run-tools` (`rouh/web/run_tools.py`). No model is asked by Rouh, and nothing
is kept on the server.
"""
from __future__ import annotations

import logging

log = logging.getLogger("rouh.run_tools")

#: Each gene's switch, its title, and the events it reports.
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "run_again": ("Start again: an ended run's brief, space and agent in the Start dialog", ("started",)),
    "land_fix": ("What stopped a run's landing, and Fix it", ("pressed",)),
    "run_both": ("Both agents at once: the same brief on Claude Code and Codex", ("started",)),
    "start_kept": ("The Start dialog keeps your unsent brief and your space", ("started",)),
}

#: What a refused landing's reason says, matched in this order (the words land.sh's checks say),
#: what stopped it in plain words, and what fixes it, which Fix it sends the run.
FIXES: list[tuple[str, str, str]] = [
    ("page's type check", "The page's type check found an error in the page's script.",
     "Run tools/typecheck/check.sh, fix the first error it names, commit, and land again with ./land.sh."),
    ("mail replay", "A kept mail case now comes out differently.",
     "Run python3 -m rouh.mail_replay, read the first case that failed, fix the code or, if the new outcome "
     "is meant, change that case's expected statuses and say why in the commit, then land again with ./land.sh."),
    ("past the LLM service", "A model is asked or named outside the LLM service.",
     "Ask it through rouh/llm.py with its own Use in rouh/modeldefaults.py, check with python -m rouh.llmguard, "
     "commit, and land again with ./land.sh."),
    ("old server's layout", "The code names the old server's layout without saying why that is right.",
     "Take the mention out, or list it in rouh/hostpaths.json with why it is right in the containers, check with "
     "python -m rouh.hostguard, commit, and land again with ./land.sh."),
    ("gene contract", "A gene manifest does not hold.",
     "Run python3 -m rouh.genes, fix the manifest it names, commit, and land again with ./land.sh."),
    ("does not say how it was used", "A gene with a switch does not report its use.",
     "Run python -m rouh.genes.signals, declare the gene's events in its manifest or in rouh/genes/owners.json and "
     "report each with evolution.used, commit, and land again with ./land.sh."),
    ("belongs to no gene", "A file belongs to no gene.",
     "Put the file into rouh/genes/owners.json under the gene it is part of, check with "
     "python -m rouh.genes.owners check, commit, and land again with ./land.sh."),
    ("which is not a gene", "The gene ownership map names a gene that does not exist.",
     "Run python -m rouh.genes.owners check, fix the key it names in rouh/genes/owners.json, commit, and land "
     "again with ./land.sh."),
    ("design record", "The change shows on the screen and has no design record.",
     "Keep the design record with tools/design/record.py (start, a journey line for each journey, screens), or, "
     "if nothing a person sees changed, add a line 'Design: none - <why>' to that commit's message; then land "
     "again with ./land.sh."),
    ("screen check", "The design check of the changed screens found a fault.",
     "Run python3 tools/design/record.py screens again on a test world, fix the first fault it names, and land "
     "again with ./land.sh."),
    ("screen file(s) changed after", "The screen changed after its design check.",
     "Run python3 tools/design/record.py screens again on a test world, then land again with ./land.sh."),
    ("blocker", "A design critic round still has a blocker.",
     "Fix what the last critic round blocked, run another round, write it with record.py critic, and land again "
     "with ./land.sh."),
    ("MISSED", "A journey of the design record was missed.",
     "Fix the journey and write it met with python3 tools/design/record.py journey, then land again with ./land.sh."),
    ("box handed to a job", "A commit holds a secret box's file.",
     "Take the .secrets file out of the branch's history (git rebase, dropping it), and land again with ./land.sh."),
    ("would be", "A task number would be used twice on main.",
     "Take the next free number land.sh named, rename the folder and its .object.json, commit, and land again "
     "with ./land.sh."),
    ("stack test", "The containers' stack test did not pass, or did not finish.",
     "Read the stack test's result it names (Actions, Stack test), fix what failed, and land again with ./land.sh."),
    ("program's own files", "A commit holds the one program's own files (its .one folder or a secret box).",
     "Take those files out of the commits (git rm --cached them and amend, or rebase and drop them), commit, and "
     "land again with ./land.sh."),
    ("a replay is half done", "A replay of the work over main stopped half way in the checkout.",
     "Finish it or give it up (git rebase --continue or git rebase --abort), then land again with ./land.sh."),
    ("shares no history", "The branch shares no history with main.",
     "Make a branch from main, bring the work onto it (cherry-pick its commits), and land again with ./land.sh."),
    ("the push was refused", "The push to main was refused.",
     "Read the refusal it gives, fetch main, and land again with ./land.sh."),
    ("collides", "Your work collides with something that landed on main while you worked.",
     "Read both sides, keep what each meant rather than either text, prove it again in the browser, commit, and "
     "land again with ./land.sh."),
]

#: The words before a fix, which Fix it sends.
FIX_SAY = "Your landing was refused: {what} Fix it: {fix} End by saying what land.sh said."

def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation, for the page."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def fix_for(reason: str) -> dict | None:
    """What stopped a refused landing and what fixes it, from land.sh's own words, or None."""
    said = str(reason or "")
    for needle, what, fix in FIXES:
        if needle in said:
            return {"what": what, "fix": fix, "say": FIX_SAY.format(what=what, fix=fix)}
    return None


def for_page(who) -> dict:
    """What `#rouhRunTools` tells the page: which are on, and the fixes to match."""
    on = on_for(who)
    return {"on": on, "fixes": [{"match": n, "what": w, "fix": f} for n, w, f in FIXES] if "land_fix" in on else [],
            "say": FIX_SAY if "land_fix" in on else ""}


def used(who, switch: str, event: str, run: str) -> bool:
    """One of the four used: counted, nothing else. False for one not known, an event it does not
    report, or a switch that is off."""
    from . import evolution, switches

    if switch not in GENES or event not in GENES[switch][1] or who is None:
        return False
    if not switches.on(switch, _org(who)):
        return False
    run = str(run or "")[:40]
    if switch == "run_both":
        evolution.used("run_both", "started", who=who, detail=run)
    elif switch == "run_again":
        evolution.used("run_again", "started", who=who, detail=run)
    elif switch == "land_fix":
        evolution.used("land_fix", "pressed", who=who, detail=run)
    else:
        evolution.used("start_kept", "started", who=who, detail=run)
    return True
