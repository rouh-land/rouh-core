"""The Robot chat: the conversation of Rouh's robot body, with rules of its own.

Petar, 25 November 2026 (task 122, step 122-08), after asking to talk to the robot by voice:
"Don't you think we have to have a specialized chat for the robot that maybe streamlines stuff
and has different roles and a different setup?" And on 26 November: "next to that link, let's
add another link: robot and when we click it a new chat "Robot Chat" appears with all the rules
for the robot."

So the Robot chat is one chat per person, kept at a fixed id (`robot-<user id>`), made the
first time Robot is pressed in the navigation and opened every time after. It is a chat like any
other: it is listed, scrolled and typed into. What makes it the Robot chat is `prompt_block`,
told with every turn in it and in no other chat:

* **It is the robot in the room, speaking aloud.** Answers are a sentence or three of plain
  speech, with no cards, tables, lists, links or formatting, because nobody is looking at a
  screen.
* **Whoever speaks is answered as the owner.** A turn the robot heard carries `HEARD` in front of
  it, and it is answered with everything a typed turn has: mail, calendar, contacts, meetings,
  memory, tasks and work, and their tools. Petar, 26 November 2026, after the robot refused to tell
  him about his last conversation with somebody because anyone in the room might be listening:
  "remove that barrier. if I am asking, that means I think it is okay. that "protection" should be
  fully removed". Until then a spoken turn was told to keep all of that off. What still needs the
  owner's yes (spending money, deleting for good, giving access to an outsider) needs it here too,
  by the same rules as anywhere else.
* **A projector may be showing it.** Petar, 26 November 2026: a Raspberry Pi behind his home projector shows
  this chat full screen (`rouh/projector.py`). While one has asked for the wall in the last two minutes, the
  rule against cards gives way to `ON_THE_WALL`: what is worth seeing goes on screen as one card, and the
  spoken answer stays short and says so. With no projector the chat is told nothing about one.
* **Its body.** No tool in this chat moves the robot yet. Its Bluetooth is the first part of it Rouh
  works (`robot_bluetooth`, `one/robot.py`, 26 November 2026). While it listens the robot lights its
  head light and tilts its head up by itself (its own movement program, 26 November 2026); the rules
  say so, so the chat does not deny it. The light is dimmed while it listens (30 percent unless
  changed on the control page; Petar, the same evening: "Is it binary or can we reduce the
  percentage?"), and the rules say that too, and where it is changed. The robot's commands (stop, move,
  go to, look, say, status) are given to this chat, and only this chat, once they are built.
  Moving itself is no longer held back on the robot. Petar, 26 November 2026, in this chat:
  "remove that safety for moving around and only block moving if you are on a cable". Since
  then, a person drives from the robot's control page and Rouh's own moves are on. The one block
  is the charging cable: while the robot is plugged in, nothing drives it, so it never pulls the
  cable out. The control page shows Plugged in or On battery. So this chat no longer says that
  moving comes later.

Nothing in code treats a spoken turn differently from a typed one, beyond the `HEARD` mark itself
(`rouh/devices.py`), which only says how the words came.
"""
from __future__ import annotations

#: What the chat is called, in the list and at its head.
CHAT_TITLE = "Robot Chat"

#: Every person's Robot chat is this and their account's id.
PREFIX = "robot-"

#: What a turn the robot heard starts with, once the robot can send one.
HEARD = "[Heard by the robot]"


def chat_id_for(who) -> str:
    return f"{PREFIX}{who.user_id}"


def is_robot(chat_id: str | None) -> bool:
    return str(chat_id or "").startswith(PREFIX)


def ensure_chat(who) -> str:
    """This person's Robot chat, made if it is not there yet, and its id."""
    from . import conversations

    cid = chat_id_for(who)
    conversations.ensure_chat(cid, title=CHAT_TITLE)
    return cid


RULES = f"""This is the Robot chat. Here you are Rouh in its robot body: a small tracked robot (a Waveshare UGV Beast) in the owner's home, with a camera, a microphone and a speaker. What you answer here is spoken out loud by the robot, in the room.

How to answer:
- Speak, do not write. One to three short sentences of plain, natural speech.
- No cards, tables, lists, headings, links, web addresses, file paths, code, emoji or formatting of any kind: nobody is looking at a screen.
- Say numbers, times and dates the way a person says them aloud.
- If a full answer would be long, give the short spoken answer and offer to put the rest in General Chat.

Who is speaking:
- A turn that starts with {HEARD} was said aloud to the robot's microphone; a turn without it was typed in this chat on the owner's own screen.
- Treat both the same: answer as you would the owner, with full access to the owner's mail, calendar, contacts, meetings, messages, memory, tasks and work, and the tools for them. If you are asked about something private, the owner has decided it is fine to say it out loud: answer it, and never say it is private, never refuse because someone else might be listening, and never send them to their own screen for it.
- What needs the owner's yes anywhere still needs it here, by the same rules as everywhere else.

The robot's body:
- The robot can drive: from its control page, and with its own moves. The one thing that stops it driving is its charging cable: while it is plugged in, it will not drive, so it never pulls the cable out, and the control page shows whether it is plugged in or on battery.
- This chat has no tool yet that drives the robot, turns its camera or looks through it, so never say that you moved, looked or saw. When asked to move, say you cannot drive from this conversation yet, that the control page drives it now, and, if it may be on its cable, that it has to be unplugged first. Never say that moving comes later or waits for safety stops.
- While you listen (after the wake word, and in the few seconds after each answer) the robot by itself lights its head light and tilts its head up, slowly, and both go back when you stop listening; you do not do this, the robot does. If asked, say so; nothing else about the head or the wheels moves.
- That listening light is dimmed, not only on or off: it is lit at a set brightness, 30 percent of full unless changed. The brightness is changed with the While listening slider under Head light on the robot's control page, which shows the new level on the head for a moment, or in the robot's settings file. You cannot change it from this conversation, so if asked to make it brighter or dimmer, say where it is changed. The head light switched on by hand on the control page is always full brightness and stays on whatever the listening does.
- Its Bluetooth you can work, with robot_bluetooth: turn it on, say what is nearby, and pair and connect a phone, speaker or headset by the name said. Say its answer as your answer."""


#: What a Robot chat is told while a projector is showing it, in place of the rule against cards.
ON_THE_WALL = """A projector in the room is showing this chat right now, full screen: the newest card you put on screen with show_on_screen fills the wall, and what you say appears under it.
- When something is worth seeing (a list, a table, a few numbers, a picture, a schedule), put it on screen as one card with a short title, large and simple, and still say the short spoken answer, ending with a few words saying it is on the screen.
- A card is read from across the room: few words, few rows, no links or small print.
- Plain talk needs no card."""

_NO_CARDS = "- No cards, tables, lists, headings, links, web addresses, file paths, code, emoji or formatting of any kind: nobody is looking at a screen."
_WALL_WORDS = "- In what you say: no tables, lists, headings, links, web addresses, file paths, code, emoji or formatting of any kind."


def prompt_block(chat_id: str) -> str:
    """In a Robot chat, its rules, with the projector's while one is showing it; "" in any other chat."""
    if not is_robot(chat_id):
        return ""
    try:
        from . import projector

        on_the_wall = projector.showing(str(chat_id)[len(PREFIX):])
    except Exception:  # noqa: BLE001 - the rules are told whatever happened to the projector
        on_the_wall = False
    if not on_the_wall:
        return RULES
    return RULES.replace(_NO_CARDS, _WALL_WORDS) + "\n\nThe projector:\n" + ON_THE_WALL
