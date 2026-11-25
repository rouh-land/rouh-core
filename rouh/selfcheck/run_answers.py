"""A run's turn answers in the chat that asked for it, not the chat that started the run.

Petar, 25 November 2026: run d289a6f2 was started in one chat, the chat was forked, the fork
put a question to the same run (`one_say`), and when the turn finished its result, its follow-up
turn and its notice went into the chat that started the run, where nobody had asked, while the
fork that asked got nothing. He had hit it before and it had come back, because nothing held it.

These hold it, each by sending words to a run through the tool a chat's turn uses and then
reporting the run's finished turn through the real report path (`one_jobs.OneLander.report`),
looking only at which chat the card, the words handed to Rouh and the notice's link went to:

- a run started in chat A, A forked into B, and words sent to it from B: the turn answers in B,
  and A gets nothing;
- the same with two plain chats, neither a fork of the other;
- a turn the run carries on by itself, with no new words from anybody, answers in the chat
  that asked it last; and when that chat is gone, in the chat that started it.

Nothing reaches a service: the one program is a stand-in that answers `say`, `run` and
`questions`, and the chats are throwaway rows of the check's own database.
"""
from __future__ import annotations

import asyncio
import os
import time
import types
import uuid

from . import check, expect


class _One:
    """The one program, as much of it as a chat's words and a turn's report touch."""

    device_id = "dev-selfcheck"

    def __init__(self, run_id: str) -> None:
        self.run_id = run_id
        self.said: list[str] = []

    async def ask(self, t: str, **fields):
        if t == "say":
            self.said.append(str(fields.get("text") or ""))
            return {"how": "prompt"}
        if t == "questions":
            return {"questions": [{"id": "q-selfcheck", "run": self.run_id, "text": "Go on?",
                                   "open": True}]}
        if t == "answer":
            return {}
        if t == "give":
            return {}
        if t == "run":
            return {"run": {"id": self.run_id, "title": "Prompt composition", "by": self.device_id,
                            "space": "assistant", "state": "idle",
                            "last_message": "The long case reports cost 83,200 tokens."},
                    "screen": ""}
        return {}


def _chat(text: str = "") -> str:
    from rouh import conversations
    from rouh.models.memory import TranscriptMessage

    chat_id = conversations.new_chat()
    if text:
        TranscriptMessage.objects.create(session_id=chat_id, ts=time.time(), role="user",
                                         content=text)
    return chat_id


def _run_started_in(chat_id: str) -> str:
    from rouh import runs

    run_id = uuid.uuid4().hex[:8]
    runs.record(run_id, title="Prompt composition", brief="drill down", policy=runs.ONE_POLICY,
                workspace="assistant", state="running", phase="starting", first=True)
    expect(runs.came_from(run_id, chat_id), "the run could not be marked as started in its chat")
    return run_id


def _registry(one: _One):
    from rouh import tools

    reg = object.__new__(tools.ToolRegistry)
    reg.one = one
    reg.AFTER_A_MESSAGE = 0

    async def nothing(*_a, **_k):
        return ""

    reg._held_for_permission = nothing
    reg._his_words_to = nothing
    return reg


async def _send_from(chat_id: str, reg, run_id: str, how: str) -> None:
    from rouh import tools
    from rouh.memory import answering_in

    async def emit(_m):
        return None

    with answering_in(chat_id):
        if how == "one_say":
            await tools.ToolRegistry._one_say(reg, {"run": run_id, "text": "And the tool calls?"},
                                              emit)
        elif how == "reply_to_task":
            await tools.ToolRegistry._reply_to_task(reg, {"id": run_id, "answer": "Yes, go on."},
                                                    emit)
        elif how == "one_answer":
            await tools.ToolRegistry._one_answer(reg, {"question": "q-selfcheck",
                                                       "answer": "yes"}, emit)
        else:
            await tools.ToolRegistry._one_give(reg, {"run": run_id}, emit)


async def _report(one: _One, run_id: str) -> list[tuple[str, str]]:
    """Report the run's finished turn and say which chat each thing it wrote went to."""
    from rouh import one_jobs
    from rouh.memory import ANSWERING

    went: list[tuple[str, str]] = []

    class Lander(one_jobs.OneLander):
        async def _card(self, title, blocks, **_k):
            went.append(("card", ANSWERING.get()))
            return 1

        async def _say(self, note, **_k):
            went.append(("said", ANSWERING.get()))

        async def _phone(self, *_a, **_k):
            return None

        async def _goal_step_done(self, *_a, **_k):
            return False

    async def nothing(_m):
        return None

    lander = Lander(one, types.SimpleNamespace(answering_chat=lambda: ANSWERING.get()),
                    nothing, nothing, "")
    await lander.report({"run": run_id, "kind": "agent.stopped", "body": {}})
    return went


def _lands_in(want: str, went: list[tuple[str, str]], run_id: str, others: list[str]) -> None:
    from rouh import run_report, runs

    expect(went, "the finished turn was not reported at all")
    wrong = [f"{what} in {chat}" for what, chat in went if chat != want]
    expect(not wrong, f"the turn should answer in {want} only, and went to: {', '.join(wrong)}")
    expect(runs.report_chat(run_id) == want,
           f"the notice links to {runs.report_chat(run_id)!r}, not to {want}, which asked")
    for other in others:
        expect(other not in str(run_report.destinations(run_id, chat=runs.report_chat(run_id))),
               f"the notice's links name {other}, which did not ask")


def _asyncio_run(coro):
    """As the server runs it: Django is asked from async code there too (`rouh/project/asgi.py`)."""
    os.environ.setdefault("DJANGO_ALLOW_ASYNC_UNSAFE", "true")
    return asyncio.run(coro)


def _case(forked: bool, how: str = "one_say") -> None:
    from rouh import forks

    a = _chat("What does Rouh's prompt cost, drilled down?")
    b = forks.make(a) if forked else _chat("Something else entirely.")
    expect(b and b != a, "the second chat could not be made")
    if forked:
        expect(forks.parent_of(b) == a, "the fork does not say which chat it came off")
    run_id = _run_started_in(a)
    one = _One(run_id)
    _asyncio_run(_send_from(b, _registry(one), run_id, how))
    if how in ("one_say", "reply_to_task"):
        expect(one.said, "the words never reached the run")
    _lands_in(b, _asyncio_run(_report(one, run_id)), run_id, [a])


@check("run_answers", "a fork's words to a run bring its answer back to the fork",
       "a run started in a chat, carried on from a fork of that chat, answers in the fork and "
       "puts nothing in the chat it was started from", needs_db=True)
def fork_asks() -> None:
    _case(forked=True)


@check("run_answers", "a second chat's words to a run bring its answer back there",
       "a run started in one chat and asked from another plain chat answers in the one that "
       "asked, for one_say, reply_to_task, one_answer and one_give alike", needs_db=True)
def other_chat_asks() -> None:
    for how in ("one_say", "reply_to_task", "one_answer", "one_give"):
        _case(forked=False, how=how)


@check("run_answers", "a run that carries on by itself answers whoever asked it last",
       "with no new words, a run's next turn goes to the chat that last asked it, and to the "
       "chat that started it once that one is gone", needs_db=True)
def carries_on() -> None:
    from rouh import runs
    from rouh.models.objects import Chat

    a, b, c = _chat("first"), _chat("second"), _chat("third")
    run_id = _run_started_in(a)
    one = _One(run_id)
    _asyncio_run(_send_from(b, _registry(one), run_id, "one_say"))
    _asyncio_run(_send_from(c, _registry(one), run_id, "one_say"))
    _asyncio_run(_send_from(b, _registry(one), run_id, "one_say"))
    _lands_in(b, _asyncio_run(_report(one, run_id)), run_id, [a, c])
    # And the next turn, which nobody asked for, still goes to b.
    expect(runs.reports_to(run_id) == b,
           f"a turn nobody asked for answers {runs.reports_to(run_id)!r}, not the last to ask")
    Chat.objects.filter(id=b).delete()
    expect(runs.chat_of(run_id) == c,
           f"with the last chat gone the run answers {runs.chat_of(run_id)!r}, not the one "
           "that asked before it")
    Chat.objects.filter(id=c).delete()
    expect(runs.chat_of(run_id) == a,
           f"with every asking chat gone the run answers {runs.chat_of(run_id)!r}, not the "
           "chat that started it")
