"""What a Clockwork item says is filed under Reminders, and leads back to the item.

Petar, 28 November 2026: "scheduled stuff also go in reminders", "make sure those things are
fixed for the future notifications", and of a reminder's card with only a Chat button: "it should
have a button to go to the clockwork item - to see, to edit". Until then a scheduled turn that told
the phone with `send_telegram` was filed under Rouh, and no notice an item said led to the item.

Each check fires a Clockwork item through the timekeeper's own `deliver`, with its turn standing in
for the model's but calling Rouh's own `send_telegram`, from a task of its own as a real turn runs,
and reads the notice back as the Notifications page and the bell get it (`notices.listing`). The
item ids, people and words are made up. Nothing reaches a service: the phone copy is only queued.
"""
from __future__ import annotations

import asyncio
import contextlib
import time
import types

from . import check, expect

WHO = ("check-clockwork-user", "org-check-clockwork")


@contextlib.contextmanager
def _patched(obj, **values):
    was = {k: getattr(obj, k) for k in values}
    for k, v in values.items():
        setattr(obj, k, v)
    try:
        yield
    finally:
        for k, v in was.items():
            setattr(obj, k, v)


def _who():
    from rouh.tenancy import Identity

    return Identity(user_id=WHO[0], org_id=WHO[1])


def _item(kind: str, title: str):
    """One Clockwork item of the made-up person's, in the throwaway database."""
    from rouh.models.rest import Reminder

    now = time.time()
    return Reminder.objects.create(user_id=WHO[0], org_id=WHO[1], kind=kind, title=title,
                                   what=title, created_at=now, updated_at=now, next_at=now)


def _fire(row, *, sends: str = "") -> None:
    """The item comes due: `deliver`, with a turn that sends `sends` to the phone, if anything,
    through Rouh's own `send_telegram`, in a task of its own."""
    from rouh import events, notices, reminders, timekeeper, tools

    who = _who()
    registry = object.__new__(tools.ToolRegistry)
    registry.telegram = None

    async def turn(_who, chat, note, *, unattended):
        async def runs():
            if sends:
                await registry._send_telegram({"text": sends}, None)

        return types.SimpleNamespace(task=asyncio.ensure_future(runs()), said=[])

    async def nothing(*a, **k):
        return None

    tk = object.__new__(timekeeper.Timekeeper)
    tk.identity_of = lambda _uid: who
    tk.memory = types.SimpleNamespace(chat=lambda _c: None, ensure_general=lambda: "general")
    tk.telegram, tk.public_url, tk.say = None, "https://rouh.example", None
    tk._turn, tk.tell = turn, nothing
    with _patched(notices.hooks, owner=lambda: who, push=None, public_url="https://rouh.example"), \
            _patched(events, emit=lambda *a, **k: None), \
            _patched(reminders, said=lambda *a, **k: None), \
            _patched(timekeeper.Timekeeper, _chat_or_general=lambda self, c: "general",
                     _chat_named=lambda self, c: "General"):
        asyncio.run(tk.deliver(row))


def _said(words: str) -> dict | None:
    from rouh import notices

    for n in notices.listing(_who())["items"]:
        if words in (n.get("title") or "") + (n.get("body") or ""):
            return n
    return None


def _to_item(n: dict, row) -> bool:
    href = f"/clockwork?item={row.id}"
    return any(p.get("to") == "clockwork" and p.get("href") == href for p in n.get("links") or [])


@check("clockwork_notices", "scheduled work that tells the phone is filed under Reminders",
       "a Clockwork item of kind do whose turn calls send_telegram writes a notice of kind "
       "reminder, with a Clockwork button to that item beside its Chat button", needs_db=True)
def scheduled_turn_tells() -> None:
    row = _item("do", "Check the bank for the parts charge")
    _fire(row, sends="Reminder, robot parts: check the bank for the parts charge.\n\n"
                     "https://rouh.example/chat/chat-check")
    n = _said("check the bank for the parts charge")
    expect(n is not None, "the scheduled turn's message wrote no notice")
    expect(n["kind"] == "reminder", f"the scheduled turn's message was filed under {n['kind']!r}")
    expect(_to_item(n, row), f"it has no Clockwork button to item {row.id}: {n.get('links')}")
    expect(any(p.get("href") == "/chat/chat-check" for p in n.get("links") or []),
           f"its Chat button was lost beside the Clockwork one: {n.get('links')}")


@check("clockwork_notices", "a plain reminder is filed under Reminders and leads to its item",
       "a Clockwork item of kind remind whose turn sends nothing itself still reaches the "
       "notifications, under Reminders, with a Clockwork button to that item", needs_db=True)
def plain_reminder() -> None:
    row = _item("remind", "Water the office plants")
    _fire(row)
    n = _said("Water the office plants")
    expect(n is not None, "the reminder wrote no notice")
    expect(n["kind"] == "reminder", f"the reminder was filed under {n['kind']!r}")
    expect(_to_item(n, row), f"it has no Clockwork button to item {row.id}: {n.get('links')}")


@check("clockwork_notices", "an item deleted since leaves no dead Clockwork button",
       "once the item a notice came from is deleted, the notice is listed with no Clockwork "
       "button and no link to it", needs_db=True)
def deleted_item() -> None:
    from rouh.models.rest import Reminder

    row = _item("remind", "Renew the parking permit")
    _fire(row)
    expect(_said("Renew the parking permit") is not None, "the reminder wrote no notice")
    Reminder.objects.filter(id=row.id).delete()
    n = _said("Renew the parking permit")
    expect(not _to_item(n, row), "a deleted item's notice still has its Clockwork button")
    expect(f"item={row.id}" not in (n.get("link") or ""), "a deleted item's notice still links to it")


@check("clockwork_notices", "a message from an ordinary turn stays under Rouh",
       "send_telegram outside any Clockwork item writes a notice of kind rouh, with no Clockwork "
       "button", needs_db=True)
def ordinary_turn() -> None:
    from rouh import notices, tools

    registry = object.__new__(tools.ToolRegistry)
    registry.telegram = None
    who = _who()
    with _patched(notices.hooks, owner=lambda: who, push=None):
        asyncio.run(registry._send_telegram({"text": "The kettle descaler arrived."}, None))
    n = _said("The kettle descaler arrived")
    expect(n is not None, "the message wrote no notice")
    expect(n["kind"] == "rouh", f"an ordinary message was filed under {n['kind']!r}")
    expect(not any(p.get("to") == "clockwork" for p in n.get("links") or []),
           "an ordinary message has a Clockwork button")
