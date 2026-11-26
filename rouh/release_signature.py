"""The signed file that makes a release of Rouh's code (task 98, gaps G10 and G21, 26 November 2026).

Petar, 25 November 2026: "G21, yes. I have two signing keys - my macbook and the rouh, which is on
different machine." So a release is no longer only rouh.land's word. Each one is a small signed
envelope, the same one rouh.land serves in /mac/code/release.json and the GitHub Release of that
version carries as ``code-release.json``, and a Rouh takes it from either place only when the
signature is one of the keys in ``code_release_keys.json``:

* ``ed25519``: a raw Ed25519 key, the Creator Rouh's own daily key, signing the payload's bytes.
  The Creator Rouh signs every release it makes by itself (``code_release.publish``).
* ``ssh-ed25519``: an SSH key, the owner's MacBook's, signing with
  ``ssh-keygen -Y sign -n rouh-code-release`` (``mac_release.py code-release-sign``), so a release
  can be made by hand from the Mac when the Creator Rouh's machine is gone.

The envelope: ``{"format": 1, "key": <id>, "payload": <the release as canonical JSON>,
"signature": <base64, or the SSH signature's text>}``. The payload:
``{"kind": "rouh-code-release", "format": 1, "commit", "number" ("1.1.3"), "since", "live_since",
"signed_at", "notes", "database", "settings"}``.

deploy/container/mac_release.py checks the same envelope with openssl alone (``check_code_release``),
for the Linux machine's updater, and rouh.land with its own copy of the keys.
"""
from __future__ import annotations

import base64
import hashlib
import json
import re
import struct
from pathlib import Path

KEYS_FILE = Path(__file__).with_name("code_release_keys.json")
KIND = "rouh-code-release"
NAMESPACE = "rouh-code-release"
COMMIT = re.compile(r"^[0-9a-f]{40}$")
NUMBER = re.compile(r"^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,5})$")


class Bad(ValueError):
    """A release whose signature or shape is not one this trusts; the words say why."""


def keys(path: Path | None = None) -> dict:
    return json.loads((path or KEYS_FILE).read_text())["keys"]


def canonical(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, ensure_ascii=True, separators=(",", ":"))


def number_key(number: str) -> tuple[int, int, int]:
    m = NUMBER.match(str(number or ""))
    if not m:
        raise Bad(f"{number!r} is not a release number like 1.1.0")
    return int(m[1]), int(m[2]), int(m[3])


def sign_ed25519(payload: dict, seed: bytes, key_id: str = "creator-rouh-1") -> dict:
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    text = canonical(payload)
    sig = Ed25519PrivateKey.from_private_bytes(seed).sign(text.encode())
    return {"format": 1, "key": key_id, "payload": text, "signature": base64.b64encode(sig).decode()}


def _string(data: bytes, at: int) -> tuple[bytes, int]:
    if at + 4 > len(data):
        raise Bad("the SSH signature is cut short")
    (n,) = struct.unpack(">I", data[at:at + 4])
    if at + 4 + n > len(data):
        raise Bad("the SSH signature is cut short")
    return data[at + 4:at + 4 + n], at + 4 + n


def _wire(*parts: bytes) -> bytes:
    return b"".join(struct.pack(">I", len(p)) + p for p in parts)


def sshsig_parts(armored: str) -> tuple[bytes, bytes, bytes, bytes]:
    """(the signer's public key blob, the namespace, the hash name, the raw Ed25519 signature)."""
    text = str(armored or "").strip()
    head, tail = "-----BEGIN SSH SIGNATURE-----", "-----END SSH SIGNATURE-----"
    if not (text.startswith(head) and text.endswith(tail)):
        raise Bad("the signature is not an SSH signature")
    try:
        blob = base64.b64decode("".join(text[len(head):-len(tail)].split()), validate=True)
    except ValueError:
        raise Bad("the SSH signature is not base64") from None
    if blob[:6] != b"SSHSIG":
        raise Bad("the SSH signature has no SSHSIG mark")
    (version,) = struct.unpack(">I", blob[6:10])
    if version != 1:
        raise Bad("an SSH signature of a version this does not read")
    public, at = _string(blob, 10)
    namespace, at = _string(blob, at)
    _reserved, at = _string(blob, at)
    hash_name, at = _string(blob, at)
    sig, at = _string(blob, at)
    kind, i = _string(sig, 0)
    raw, _ = _string(sig, i)
    if kind != b"ssh-ed25519" or len(raw) != 64:
        raise Bad("only ssh-ed25519 signatures are taken")
    return public, namespace, hash_name, raw


def sshsig_message(payload_bytes: bytes, namespace: bytes, hash_name: bytes) -> bytes:
    """What an SSH signature signs: the SSHSIG mark, the namespace and the payload's hash."""
    if hash_name == b"sha512":
        digest = hashlib.sha512(payload_bytes).digest()
    elif hash_name == b"sha256":
        digest = hashlib.sha256(payload_bytes).digest()
    else:
        raise Bad("an SSH signature with a hash this does not take")
    return b"SSHSIG" + _wire(namespace, b"", hash_name, digest)


def _verify(raw_public: bytes, sig: bytes, message: bytes) -> bool:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

    try:
        Ed25519PublicKey.from_public_bytes(raw_public).verify(sig, message)
        return True
    except (InvalidSignature, ValueError):
        return False


def check(envelope, trusted: dict | None = None, verify=None) -> dict:
    """The release the envelope holds, when one of the trusted keys signed it; raises Bad.
    `verify(raw_public, signature, message) -> bool` is Ed25519's check: `cryptography`'s by default,
    openssl's in mac_release.py, which runs with the standard library alone."""
    verify = verify or _verify
    if not isinstance(envelope, dict) or envelope.get("format") != 1:
        raise Bad("not a signed release")
    trusted = keys() if trusted is None else trusted
    key = trusted.get(str(envelope.get("key") or ""))
    if not key:
        raise Bad(f"signed by {envelope.get('key')!r}, a key this does not trust")
    text = envelope.get("payload")
    if not isinstance(text, str):
        raise Bad("the signed release has no payload")
    try:
        public = base64.b64decode(key["key"])
    except ValueError:
        raise Bad("a trusted key that is not base64") from None
    if key.get("type") == "ed25519":
        try:
            sig = base64.b64decode(str(envelope.get("signature") or ""), validate=True)
        except ValueError:
            raise Bad("the signature is not base64") from None
        good = len(public) == 32 and verify(public, sig, text.encode())
    elif key.get("type") == "ssh-ed25519":
        signer, namespace, hash_name, raw = sshsig_parts(str(envelope.get("signature") or ""))
        if signer != public or namespace != NAMESPACE.encode():
            raise Bad("the SSH signature is not this key's, for Rouh's releases")
        kind, i = _string(public, 0)
        raw_public, _ = _string(public, i)
        good = kind == b"ssh-ed25519" and verify(raw_public, raw, sshsig_message(text.encode(), namespace, hash_name))
    else:
        raise Bad("a trusted key of a kind this does not read")
    if not good:
        raise Bad(f"the signature does not check with the key {envelope.get('key')}")
    try:
        payload = json.loads(text)
    except ValueError:
        raise Bad("the signed release is not JSON") from None
    if not isinstance(payload, dict) or payload.get("kind") != KIND or payload.get("format") != 1:
        raise Bad("the signed payload is not a release of Rouh's code")
    if not COMMIT.match(str(payload.get("commit") or "")):
        raise Bad("the signed release names no whole commit")
    number_key(payload.get("number"))
    if not isinstance(payload.get("notes"), list):
        raise Bad("the signed release has no notes")
    return {**payload, "signed_by": envelope["key"]}


def checked_row(row: dict, trusted: dict | None = None, verify=None) -> dict:
    """A row of release.json (the newest, or one of ``recent``) as its own signed envelope says it:
    the commit, number and notes are the signature's, never the row's own words. Raises Bad."""
    got = check(row.get("signed"), trusted, verify)
    if row.get("commit") and row["commit"] != got["commit"]:
        raise Bad("the release's row and its signature name different commits")
    return {**row, "commit": got["commit"], "number": got["number"], "notes": [str(n) for n in got["notes"]],
            "database": bool(got.get("database")), "settings": bool(got.get("settings")), "signed_by": got["signed_by"]}
