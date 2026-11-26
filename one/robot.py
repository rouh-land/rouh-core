"""The robot's Bluetooth, for Rouh, over the robot's own link (task 122).

Petar, 26 November 2026, to the robot: "Rouh, can you build yourself a tool so that I can connect you by
Bluetooth?" The robot (a Waveshare UGV Beast) has no address Rouh's core can reach: it keeps an outgoing
SSH link to the sites server, and the worker reaches it through that as `ssh beast` (its ssh config and
key, step 122-07). The core holds no such key and should not, so its `robot_bluetooth` tool asks this
program, and this runs exactly one command on the robot, `rouh/rouh bluetooth <action> [name]`
(`~/rouh/bluetooth.py` there, which answers one JSON line with a sentence to say).

Only Rouh's own connection may ask (`rules.ALLOWED`, "voice"). The action is one of a fixed list, the
name is plain words, and nothing reaches a shell: ssh is given an argument list, and on the robot the
words are joined back into one name by its own argument parser.
"""
from __future__ import annotations

import json
import os
import re
import subprocess

#: The ssh name of the robot, from the worker's own ~/.ssh/config.
HOST = os.environ.get("ONE_ROBOT_SSH", "beast")
ACTIONS = ("status", "on", "off", "scan", "connect", "disconnect", "forget", "open")
NEEDS_NAME = ("connect", "disconnect", "forget")
#: A device's name as said: letters, digits, spaces and a little punctuation, never a shell's.
NAME_OK = re.compile(r"^[\w' .,&+-]{1,80}$", re.UNICODE)
#: How long each action may take on the robot, in seconds, ssh's hop included.
TIMEOUTS = {"scan": 45, "connect": 100, "open": 30}


def linked() -> bool:
    """Whether this machine knows the robot by name (a `Host beast` in its ssh config)."""
    try:
        with open(os.path.expanduser("~/.ssh/config")) as f:
            return any(line.split()[:2] == ["Host", HOST] for line in f if line.strip())
    except OSError:
        return False


def argv_for(action: str, name: str = "", restart: bool = False, seconds: float | None = None) -> list[str]:
    """The command run on the robot, or ValueError with a sentence to say."""
    if action not in ACTIONS:
        raise ValueError(f"I can't do {action!r} with Bluetooth.")
    argv = ["rouh/rouh", "bluetooth", action]
    if action in NEEDS_NAME:
        name = " ".join(str(name or "").split())
        if not name:
            raise ValueError("Which device? Tell me its name.")
        if not NAME_OK.match(name) or name.startswith("-"):
            raise ValueError("I can't use that name for a device.")
        argv += name.split(" ")
    if action == "on" and restart:
        argv.append("--restart")
    if action in ("scan", "open") and seconds:
        argv += ["--seconds", str(int(max(4, min(float(seconds), 300))))]
    return argv


def bluetooth(action: str, name: str = "", restart: bool = False, seconds: float | None = None) -> dict:
    """What the robot answered: always `ok` and `said`, a sentence for the voice."""
    try:
        argv = argv_for(action, name, restart, seconds)
    except (ValueError, TypeError) as e:
        return {"ok": False, "said": str(e)}
    if not linked():
        return {"ok": False, "said": "No robot is linked to this Rouh, so I can't reach its Bluetooth."}
    try:
        p = subprocess.run(["ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", HOST, *argv],
                           capture_output=True, text=True, timeout=TIMEOUTS.get(action, 40),
                           stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return {"ok": False, "said": "The robot didn't answer in time. It may be busy or out of reach."}
    except OSError as e:
        return {"ok": False, "said": "I can't reach the robot right now.", "why": str(e)[:200]}
    for line in reversed((p.stdout or "").strip().splitlines()):
        try:
            got = json.loads(line)
        except ValueError:
            continue
        if isinstance(got, dict) and got.get("said"):
            return got
    if p.returncode == 255:
        return {"ok": False, "said": "I can't reach the robot right now. It may be off or out of Wi-Fi.",
                "why": (p.stderr or "").strip()[-200:]}
    if "bluetooth" in (p.stderr or "") and "invalid choice" in (p.stderr or ""):
        return {"ok": False, "said": "The robot's own program doesn't know Bluetooth yet."}
    return {"ok": False, "said": "The robot gave no answer about Bluetooth.", "why": (p.stderr or "").strip()[-200:]}
