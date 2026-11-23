"""What one call to a model was made of: its instructions, its tools, the conversation and this turn's context.

Petar, 24 November 2026 (task 182, step 182-18), of a $2 message in a chat: "that's exactly what I want to know:
where the 380,000 tokens come from. Is it the history of the chat, files from the task, loaded memory, or
what?" The log keeps every request as its pieces (`rouh/llmlog.py`): the system prompt, the tool list and each
message once. This takes one call's pieces apart, block by block, and says how much of it was which:

- **Rouh's instructions**, the system prompt, stretch by stretch from what `rouh/prompting.py` wrote down when
  it put the prompt together: the built-in rules, the one-line list of every tool, the person's own rules.
- **Tool definitions**: the tools sent in full. A tool marked to be searched for (`defer_loading`) costs
  nothing until it is found, so it is counted, not measured.
- **The conversation so far**: the person's words, Rouh's replies, its tool calls, their results (whole or
  shortened to a stub), the notes Rouh's own software puts in a chat (new mail, a case, a finished job),
  pictures and files.
- **This message's context**: what is true of one turn only (`brain.turn_context`), again stretch by
  stretch: the task the chat is about, the page beside it, what memory recalled, genes on offer, rules.

The log has no count of tokens per part, only per call, so each part's tokens are its share of the call's
characters, scaled to the tokens the call really sent; a picture is counted by its size the way the API
counts one. Each part is then priced where it sat in the request: a request is read from the cache from its
start, then written to it, then sent at the full price, in that order (tools, system prompt, messages), so a
part's place says which of those it paid.

Then why the cache read what it read: the call before in the same chat, how long before, and whether the
instructions, the tools or the conversation in front were the same.

Worked out the first time a call's page is opened and kept (`LLMCallMakeup`), as numbers and short labels,
never the words: the log may drop a call's words later (`rouh/lean.py`). Nothing here changes how a prompt is
built or which model answers; it only measures.
"""
from __future__ import annotations

import base64
import json
import logging
import struct
import time

log = logging.getLogger("rouh.call_makeup")

#: The way a call is worked out. A kept one made another way is worked out again.
VERSION = 1

#: How many of the largest single items a call lists.
LARGEST = 10

#: The groups, in the order a request carries them, each with what a person would call it.
GROUPS = {
    "instructions": "Rouh's instructions",
    "tools": "Tool definitions",
    "history": "The conversation so far",
    "turn": "This message's context",
    "output": "The answer",
}

#: Every part, its group and its name on the screen.
PARTS = {
    "sys_rules": ("instructions", "How Rouh works: its built-in rules"),
    "sys_catalogue": ("instructions", "The list of every tool, a line each"),
    "sys_personal": ("instructions", "Your own rules"),
    "sys_facts": ("instructions", "Facts about this Rouh"),
    "sys_other": ("instructions", "Instructions"),
    "tools_loaded": ("tools", "Tools sent in full"),
    "words": ("history", "Your words"),
    "notes": ("history", "Notes from Rouh's own software: new mail, cases, finished jobs"),
    "replies": ("history", "Rouh's replies"),
    "thinking": ("history", "Rouh's thinking"),
    "calls": ("history", "Tool calls Rouh made"),
    "results": ("history", "Tool results, whole"),
    "results_short": ("history", "Tool results, shortened"),
    "files": ("history", "Pictures and files"),
    "turn_task": ("turn", "The task this chat is about: its record, notes and files"),
    "turn_page": ("turn", "The page open beside the chat"),
    "turn_memory": ("turn", "Memory recalled for this message"),
    "turn_genes": ("turn", "Genes Rouh may offer"),
    "turn_rules": ("turn", "Rules for this reply"),
    "turn_facts": ("turn", "The clock, permissions and other facts"),
    "turn_other": ("turn", "This message's context"),
    "output": ("output", "The answer and its thinking"),
}

#: A part's name inside a sentence.
SHORT = {
    "sys_rules": "Rouh's built-in rules", "sys_catalogue": "the list of every tool", "sys_personal": "your rules",
    "sys_facts": "facts about this Rouh", "sys_other": "Rouh's instructions", "tools_loaded": "tool definitions",
    "words": "your words", "notes": "notes from Rouh's own software", "replies": "Rouh's replies",
    "thinking": "Rouh's thinking", "calls": "tool calls", "results": "tool results", "results_short":
    "shortened tool results", "files": "pictures and files", "turn_task": "the task's notes",
    "turn_page": "the page beside the chat", "turn_memory": "memory", "turn_genes": "genes on offer",
    "turn_rules": "rules for this reply", "turn_facts": "the clock and other facts", "turn_other": "this message's context",
}

#: Where a stretch of the turn's context goes, by the name `brain._system` gave it.
_TURN_TITLES = {
    "What this chat is reading": "turn_task", "The task's family": "turn_task",
    "The task a fork is part of": "turn_task", "The task's files": "turn_task",
    "What General said before": "turn_task",
    "The page beside the chat": "turn_page",
    "What the message found in Synapse": "turn_memory", "Background memory": "turn_memory",
    "Genes on offer": "turn_genes", "Genes on the fly": "turn_genes",
}

#: What a tool result shortened to a stub says (`rouh/context_editing.py`).
_STUB = "kept out of the context to save room"

#: A picture the API counts at most this many tokens; one whose size cannot be read is counted so.
_PICTURE_MOST = 1600


def of_call(who, r: dict) -> dict:
    """What call `r` (a row of `llm_requests`, as values) was made of: kept, or worked out now and kept."""
    from .models import LLMCallMakeup

    kept = LLMCallMakeup.objects.filter(request_id=r["id"], version=VERSION).first()
    if kept is not None:
        return kept.body
    try:
        body = work_out(who, r)
    except Exception:  # noqa: BLE001 - the rest of the call's page is still worth having
        log.exception("what call %s was made of could not be worked out", r.get("id"))
        return {"kept": False, "note": "What this call was made of could not be worked out."}
    # A call still waiting for its answer has no token counts yet: worked out again when it has.
    if body.get("kept") and r.get("status") != "sent":
        LLMCallMakeup.objects.update_or_create(request_id=r["id"], defaults={
            "version": VERSION, "made_at": time.time(), "body": body})
    return body


# --- taking a request apart -------------------------------------------------------------------


def _bodies(hashes: list[str]) -> dict:
    from .models import LLMPiece

    out = {}
    for h, body in LLMPiece.objects.filter(hash__in=[h for h in hashes if h]).values_list("hash", "body"):
        try:
            out[h] = json.loads(body)
        except ValueError:
            continue
    return out


def _dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _short(text: str, most: int = 90) -> str:
    from .rouh_log import redact

    text = " ".join(redact(str(text or "")).split())
    return text if len(text) <= most else text[:most - 1].rstrip() + "…"


def _note_label(text: str) -> str:
    """A note of Rouh's own software, by what it says it is, without its prefix."""
    from . import turnmarks

    t = text.strip()
    if t.startswith(turnmarks.NOTE):
        t = t[len(turnmarks.NOTE):].strip()
    return "Note: " + _short(t.lstrip("[").split("]")[0], 80)


def _is_note(text: str) -> bool:
    from . import turnmarks

    t = text.lstrip()
    return t.startswith(turnmarks.NOTE) or t.startswith("[A job")


def _picture_tokens(block: dict) -> int:
    """About how many tokens the API counts a picture as: its width times its height over 750, after it is
    brought down to fit 1568 pixels on its long side, at most about 1,600."""
    src = block.get("source") if isinstance(block.get("source"), dict) else {}
    data = src.get("data") if src.get("type") == "base64" else None
    if not isinstance(data, str) or not data:
        return _PICTURE_MOST
    try:
        head = base64.b64decode(data[:65536] + "=" * (-len(data[:65536]) % 4), validate=False)
        size = _image_size(head)
    except Exception:  # noqa: BLE001 - a picture of a size we cannot read is counted at the most
        size = None
    if not size:
        return _PICTURE_MOST
    w, h = size
    scale = min(1.0, 1568 / max(w, h, 1))
    w, h = w * scale, h * scale
    return max(1, min(_PICTURE_MOST, int(w * h / 750)))


def _image_size(b: bytes) -> tuple[int, int] | None:
    if b[:8] == b"\x89PNG\r\n\x1a\n" and len(b) >= 24:
        return struct.unpack(">II", b[16:24])
    if b[:6] in (b"GIF87a", b"GIF89a") and len(b) >= 10:
        return struct.unpack("<HH", b[6:10])
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP" and len(b) >= 30:
        if b[12:16] == b"VP8X":
            return (1 + int.from_bytes(b[24:27], "little"), 1 + int.from_bytes(b[27:30], "little"))
        if b[12:16] == b"VP8 " and len(b) >= 30:
            w, h = struct.unpack("<HH", b[26:30])
            return (w & 0x3FFF, h & 0x3FFF)
        return None
    if b[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(b):
            if b[i] != 0xFF:
                i += 1
                continue
            marker = b[i + 1]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                h, w = struct.unpack(">HH", b[i + 5:i + 9])
                return (w, h)
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    return None


class _Items:
    """The request's items in the order it carried them: each with its part, its characters (or a token
    count of its own, for a picture), a label for the largest-items list and where it was."""

    def __init__(self):
        self.items: list[dict] = []

    def add(self, part: str, chars: int, label: str = "", where: str = "", tokens: int | None = None,
            index: int | None = None):
        if chars <= 0 and not tokens:
            return
        self.items.append({"part": part, "chars": int(chars), "fixed": tokens, "label": label,
                           "where": where, "index": index})


def _segments(org: str, text: str) -> list[tuple[dict, str]]:
    """A system prompt's or a turn context's stretches as `prompting` wrote them down, each with its words; a
    text it has no record of is one stretch of its own."""
    from . import prompting

    try:
        part, covered = prompting._match(org, text)
    except Exception:  # noqa: BLE001 - measured as one stretch
        log.warning("the parts of a prompt could not be looked up", exc_info=True)
        part, covered = None, 0
    if part is None:
        return [({"kind": "unknown", "title": ""}, text)]
    out, at = [], 0
    for seg in part.segments or []:
        out.append((seg, text[at:at + int(seg.get("chars") or 0)]))
        at += int(seg.get("chars") or 0)
    if at < len(text):
        out.append(({"kind": "context", "title": "Notes added for this request"}, text[at:]))
    return out


def _sys_part(seg: dict) -> str:
    kind = seg.get("kind")
    if kind == "rule":
        return "sys_rules"
    if kind == "catalogue":
        return "sys_catalogue"
    if kind == "personal":
        return "sys_personal"
    if kind == "context":
        return _TURN_TITLES.get(seg.get("title") or "", "sys_facts")
    return "sys_other"


def _turn_part(seg: dict) -> str:
    title = seg.get("title") or ""
    if title in _TURN_TITLES:
        return _TURN_TITLES[title]
    if seg.get("kind") in ("rule", "personal"):
        return "turn_rules"
    if seg.get("kind") == "context":
        return "turn_facts"
    return "turn_other"


def _system_texts(system) -> list[str]:
    if isinstance(system, str):
        return [system]
    if isinstance(system, list):
        return [b.get("text", "") for b in system if isinstance(b, dict) and b.get("type") == "text"]
    return []


def _turn_text(message: dict) -> str | None:
    """The words of this turn's context, when `message` carries it (`brain.turn_context`): a system message
    on the wire, or Rouh's note on a model that takes none."""
    from .brain import TURN_NOTE

    content = message.get("content")
    if message.get("role") in ("system", "developer"):
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "".join(b.get("text", "") for b in content if isinstance(b, dict))
    if message.get("role") == "user" and isinstance(content, list) and len(content) == 1:
        text = str((content[0] or {}).get("text") or "") if isinstance(content[0], dict) else ""
        if text.startswith(TURN_NOTE):
            return text[len(TURN_NOTE):]
    return None


def _result_text(block: dict) -> tuple[str, list]:
    """A tool result's words, and the pictures inside it."""
    content = block.get("content")
    if isinstance(content, str):
        return content, []
    words, pictures = [], []
    for b in content if isinstance(content, list) else []:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "text":
            words.append(str(b.get("text") or ""))
        elif b.get("type") in ("image", "document"):
            pictures.append(b)
        else:
            words.append(_dump(b))
    if not isinstance(content, (str, list)) and content is not None:
        words.append(_dump(content))
    return "".join(words), pictures


def _messages(items: _Items, org: str, messages: list) -> dict:
    """Every block of the conversation, by what it is. Returns facts about it: how many messages, and where
    this turn's context was."""
    names: dict[str, str] = {}
    turn_at = None
    total = len(messages)
    for i, m in enumerate(messages):
        if not isinstance(m, dict):
            continue
        where = f"message {i + 1} of {total}"
        said = _turn_text(m)
        if said is not None:
            turn_at = i
            for seg, words in _segments(org, said):
                items.add(_turn_part(seg), len(words), seg.get("title") or "This message's context", where, index=i)
            continue
        role = m.get("role")
        content = m.get("content")
        blocks = [{"type": "text", "text": content}] if isinstance(content, str) else (
            content if isinstance(content, list) else [])
        for b in blocks:
            if not isinstance(b, dict):
                continue
            kind = b.get("type")
            if kind == "text":
                text = str(b.get("text") or "")
                if role == "user":
                    if _is_note(text):
                        items.add("notes", len(text), _note_label(text), where, index=i)
                    else:
                        items.add("words", len(text), "Your words: " + _short(text, 70), where, index=i)
                else:
                    items.add("replies", len(text), "Rouh's reply: " + _short(text, 70), where, index=i)
            elif kind in ("thinking", "redacted_thinking"):
                items.add("thinking", len(str(b.get("thinking") or b.get("data") or "")), "Rouh's thinking",
                          where, index=i)
            elif kind in ("tool_use", "server_tool_use"):
                name = str(b.get("name") or "a tool")
                if b.get("id"):
                    names[str(b["id"])] = name
                items.add("calls", len(name) + len(_dump(b.get("input") or {})), f"Tool call: {name}", where,
                          index=i)
            elif kind == "tool_result":
                text, pictures = _result_text(b)
                name = names.get(str(b.get("tool_use_id") or ""), "a tool")
                part = "results_short" if _STUB in text[:400] else "results"
                items.add(part, len(text), f"Result of {name}" + (", shortened" if part == "results_short" else ""),
                          where, index=i)
                for p in pictures:
                    items.add("files", 0, f"A picture in the result of {name}", where, tokens=_picture_tokens(p),
                              index=i)
            elif kind in ("image", "document"):
                if kind == "image":
                    items.add("files", 0, "A picture", where, tokens=_picture_tokens(b), index=i)
                else:
                    src = b.get("source") if isinstance(b.get("source"), dict) else {}
                    words = str(src.get("data") or "") if src.get("type") == "text" else _dump(src)
                    items.add("files", len(words) if src.get("type") == "text" else len(words) * 3 // 4,
                              "A file", where, index=i)
            elif kind and kind.endswith("_tool_result"):
                items.add("results", len(_dump(b.get("content"))), "Result of a search Rouh ran", where, index=i)
            elif kind == "tool_reference":
                continue
            else:
                items.add("replies" if role == "assistant" else "words", len(_dump(b)), "", where, index=i)
    return {"messages": total, "turn_at": turn_at}


# --- pricing each part where it sat -----------------------------------------------------------


def _scaled(items: list[dict], sent: int) -> float:
    """Tokens a character, so the items add up to the tokens the call really sent."""
    fixed = sum(it["fixed"] or 0 for it in items)
    chars = sum(it["chars"] for it in items if not it["fixed"])
    if not chars:
        return 0.0
    if sent <= 0:
        return 1 / 3.5
    return max(sent - fixed, 0) / chars


def _price(items: list[dict], split: dict, rates: dict | None) -> None:
    """Each item's tokens, and what they cost where the item sat: the request is read from the cache from its
    start, then written to it (an hour's writing first), then sent at the full price."""
    hour = min(split.get("cache_write_1h") or 0, split.get("cache_write") or 0)
    buckets = [["read", split.get("cache_read") or 0], ["write_1h", hour],
               ["write", (split.get("cache_write") or 0) - hour], ["input", split.get("input") or 0]]
    per = {"read": "cache_read", "write_1h": "cache_write_1h", "write": "cache_write", "input": "in"}
    b = 0
    for it in items:
        left = it["tokens"]
        it["cost"] = 0.0
        it["how"] = {}
        while left > 0.0001 and b < len(buckets):
            take = min(left, buckets[b][1])
            if take > 0:
                name = buckets[b][0]
                it["how"][name] = it["how"].get(name, 0) + take
                if rates:
                    it["cost"] += take * float(rates.get(per[name]) or 0) / 1_000_000
                buckets[b][1] -= take
                left -= take
            if buckets[b][1] <= 0.0001:
                b += 1
        if left > 0.0001:
            # More than the counts say was sent: what is left is priced at the full input price.
            it["how"]["input"] = it["how"].get("input", 0) + left
            if rates:
                it["cost"] += left * float(rates.get("in") or 0) / 1_000_000


# --- why the cache read what it read ----------------------------------------------------------


def _ago(seconds: float) -> str:
    seconds = int(max(seconds, 0))
    if seconds < 90:
        return f"{seconds} seconds"
    minutes = round(seconds / 60)
    if minutes < 90:
        return f"{minutes} minutes"
    hours, minutes = divmod(minutes, 60)
    if hours < 48:
        return f"{hours} hours" + (f" {minutes} minutes" if minutes else "")
    return f"{round(hours / 24)} days"


def _common(a: list, b: list) -> int:
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def _written_what(items: list[dict]) -> str:
    """What the part of the request written to the cache mostly was."""
    by: dict[str, float] = {}
    for it in items:
        t = (it["how"].get("write") or 0) + (it["how"].get("write_1h") or 0)
        if t:
            by[it["part"]] = by.get(it["part"], 0) + t
    if not by:
        return ""
    top = sorted(by.items(), key=lambda kv: -kv[1])[:3]
    return ", ".join(f"{SHORT.get(k, PARTS[k][1].lower())} (about {round(v):,})" for k, v in top)


def _cache(who, r: dict, split: dict, items: list[dict]) -> dict:
    from .models import LLMRequest

    read, write = int(split.get("cache_read") or 0), int(split.get("cache_write") or 0)
    sent = int(split.get("input") or 0) + read + write
    facts: list[str] = []
    prev = None
    if r.get("session_id"):
        prev = (LLMRequest.objects.filter(org_id=r["org_id"], session_id=r["session_id"], provider=r["provider"],
                                          purpose=r.get("purpose") or "", started_at__lt=r["started_at"])
                .exclude(id=r["id"]).order_by("-started_at")
                .values("id", "started_at", "system_piece", "tools_piece", "message_pieces", "turn_id").first())
    gap = (float(r["started_at"]) - float(prev["started_at"])) if prev else None
    if prev and read:
        facts.append(f"The call before in this chat was {_ago(gap)} earlier"
                     + (", in the same reply." if prev.get("turn_id") and prev["turn_id"] == r.get("turn_id")
                        else ", for an earlier message."))
    changed: list[str] = []
    if prev:
        if prev["system_piece"] != r["system_piece"]:
            changed.append("Rouh's instructions")
        if prev["tools_piece"] != r["tools_piece"]:
            changed.append("the list of tools")
        mine, theirs = list(r.get("message_pieces") or []), list(prev.get("message_pieces") or [])
        same = _common(mine, theirs)
        if same < min(len(theirs), len(mine)):
            # The call before carried its turn's context after its new message, and the history never keeps it
            # (`brain.turn_context`): stepping over it is no change.
            got = _bodies([theirs[same]]).get(theirs[same])
            if isinstance(got, dict) and _turn_text(got) is not None:
                theirs = theirs[:same] + theirs[same + 1:]
                same += _common(mine[same:], theirs[same:])
        if not changed and mine and same < min(len(theirs), len(mine)):
            changed.append(f"the conversation from message {same + 1} on")
    if sent <= 0:
        return {"state": "none", "said": "This call sent nothing the log counted.", "facts": facts}
    if read == 0 and write == 0:
        return {"state": "none", "said": "Nothing of this call was cached: it was all sent at the full price.",
                "facts": facts}
    written = _written_what(items)
    if read == 0:
        reasons = []
        if prev is None:
            reasons.append("it was the first call in this chat, so there was nothing to read back")
        else:
            if gap is not None and gap <= 300 and not changed:
                reasons.append(f"the call before was only {_ago(gap)} earlier, so something in front of the "
                               "conversation must have differed")
            if gap is not None and gap > 3600:
                reasons.append(f"the call before in this chat was {_ago(gap)} earlier, and the cache keeps "
                               "what was sent for an hour at most")
            elif gap is not None and gap > 300:
                reasons.append(f"the call before was {_ago(gap)} earlier, longer than the 5 minutes the cache "
                               "keeps a conversation unless it was asked to keep it an hour")
            if changed:
                reasons.append(" and ".join(changed) + " had changed since that call, and everything after a "
                               "change has to be written again")
        if r.get("system_piece") and not _shared_hour(r):
            facts.append("No other call in the hour before used the same instructions and tools, so even "
                         "those were written again.")
        said = "The cache missed: nothing was read back"
        said += (", because " + "; and ".join(reasons) + ".") if reasons else "."
        if written:
            facts.append(f"Written to the cache instead, at more than the full price: {write:,} tokens, mostly {written}.")
        return {"state": "missed", "said": said, "facts": facts}
    share = round(read / sent * 100)
    said = f"The cache hit: {read:,} of {sent:,} tokens ({share}%) were read back cheaply."
    if write:
        facts.append(f"Written to the cache, to be read back by the next call: {write:,} tokens, mostly {written}.")
    if changed and share < 50:
        facts.append(", ".join(changed).capitalize() + " had changed since the call before.")
    return {"state": "hit" if share >= 50 else "partly", "said": said, "facts": facts}


def _shared_hour(r: dict) -> bool:
    """Whether another call in the hour before sent the same instructions and tools, so they could be read."""
    from .models import LLMRequest

    try:
        return (LLMRequest.objects.filter(org_id=r["org_id"], started_at__gte=float(r["started_at"]) - 3600,
                                          started_at__lt=r["started_at"], system_piece=r["system_piece"],
                                          tools_piece=r["tools_piece"]).exclude(id=r["id"]).exists())
    except Exception:  # noqa: BLE001 - said as not shared
        return False


# --- the whole of it ----------------------------------------------------------------------------


def _chat(r: dict, messages: int) -> dict | None:
    from . import chatkinds
    from .models import TranscriptMessage

    chat = str(r.get("session_id") or "")
    if not chat.startswith("chat-") and not chatkinds.is_general(chat):
        return None
    if chatkinds.is_general(chat):
        kind = "General: only its newest messages are sent, with a summary of the rest."
    elif chatkinds.of_general(chat):
        kind = "A side chat of General: it carries General's messages up to where it came off, then all of its own."
    else:
        kind = "Sent whole: every message this chat has goes with every call."
    q = TranscriptMessage.objects.filter(session_id=chat)
    first = q.order_by("ts").values_list("ts", flat=True).first()
    return {"kind": kind, "messages_sent": messages, "messages_held": q.count(), "since": first}


def work_out(who, r: dict) -> dict:
    """What call `r` was made of, from its pieces: the parts, the largest items, and the cache."""
    from . import costs

    if not r.get("message_pieces") and not r.get("system_piece"):
        return {"kept": False, "note": "The log did not keep this call's words, so what it was made of cannot "
                                       "be worked out; only its size is known."}
    org = str(r.get("org_id") or "")
    hashes = [r.get("tools_piece") or "", r.get("system_piece") or "", *(r.get("message_pieces") or [])]
    bodies = _bodies(hashes)
    items = _Items()

    # Tools first: that is where a request starts, for the cache.
    tools = bodies.get(r.get("tools_piece") or "") if r.get("tools_piece") else None
    loaded = waiting = 0
    for t in tools if isinstance(tools, list) else []:
        if not isinstance(t, dict):
            continue
        if t.get("defer_loading"):
            waiting += 1
            continue
        loaded += 1
        items.add("tools_loaded", len(_dump(t)), f"Tool: {t.get('name') or t.get('type') or 'a tool'}",
                  "the tool list")
    # The system prompt, stretch by stretch.
    system = bodies.get(r.get("system_piece") or "") if r.get("system_piece") else None
    for n, text in enumerate(_system_texts(system)):
        for seg, words in _segments(org, text):
            part = _sys_part(seg)
            label = seg.get("title") or PARTS[part][1]
            items.add(part, len(words), label, "the instructions" if n == 0 else "the instructions, second part")
    # The conversation.
    msgs = [bodies.get(h, {}) for h in (r.get("message_pieces") or [])]
    facts = _messages(items, org, msgs)

    usage = r.get("usage") or {}
    split = costs.tokens_of(usage) if usage else {
        "input": r.get("input_tokens") or 0, "output": r.get("output_tokens") or 0,
        "cache_read": r.get("cache_read_tokens") or 0, "cache_write": r.get("cache_write_tokens") or 0,
        "cache_write_1h": 0}
    sent = int(split.get("input") or 0) + int(split.get("cache_read") or 0) + int(split.get("cache_write") or 0)
    every = items.items
    scale = _scaled(every, sent)
    for it in every:
        it["tokens"] = float(it["fixed"]) if it["fixed"] else it["chars"] * scale
    rates = costs.rates_of(r.get("model") or r.get("served_model") or "")
    _price(every, split, rates)

    by: dict[str, dict] = {}
    for it in every:
        p = by.setdefault(it["part"], {"part": it["part"], "tokens": 0.0, "cost": 0.0, "items": 0})
        p["tokens"] += it["tokens"]
        p["cost"] += it["cost"]
        p["items"] += 1
    out_tokens = int(split.get("output") or 0)
    if out_tokens:
        by["output"] = {"part": "output", "tokens": float(out_tokens),
                        "cost": out_tokens * float((rates or {}).get("out") or 0) / 1_000_000, "items": 1}
    whole = sum(p["cost"] for p in by.values())
    order = list(PARTS)
    parts = []
    for key in sorted(by, key=lambda k: (list(GROUPS).index(PARTS[k][0]), -by[k]["tokens"], order.index(k))):
        p = by[key]
        parts.append({"part": key, "group": PARTS[key][0], "name": PARTS[key][1], "tokens": round(p["tokens"]),
                      "cost": round(p["cost"], 6), "share": (p["cost"] / whole) if whole else 0,
                      "items": p["items"]})
    groups = []
    for g, name in GROUPS.items():
        mine = [p for p in parts if p["group"] == g]
        if mine:
            groups.append({"group": g, "name": name, "tokens": sum(p["tokens"] for p in mine),
                           "cost": round(sum(p["cost"] for p in mine), 6),
                           "share": (sum(p["cost"] for p in mine) / whole) if whole else 0})
    # The largest single items, after the parts are what they are: one message's blocks are one item when
    # they are of one kind (a note, a long tool call), so a message is said once.
    merged: dict[tuple, dict] = {}
    for it in every:
        key = (it["index"], it["part"], it["label"]) if it["index"] is not None else (id(it),)
        m = merged.setdefault(key, {"label": it["label"] or PARTS[it["part"]][1], "part": it["part"],
                                    "kind": PARTS[it["part"]][1], "group": GROUPS[PARTS[it["part"]][0]],
                                    "where": it["where"], "tokens": 0.0, "cost": 0.0})
        m["tokens"] += it["tokens"]
        m["cost"] += it["cost"]
    largest = sorted(merged.values(), key=lambda m: -m["tokens"])[:LARGEST]
    for m in largest:
        m["tokens"] = round(m["tokens"])
        m["cost"] = round(m["cost"], 6)
    from .usage import _money

    for row in (*parts, *groups, *largest):
        row["money"] = _money(row["cost"])
    cache = _cache(who, r, split, every)
    return {
        "kept": True,
        "version": VERSION,
        "sent": sent,
        "estimated": True,
        "how": ("Each part's tokens are its share of the call's characters, scaled to the tokens it really sent; "
                "a picture is counted by its size. Each part is priced where it sat in the request."),
        "parts": parts,
        "groups": groups,
        "largest": largest,
        "tools": {"sent": loaded, "waiting": waiting},
        "messages": facts["messages"],
        "chat": _chat(r, facts["messages"]),
        "cache": cache,
    }
