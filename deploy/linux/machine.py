"""Is this machine just for Rouh? The installer asks once, and each machine-level choice has its own switch (task 98, G1).

The owner, 25 November 2026: a new Rouh stays Unrestricted, but the installer asks whether the
machine is dedicated to Rouh, shows each machine-level choice with its own toggle and a plain
explanation, sets the host login On for a dedicated machine and Off for one that is not, and lets
the owner change either. Skipping the question counts as not dedicated.

The choices, each one line of the settings file (``~/rouh/.env``):

- **Your runs may log in to this machine** (``ROUH_STANDING_HOST``, 1 or 0). The host login of
  `standing.py`: the owner's own runs, only while Permissions is Unrestricted, reach this machine
  by ssh as the account that installed Rouh, with its sudo. On for a dedicated machine, off for a
  shared one. A settings file with no line for it is a Rouh installed before the question: it keeps
  what it had (on).
- **Rouh updates itself every night** (the systemd timer of ``rouh update --on``). Security fixes
  arrive by themselves, after a backup, going back by itself if unhealthy. On either way.
- **Your runs may use this machine's graphics card** (``ROUH_GPU``, 1 or 0; task 191, step 191-04).
  The card's device files go into Rouh's worker (`linux_stack.py`, ``add_hardware``), and the one
  program lets only the owner's own runs open them, while Permissions is Unrestricted. On either
  way: it gives no login and no file of the machine. Shown only on a machine that has a card.

``ROUH_DEDICATED`` (yes or no) records the answer, so ``rouh access`` can say what was chosen.
``rouh access`` shows the switches again and changes them, at any time.
"""
from __future__ import annotations

from dataclasses import dataclass

from common import BOLD, DIM, RESET, ask, can_ask, heading, say, set_settings, setting


@dataclass(frozen=True)
class Choice:
    key: str
    name: str
    means: str
    on_dedicated: bool
    on_shared: bool


HOST = Choice(
    "host", "Your runs may log in to this machine",
    "Jobs you start can reach this machine by ssh, as your account, with its sudo: they can install "
    "software, change settings and read any file here. Only your own jobs, and only while "
    "Permissions is Unrestricted. Good for a machine that is just for Rouh; on a machine with other "
    "work or other people's data, a job misled by an email or web page could touch those too.",
    True, False)
NIGHTLY = Choice(
    "nightly", "Rouh updates itself every night",
    "Between 03:00 and 05:00, after a backup, Rouh takes the newest signed release, and goes back "
    "by itself if it is not healthy. Security fixes arrive without you. Off: Rouh updates only when "
    "you run rouh update.",
    True, True)
GPU = Choice(
    "gpu", "Your runs may use this machine's graphics card",
    "Training and other heavy work you ask for runs on the card instead of the processor. Only your "
    "own jobs open it, and only while Permissions is Unrestricted; every other job is locked out of "
    "it. It gives no login and no file of this machine.",
    True, True)
CHOICES = (HOST, NIGHTLY, GPU)

DEDICATED_LEDE = ("Rouh's own jobs can be given more of this machine when nothing else lives on it. "
                  "Each choice below has its own switch, and you can change any of them later with: rouh access")
DEDICATED_YES = "Yes, this machine is just for Rouh"
DEDICATED_NO = "No, other things run here too (also the answer if you skip)"


def defaults(dedicated: bool) -> dict[str, bool]:
    return {c.key: (c.on_dedicated if dedicated else c.on_shared) for c in CHOICES}


def host_on() -> bool:
    """Whether the host login is wanted: the settings file's line, or on for an install from
    before the question (no line at all)."""
    return setting("ROUH_STANDING_HOST", "1") != "0"


def gpu_on() -> bool:
    """Whether the worker is given the machine's graphics card: yes unless ROUH_GPU=0."""
    return setting("ROUH_GPU", "1") != "0"


def has_gpu() -> bool:
    import os

    return os.path.exists("/dev/kfd") or os.path.isdir("/dev/dri")


def shown() -> tuple[Choice, ...]:
    """The choices this machine has: the graphics card's only where there is one."""
    return tuple(c for c in CHOICES if c is not GPU or has_gpu())


def _draw(picked: dict[str, bool]) -> None:
    for i, c in enumerate(shown(), 1):
        state = "On " if picked[c.key] else "Off"
        say(f"  {BOLD}{i}  [{state}]  {c.name}{RESET}", f"     {DIM}{c.means}{RESET}", "")


def toggles(picked: dict[str, bool]) -> dict[str, bool]:
    """Each choice with its switch: a number switches it, Enter keeps them as shown."""
    picked = dict(picked)
    while True:
        _draw(picked)
        got = ask(f"Type a number to switch it, or press Enter to keep these: ").strip()
        if not got:
            return picked
        if got.isdigit() and 1 <= int(got) <= len(shown()):
            c = shown()[int(got) - 1]
            picked[c.key] = not picked[c.key]
            continue
        say(f"Type 1 to {len(shown())}, or press Enter.")


def ask_dedicated() -> bool:
    """Yes or no; Enter, anything else, or no terminal at all is no."""
    heading("Is this machine just for Rouh?")
    say(DEDICATED_LEDE, "", f"  {BOLD}Y{RESET}  {DEDICATED_YES}", f"  {BOLD}N{RESET}  {DEDICATED_NO}", "")
    got = ask("Just for Rouh? [y/N] ").strip().lower()
    return got in ("y", "yes")


def save(dedicated: bool | None, picked: dict[str, bool]) -> None:
    values = {"ROUH_STANDING_HOST": "1" if picked["host"] else "0"}
    if "gpu" in picked:
        values["ROUH_GPU"] = "1" if picked["gpu"] else "0"
    if dedicated is not None:
        values["ROUH_DEDICATED"] = "yes" if dedicated else "no"
    set_settings(**values)


def at_install(assume_yes: bool = False) -> dict[str, bool]:
    """The question at a first install. With no terminal, or ``--yes``, nothing is asked and it is
    not dedicated: the host login off, nightly updates on. An install whose settings file already
    says (a second ``rouh install``) keeps what it says, and is not asked again."""
    if setting("ROUH_STANDING_HOST") in ("0", "1"):
        return {"host": host_on(), "nightly": True, "gpu": gpu_on()}
    if assume_yes or not can_ask():
        picked = defaults(False)
        save(False, picked)
        say("This machine is taken as not only for Rouh: your runs do not log in to it. Change it: rouh access")
        return picked
    dedicated = ask_dedicated()
    say("", "Set for a machine that is " + ("just for Rouh:" if dedicated else "not only for Rouh:"), "")
    picked = toggles(defaults(dedicated))
    save(dedicated, picked)
    return picked


def summary() -> list[str]:
    ded = setting("ROUH_DEDICATED")
    said = {"yes": "You said this machine is just for Rouh.", "no": "You said other things run on this machine too."}
    return [said.get(ded, "This Rouh was installed before the question was asked.")]
