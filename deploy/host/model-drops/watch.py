#!/usr/bin/env python3
"""Dropped model connections, each put to what cut it, and the machine's links, every minute.

Task 197, step 197-04 (28 November 2026): "put logs so we can track it next time". A run's Claude
Code sometimes stops with "API Error: Connection lost mid-response", and its transcript keeps only
that text and a request id. Who cut it - the Wi-Fi, the key proxy, a restart, or Anthropic - is
spread over places no container sees together, so this runs on the machine the Rouh stack runs on,
as root, every minute (rouh-model-drops.timer), and reads them all:

- the runs' transcripts, in the worker's home volume (``isApiErrorMessage``);
- the worker's log: the protected core restarting the worker's program, and its run door's
  ``run door CUT`` (what a stop cut) and ``run door END`` lines (one/rundoor.py);
- the key proxy's log: ``CONNECT`` and ``END`` lines (guard/rouh_guard/keyproxy.py);
- the protected core's undo points (``points.json``): which landing it was, and by which run;
- Docker's own events: any container of the stack started, stopped or restarted;
- the journal: the Wi-Fi supplicant's events and the kernel's about the wireless link.

It writes two logs into Rouh's own log folder (the core's data volume, ``rouh/logs``), so Rouh and
the person read them where the core log is:

- ``model-drops.log``: one JSON line per drop, with ``cause`` first, then the evidence;
- ``link-health.log``: one JSON line a minute: each link's state, and for the wireless one its
  channel, signal, and the retries, failures and beacon losses since the last line.

Nothing is changed anywhere else: it reads, and writes those two files and its own state.

    watch.py                one minute's work: a link line, and every drop old enough to judge
    watch.py backfill DAYS  every drop of the last DAYS days, judged and written (once each)
    watch.py show [N]       the last N drops, one line each
    watch.py keyproxy-at-next-restart
                            wait for the worker's program to restart next (which cuts every
                            run's stream anyway), then put the key proxy in place again from
                            rouh-grant's copy (`rouh-grant keyproxy --force`), so a new key proxy
                            costs the runs no cut of its own
"""
from __future__ import annotations

import fcntl
import glob
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

PROJECT = os.environ.get("ROUH_PROJECT", "rouh")
STATE = Path(os.environ.get("ROUH_DROPS_STATE", "/var/lib/rouh-model-drops/state.json"))
#: The user Rouh's core runs as, who owns its log folder.
ROUH_UID = int(os.environ.get("ROUH_UID", "10001"))
#: How far either side of a drop the evidence is looked for.
WINDOW = 120.0
#: A drop is judged once this long has passed, so the window after it is complete.
SETTLE = 150.0
#: The protected core's paths whose change restarts the worker's program (rouh_guard/changes.py).
WORKER_PATHS = ("one/", "deploy/", "bin/", "mcp-servers.json")
LOG_LIMIT = 5 * 1024 * 1024
RESTART_LINE = "worker: the protected core put other code in place"


# --- small helpers -------------------------------------------------------------------------------

def run(*cmd: str, timeout: float = 60) -> str:
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    return r.stdout + (r.stderr if cmd[:2] == ("docker", "logs") else "")


def iso(t: float) -> str:
    return datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z"


def parse_time(text: str) -> float | None:
    text = text.strip()
    if not text:
        return None
    text = re.sub(r"(\.\d{6})\d+", r"\1", text.replace("Z", "+00:00"))
    try:
        return datetime.fromisoformat(text).timestamp()
    except ValueError:
        return None


def volume(name: str) -> Path | None:
    out = run("docker", "volume", "inspect", "-f", "{{.Mountpoint}}", f"{PROJECT}_{name}").strip()
    return Path(out) if out else None


def container(service: str) -> str:
    return f"{PROJECT}-{service}-1"


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text())
    except (OSError, ValueError):
        return {}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE.with_suffix(".new")
    tmp.write_text(json.dumps(state))
    os.replace(tmp, STATE)


def logs_dir() -> Path | None:
    data = volume("core-data")
    if data is None:
        return None
    path = data / "rouh" / "logs"
    return path if path.is_dir() else None


def append(name: str, record: dict) -> None:
    """One JSON line onto one of Rouh's logs, owned by Rouh; halved when it grows too big."""
    folder = logs_dir()
    if folder is None:
        return
    path = folder / name
    line = json.dumps(record, ensure_ascii=False) + "\n"
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(line)
    if path.stat().st_size > LOG_LIMIT:
        kept = path.read_text(encoding="utf-8", errors="replace").splitlines(True)
        path.write_text("".join(kept[len(kept) // 2:]), encoding="utf-8")
    try:
        os.chown(path, ROUH_UID, ROUH_UID)
        os.chmod(path, 0o644)
    except OSError:
        pass


# --- the links -----------------------------------------------------------------------------------

def links() -> list[str]:
    out = []
    for p in sorted(glob.glob("/sys/class/net/*")):
        name = os.path.basename(p)
        if name == "lo" or name.startswith(("docker", "br-", "veth", "virbr", "tailscale", "wg")):
            continue
        if os.path.exists(f"{p}/device"):
            out.append(name)
    return out


def default_route() -> str:
    m = re.search(r"\bdev (\S+)", run("ip", "route", "show", "default"))
    return m.group(1) if m else ""


def wireless(name: str) -> bool:
    return os.path.isdir(f"/sys/class/net/{name}/wireless")


def link_sample(state: dict) -> dict:
    """Each link's state; for a wireless one its channel, signal and counters, as deltas since
    the last sample (a counter that went down - a new association - counts from zero)."""
    now = time.time()
    record = {"event": "link_health", "at": iso(now), "default_route": default_route(), "links": {}}
    before = state.get("counters") or {}
    after = {}
    for name in links():
        entry = {}
        try:
            entry["state"] = Path(f"/sys/class/net/{name}/operstate").read_text().strip()
        except OSError:
            entry["state"] = "?"
        if wireless(name):
            info = run("iw", "dev", name, "info")
            m = re.search(r"channel (\d+) \((\d+) MHz\)", info)
            if m:
                entry["channel"], entry["freq"] = int(m.group(1)), int(m.group(2))
            dump = run("iw", "dev", name, "station", "dump")
            counters = {}
            for key, label in (("tx_retries", "tx retries"), ("tx_failed", "tx failed"),
                               ("beacon_loss", "beacon loss"), ("rx_drop", "rx drop misc"),
                               ("connected_s", "connected time")):
                m = re.search(rf"^\s*{label}:\s*(\d+)", dump, re.M)
                if m:
                    counters[key] = int(m.group(1))
            m = re.search(r"^\s*signal:\s*(-?\d+)", dump, re.M)
            if m:
                entry["signal_dbm"] = int(m.group(1))
            m = re.search(r"^\s*tx bitrate:\s*([\d.]+)", dump, re.M)
            if m:
                entry["tx_mbit"] = float(m.group(1))
            old = before.get(name) or {}
            for key in ("tx_retries", "tx_failed", "beacon_loss", "rx_drop"):
                if key in counters:
                    was = old.get(key)
                    entry[key] = counters[key] - was if was is not None and counters[key] >= was else counters[key]
            if "connected_s" in counters:
                entry["connected_s"] = counters["connected_s"]
                entry["reassociated"] = bool(old.get("connected_s") is not None
                                             and counters["connected_s"] < old["connected_s"])
            after[name] = counters
        record["links"][name] = entry
    state["counters"] = after
    # The Wi-Fi's own events since the last sample, kept here too, so they outlive the journal.
    since = float(state.get("link_at") or now - 60)
    record["wifi_events"] = [f"{iso(t)} {text}" for t, text in wifi_events(since, now)]
    state["link_at"] = now
    return record


def wifi_events(t1: float, t2: float) -> list[tuple[float, str]]:
    """The supplicant's CTRL-EVENTs and the kernel's lines about a wireless link, t1 to t2."""
    names = [n for n in links() if wireless(n)]
    if not names:
        return []
    out = run("journalctl", "--utc", "-o", "short-iso-precise", "--no-pager", "-q",
              "--since", f"@{int(t1)}", "--until", f"@{int(t2) + 1}",
              "-t", "wpa_supplicant", "-t", "kernel", timeout=30)
    events = []
    pattern = re.compile("|".join(map(re.escape, names)))
    for line in out.splitlines():
        if not pattern.search(line):
            continue
        if "wpa_supplicant" in line and "CTRL-EVENT" not in line:
            continue
        if "UFW " in line or "IN=" in line:   # the firewall's lines name the link too
            continue
        stamp, _, rest = line.partition(" ")
        t = parse_time(stamp)
        if t is None or not t1 <= t <= t2 + 1:
            continue
        text = re.sub(r"bssid=[0-9a-f:]{17}", "bssid=…", rest.split(": ", 1)[-1])
        events.append((t, text[:160]))
    return events


# --- the drops -----------------------------------------------------------------------------------

def transcripts() -> list[Path]:
    home = volume("worker-home")
    if home is None:
        return []
    return [Path(p) for p in glob.glob(str(home / ".claude" / "projects" / "**" / "*.jsonl"),
                                       recursive=True)]


def drops_in(path: Path) -> list[dict]:
    """Each API error a transcript recorded, with what came before it in the same file."""
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return []
    found = []
    last_request = None   # the entry that carried the last request id
    last_ask = None       # the last time a request was sent: a user's line or a tool's result
    model = ""
    for raw in lines:
        if '"isApiErrorMessage":true' not in raw:
            if '"requestId"' in raw or '"type":"user"' in raw:
                try:
                    d = json.loads(raw)
                except ValueError:
                    continue
                if d.get("requestId"):
                    last_request = d
                    m = (d.get("message") or {}).get("model") or ""
                    if m and not m.startswith("<"):
                        model = m
                if d.get("type") == "user":
                    last_ask = d.get("timestamp")
            continue
        try:
            d = json.loads(raw)
        except ValueError:
            continue
        text = " ".join(b.get("text", "") for b in (d.get("message") or {}).get("content") or []
                        if isinstance(b, dict))
        cwd = d.get("cwd") or ""
        m = re.search(r"/runs/([0-9a-f]{8})(?:/|$)", cwd)
        at = parse_time(d.get("timestamp") or "")
        if at is None:
            continue
        last_out = parse_time((last_request or {}).get("timestamp") or "")
        asked = parse_time(last_ask or "")
        found.append({
            "uuid": d.get("uuid"), "at": at, "run": m.group(1) if m else "",
            "cwd": cwd, "session": d.get("sessionId") or "", "sidechain": bool(d.get("isSidechain")),
            "model": model, "request_id": (last_request or {}).get("requestId") or "",
            "error": text.strip()[:200], "api_error": d.get("apiError") or "",
            "cut_cause": d.get("streamCutCause") or "", "after_output": bool(d.get("truncatedAfterOutput")),
            "streamed_s": round(at - asked, 1) if asked and asked <= at else None,
            "since_last_output_s": round(at - last_out, 1) if last_out and last_out <= at else None,
            "claude_code": d.get("version") or "",
        })
    return found


def log_lines(service: str, t1: float, t2: float, needle: str | tuple = "") -> list[tuple[float, str]]:
    out = run("docker", "logs", "--timestamps", "--since", iso(t1), "--until", iso(t2), container(service),
              timeout=120)
    needles = (needle,) if isinstance(needle, str) else needle
    lines = []
    for line in out.splitlines():
        stamp, _, rest = line.partition(" ")
        if needles and not any(n in rest for n in needles if n):
            continue
        t = parse_time(stamp)
        if t is not None:
            lines.append((t, rest.strip()))
    return lines


def container_events(t1: float, t2: float) -> list[dict]:
    out = run("docker", "events", "--since", str(int(t1)), "--until", str(int(t2) + 1),
              "--filter", "type=container", "--format", "{{json .}}", timeout=60)
    events = []
    for line in out.splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        name = ((e.get("Actor") or {}).get("Attributes") or {}).get("name", "")
        action = e.get("Action") or e.get("status") or ""
        if not name.startswith(f"{PROJECT}-") or action.split(":")[0] not in (
                "start", "stop", "die", "kill", "restart", "create", "destroy", "oom"):
            continue
        t = (e.get("timeNano") or 0) / 1e9 or float(e.get("time") or 0)
        events.append({"at": iso(t), "dt": round(t - (t1 + WINDOW), 1), "container": name,
                       "what": action.split(":")[0]})
    return events


def guard_points() -> list[dict]:
    state = volume("guard-state")
    if state is None:
        return []
    try:
        return json.loads((state / "points.json").read_text()).get("points") or []
    except (OSError, ValueError):
        return []


_worker_cache: dict = {}


def restarts_worker(point: dict) -> bool | None:
    """Whether this undo point restarted the worker's program: its change touched WORKER_PATHS."""
    n, before = point.get("n"), point.get("before")
    if n in _worker_cache:
        return _worker_cache[n]
    state = volume("guard-state")
    answer = None
    if state is not None and before is not None:
        out = subprocess.run(["git", "-c", "safe.directory=*", "--git-dir", str(state / "history.git"),
                              "diff", "--name-only", f"refs/points/{before}", f"refs/points/{n}"],
                             capture_output=True, text=True)
        if out.returncode == 0:
            answer = any(f.startswith(WORKER_PATHS) for f in out.stdout.split())
    _worker_cache[n] = answer
    return answer


def judge(drop: dict, points: list[dict]) -> dict:
    """One drop, with the evidence around it, and the cause first."""
    t = drop["at"]
    t1, t2 = t - WINDOW, t + WINDOW
    record = {"event": "model_drop", "at": iso(t), "cause": "", "run": drop["run"],
              "model": drop["model"], "request_id": drop["request_id"], "error": drop["error"],
              "api_error": drop["api_error"], "cut_cause": drop["cut_cause"],
              "streamed_s": drop["streamed_s"], "since_last_output_s": drop["since_last_output_s"],
              "sidechain": drop["sidechain"], "cwd": drop["cwd"], "claude_code": drop["claude_code"]}
    # The worker's program, and its door.
    worker = log_lines("worker", t1, t2, (RESTART_LINE, "run door CUT",
                                          f"run door END {drop['run']}" if drop["run"] else ""))
    restarts = [round(x - t, 1) for x, line in worker if RESTART_LINE in line]
    record["program_restarts_dt"] = restarts
    cut = [(round(x - t, 1), line) for x, line in worker if "run door CUT" in line]
    record["door_cut"] = [f"{dt:+}s {line.split('run door ', 1)[-1][:400]}" for dt, line in cut]
    record["door_end"] = [f"{round(x - t, 1):+}s {line.split('run door ', 1)[-1][:240]}"
                          for x, line in worker if "run door END" in line and abs(x - t) <= 10]
    # The landings: undo points made in the window, and whether each restarted the worker.
    record["landings"] = []
    for p in points:
        at = float(p.get("at") or 0)
        if t1 <= at <= t2:
            record["landings"].append({"point": p.get("n"), "dt": round(at - t, 1), "by": p.get("by", ""),
                                       "why": p.get("why", ""), "kind": p.get("kind", ""),
                                       "restarts_worker": restarts_worker(p)})
    # The key proxy: its lines for this run, and its errors, near the drop.
    needles = ("WARNING", "ERROR") + ((f"run {drop['run']}",) if drop["run"] else ())
    proxy = log_lines("keyproxy", t - 15, t + 15, needles)
    record["keyproxy"] = [f"{round(x - t, 1):+}s {line.split(': ', 1)[-1][:240]}" for x, line in proxy
                          if "api.anthropic.com" in line or "WARNING" in line or "ERROR" in line][:12]
    # Whether the key proxy running then wrote END lines at all (older ones logged only the open).
    record["keyproxy_logs_ends"] = bool(log_lines("keyproxy", t - 300, t + 300, " END CONNECT "))
    # The containers.
    record["containers"] = container_events(t1, t2)
    # The Wi-Fi.
    wifi = wifi_events(t1, t2)
    record["wifi_checked"] = bool(links())
    record["wifi"] = [f"{round(x - t, 1):+}s {text}" for x, text in wifi]
    record["cause"] = cause(record)
    return record


def cause(r: dict) -> str:
    """The one sentence a person reads first: what cut it, from the evidence, nearest first."""
    run = r["run"]
    near_restart = [dt for dt in r["program_restarts_dt"] if -5 <= dt <= 35]
    if any(run and run in line for line in r["door_cut"]) or (near_restart and r["door_cut"]):
        what = "the worker's program restarted and its run door cut the stream"
    elif near_restart:
        what = "the worker's program restarted (its run door, the runs' way to the model, went with it)"
    elif any(l.get("restarts_worker") and -10 <= l["dt"] <= 1 for l in r["landings"]):
        # The worker's own log may have rolled over (it starts again with its container); the
        # protected core's record of the landing, and that it touched the worker's paths, remains.
        what = "the worker's program restarted for a landing just before (from the protected core's record)"
    else:
        what = ""
    if what:
        landing = next((l for l in sorted(r["landings"], key=lambda l: abs(l["dt"]))
                        if l["dt"] <= 5 and l.get("restarts_worker") is not False), None)
        if landing:
            what += f", for undo point {landing['point']} ({landing['why']}, {landing['by']})"
        return what
    for c in r["containers"]:
        if abs(c["dt"]) <= 30 and c["what"] in ("die", "stop", "kill", "restart", "start"):
            return f"the container {c['container']} {c['what']} ({c['dt']:+} s)"
    if any("first=upstream" in line and "api.anthropic.com" in line for line in r["keyproxy"] + r["door_end"]):
        return "Anthropic's side closed it (the key proxy saw the upstream end first)"
    bad = [w for w in r["wifi"] if re.search(r"DISCONNECTED|BEACON|deauth|disassoc|ASSOC-REJECT|link becomes not ready", w)]
    if bad:
        return "the Wi-Fi link dropped: " + bad[0]
    switch = [w for w in r["wifi"] if "CHANNEL-SWITCH" in w and abs(float(w.split("s ", 1)[0])) <= 10]
    if switch:
        return "a Wi-Fi channel switch within 10 s: " + switch[0]
    if any("first=client" in line or "first=run" in line for line in r["keyproxy"] + r["door_end"]):
        return "the run's own side closed it (Claude Code gave up on a stale stream)"
    return "unknown: no restart, container event, Wi-Fi event or key proxy error near it"


def judge_new(state: dict, *, since: float, until: float) -> list[dict]:
    seen = set(state.get("seen") or [])
    points = guard_points()
    out = []
    for path in transcripts():
        try:
            if path.stat().st_mtime < since:
                continue
        except OSError:
            continue
        for d in drops_in(path):
            if d["uuid"] in seen or not since <= d["at"] <= until:
                continue
            record = judge(d, points)
            append("model-drops.log", record)
            out.append(record)
            seen.add(d["uuid"])
    state["seen"] = sorted(seen)[-5000:]
    return out


def minute() -> int:
    state = load_state()
    append("link-health.log", link_sample(state))
    now = time.time()
    since = float(state.get("drops_until") or now - 3600)
    until = now - SETTLE
    if until > since:
        for r in judge_new(state, since=since - SETTLE, until=until):
            print(f"{r['at']} run {r['run'] or '?'}: {r['cause']}")
        state["drops_until"] = until
    save_state(state)
    return 0


def backfill(days: float) -> int:
    state = load_state()
    now = time.time()
    found = judge_new(state, since=now - days * 86400, until=now - SETTLE)
    state["drops_until"] = max(float(state.get("drops_until") or 0), now - SETTLE)
    save_state(state)
    for r in sorted(found, key=lambda r: r["at"]):
        print(f"{r['at']} run {r['run'] or '?'}: {r['cause']}")
    print(f"{len(found)} drops judged and written.")
    return 0


def show(n: int) -> int:
    folder = logs_dir()
    path = folder / "model-drops.log" if folder else None
    if not path or not path.exists():
        print("No drops written yet.")
        return 0
    for line in path.read_text(encoding="utf-8").splitlines()[-n:]:
        r = json.loads(line)
        print(f"{r['at']} run {r['run'] or '?'} {r['request_id']}: {r['cause']}")
    return 0


def keyproxy_at_next_restart(limit: float = 7 * 86400) -> int:
    start = time.time()
    seen = start
    print("Waiting for the worker's program to restart next ...", flush=True)
    while time.time() - start < limit:
        time.sleep(1)
        now = time.time()
        if any(RESTART_LINE in line for _t, line in log_lines("worker", seen - 1, now, RESTART_LINE)):
            # The program waits for chat answers before it stops (deploywait); its door goes when
            # it stops, so wait for the door to open again, then swap at once.
            for _ in range(900):
                if log_lines("worker", seen - 1, time.time(), "run door open"):
                    break
                time.sleep(1)
            out = subprocess.run(["/usr/local/sbin/rouh-grant", "keyproxy", "--force"],
                                 capture_output=True, text=True, timeout=600)
            print(out.stdout + out.stderr, flush=True)
            return out.returncode
        seen = now
    print("No restart came; nothing was changed.")
    return 1


def locked(fn, *args) -> int:
    """One at a time: the timer's minute and a backfill never write the same drop twice."""
    STATE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE.with_suffix(".lock"), "w") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        return fn(*args)


def main(argv: list[str]) -> int:
    if not argv:
        return locked(minute)
    if argv[0] == "backfill" and len(argv) == 2:
        return locked(backfill, float(argv[1]))
    if argv == ["keyproxy-at-next-restart"]:
        return keyproxy_at_next_restart()
    if argv[0] == "show":
        return show(int(argv[1]) if len(argv) > 1 else 20)
    print(__doc__.split("\n\n")[-1], file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
