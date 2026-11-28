"""The machine's hardware in the worker: its graphics card, for the owner's own runs only.

Petar, 25 November 2026 (task 191, step 191-04), after one of his runs on mozart said "the
container can't access it (no /dev/dri or /dev/kfd) and I can't change that from here, so I'm
continuing on the CPU": under Unrestricted his own runs use the machine's hardware, starting with
the graphics card, and never stop at "the container was not started with it".

**How the card reaches the worker.** The machine, not the Rouh, gives it: the host's stack tool
(`deploy/container/linux_stack.py`, `hardware`) adds the card's device files (``/dev/kfd`` and
``/dev/dri``) and their groups to the worker when the machine has them and its owner has not
turned it off (``rouh access gpu``). The Rouh's own stack file may still ask for no device
(`guard/rouh_guard/stackpolicy.py`): a Rouh never gives itself one.

**Who may open it.** Every run in the worker is the same Linux user, so the device files' group
alone would hand the card to every run. Each run is therefore started locked out of the card's
device files by the kernel (Landlock: opening them is refused with EACCES, for the run and all it
starts) unless Rouh says, as the run starts, that it is the owner's own run while the switch is
Unrestricted (`rouh/run_access.py`, ``hardware_for``, the same rule the key proxy follows). A run
Rouh could not be asked about is locked out. The lock is made once, as the run starts, and holds
for its life; a run started again is decided again.

**What the core is told.** The program writes what it found into ``/run/one/hardware.json``,
which the core reads for the Permissions page and for what a run is told it can reach.

Standard library only.
"""
from __future__ import annotations

import ctypes
import glob
import json
import os
import sys
import time

#: Where the card's device files are: AMD's compute (ROCm) and every card's render nodes.
GPU_GLOBS = ("/dev/kfd", "/dev/dri", "/dev/nvidia*", "/dev/nvidiactl", "/dev/nvidia-uvm*")
#: The one hardware item there is now.
GPU = "gpu"
STATE_FILE = "hardware.json"

VENDORS = {"0x1002": "AMD", "0x10de": "NVIDIA", "0x8086": "Intel"}

# Landlock, from <linux/landlock.h> (the same numbers on x86_64 and arm64).
_LL_CREATE, _LL_ADD_RULE, _LL_RESTRICT = 444, 445, 446
_LL_VERSION = 1 << 0
_LL_RULE_PATH_BENEATH = 1
_PR_SET_NO_NEW_PRIVS = 38
_FS_READ_FILE = 1 << 2
_FS_WRITE_FILE = 1 << 1
#: Since ABI 2: moving or linking a file into another folder. It is the one right every ruleset
#: handles even when it is not asked to, so a lock that leaves it out refuses every rename and
#: hard link between two folders with "Invalid cross-device link" (EXDEV), everywhere. From 25 to
#: 28 November 2026 that made every git push into a local repository fail in every run locked out
#: of the card ("unable to migrate objects to permanent storage"), and with it every landing such
#: a run tried (`bin/rouh-land`, ``fit``). So it is handled, and allowed beneath every folder the
#: lock allows: the kernel still refuses a move that would give a file rights it did not have.
_FS_REFER = 1 << 13
#: Since ABI 5: an ioctl on a device file opened before the lock.
_FS_IOCTL_DEV = 1 << 15
#: What a run that is refused the card exits with when the lock could not be made. It never
#: starts unlocked.
LOCK_FAILED = 126


def nodes(dev: str = "/dev") -> list[str]:
    """The card's device files under ``dev`` that exist here, top level only (``/dev/dri`` whole)."""
    out = []
    for pattern in GPU_GLOBS:
        pattern = pattern.replace("/dev", dev, 1)
        for path in sorted(glob.glob(pattern)):
            if path not in out:
                out.append(path)
    return out


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read().strip()
    except OSError:
        return ""


def cards(sys_root: str = "/sys/class/drm") -> list[dict]:
    """[{name, vendor, pci, driver, render, vram_mb}] for each card with a render node."""
    out = []
    for render in sorted(glob.glob(os.path.join(sys_root, "renderD*"))):
        device = os.path.join(render, "device")
        vendor = _read(os.path.join(device, "vendor"))
        dev_id = _read(os.path.join(device, "device"))
        driver = os.path.basename(os.path.realpath(os.path.join(device, "driver"))) \
            if os.path.exists(os.path.join(device, "driver")) else ""
        vram = _read(os.path.join(device, "mem_info_vram_total"))
        maker = VENDORS.get(vendor, "A")
        name = _read(os.path.join(device, "product_name")) or f"{maker} graphics card"
        out.append({"name": name, "vendor": maker, "pci": f"{vendor[2:]}:{dev_id[2:]}" if vendor else "",
                    "driver": driver, "render": f"/dev/dri/{os.path.basename(render)}",
                    "vram_mb": int(vram) // 2**20 if vram.isdigit() else None})
    return out


def openable(path: str) -> bool:
    try:
        fd = os.open(path, os.O_RDWR | os.O_CLOEXEC)
    except OSError:
        return False
    os.close(fd)
    return True


def describe() -> dict:
    """What this worker has: {"gpu": {...} or None, "at": time}."""
    found = nodes()
    if not found:
        return {"gpu": None, "at": time.time()}
    files = [p for p in found if not os.path.isdir(p)]
    for d in (p for p in found if os.path.isdir(p)):
        files += sorted(os.path.join(d, n) for n in os.listdir(d) if not os.path.isdir(os.path.join(d, n)))
    usable = [p for p in files if openable(p)]
    return {"gpu": {"cards": cards(), "nodes": found, "compute": os.path.exists("/dev/kfd"),
                    "usable": bool(usable), "openable": usable},
            "at": time.time()}


def write_state(folder: str) -> dict:
    """``hardware.json`` in the program's shared folder, for the core. Never raises."""
    got = describe()
    try:
        os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, STATE_FILE)
        tmp = f"{path}.{os.getpid()}.new"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(got, fh)
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except OSError:
        pass
    return got


def read_state(folder: str) -> dict:
    try:
        with open(os.path.join(folder, STATE_FILE), encoding="utf-8") as fh:
            got = json.load(fh)
        return got if isinstance(got, dict) else {}
    except (OSError, ValueError):
        return {}


# --- the lock --------------------------------------------------------------------------------


def _libc():
    libc = ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype = ctypes.c_long
    return libc


def landlock_abi() -> int:
    if not sys.platform.startswith("linux"):
        return 0
    try:
        abi = _libc().syscall(_LL_CREATE, None, ctypes.c_size_t(0), ctypes.c_uint32(_LL_VERSION))
    except (OSError, AttributeError):
        return 0
    return int(abi) if abi > 0 else 0


def _allowed(refused: list[str], root: str = "/") -> list[str]:
    """Every path a locked process may still open: each entry of ``/`` but ``/dev``, and each entry
    of ``/dev`` but the refused ones. Landlock only allows, so refusing a few files is allowing
    everything else beside them."""
    out = []
    refused_real = {os.path.realpath(p) for p in refused}
    for name in sorted(os.listdir(root)):
        path = os.path.join(root, name)
        if os.path.realpath(path) == "/dev" or path == "/dev":
            continue
        out.append(path)
    for name in sorted(os.listdir("/dev")):
        path = os.path.join("/dev", name)
        if path in refused or os.path.realpath(path) in refused_real:
            continue
        if any(os.path.realpath(path).startswith(r + "/") for r in refused_real):
            continue
        out.append(path)
    return out


def lock_out(refused: list[str]) -> int:
    """Lock this process, and all it starts, out of opening ``refused`` (the card's device files),
    and nothing else. Returns the Landlock ABI used; raises OSError when the kernel will not."""
    abi = landlock_abi()
    if abi < 1:
        raise OSError("this kernel has no Landlock")
    libc = _libc()
    file_rights = _FS_READ_FILE | _FS_WRITE_FILE | (_FS_IOCTL_DEV if abi >= 5 else 0)
    handled = file_rights | (_FS_REFER if abi >= 2 else 0)
    attr = (ctypes.c_uint64 * 1)(handled)

    def call(*args):
        got = libc.syscall(*args)
        if got < 0:
            err = ctypes.get_errno()
            raise OSError(err, os.strerror(err))
        return got

    ruleset = call(_LL_CREATE, ctypes.byref(attr), ctypes.c_size_t(ctypes.sizeof(attr)), ctypes.c_uint32(0))
    try:
        for path in _allowed(refused):
            try:
                fd = os.open(path, os.O_PATH | os.O_CLOEXEC)
            except OSError:
                continue            # gone, or a link to nowhere: nothing to allow
            try:
                # A file takes only the file rights; a directory takes them for all beneath it,
                # and the right to move and link files within it.
                rights = handled if os.path.isdir(path) else file_rights
                rule = (ctypes.c_uint64(rights).value.to_bytes(8, sys.byteorder)
                        + fd.to_bytes(4, sys.byteorder, signed=True))
                buf = ctypes.create_string_buffer(rule, len(rule))
                try:
                    call(_LL_ADD_RULE, ctypes.c_int(ruleset), ctypes.c_int(_LL_RULE_PATH_BENEATH),
                         buf, ctypes.c_uint32(0))
                except OSError as exc:
                    # /dev/stdin and the like lead to a pipe, which takes no rule and which
                    # Landlock never restricts anyway; anything else is a real failure.
                    if exc.errno != 77:     # EBADFD
                        raise
            finally:
                os.close(fd)
        if libc.prctl(_PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0:
            raise OSError(ctypes.get_errno(), "no_new_privs was refused")
        call(_LL_RESTRICT, ctypes.c_int(ruleset), ctypes.c_uint32(0))
    finally:
        os.close(ruleset)
    return abi


def hold(given: list[str] | tuple[str, ...]) -> str:
    """For a run about to start: lock it out of the card unless it was given ``gpu``.
    Returns "" when it may start, or why it may not (the lock could not be made)."""
    if GPU in given:
        return ""
    found = nodes()
    if not found:
        return ""
    try:
        lock_out(found)
    except OSError as exc:
        return (f"this machine's graphics card is in the worker, and this run, which was not given it, "
                f"could not be locked out of it ({exc}), so it was not started. The machine's owner "
                "can take the card out of the worker with: rouh access gpu off")
    return ""


if __name__ == "__main__":
    # `python -I one/hardware.py [--lock] -- argv`: for a check by hand.
    args = sys.argv[1:]
    if args[:1] == ["--describe"]:
        print(json.dumps(describe(), indent=1))
        raise SystemExit(0)
    lock = args[:1] == ["--lock"]
    argv = args[args.index("--") + 1:] if "--" in args else []
    if lock:
        why = hold(())
        if why:
            sys.stderr.write(why + "\n")
            raise SystemExit(LOCK_FAILED)
    if argv:
        os.execvp(argv[0], argv)
