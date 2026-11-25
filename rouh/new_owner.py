"""Four genes for somebody setting Rouh up and finding their way (night 54 of the ledger, 25 November 2026).

Built by the nightly feature run, task 94, for the person's guidance that half of what is built
makes Rouh easier for a first-time user, technical or not. Each has its own switch:

- **A pasted key is cleaned, and put in its own company's box** (`key_clean`, invisible). A key
  copied with its quotes, as ``ANTHROPIC_API_KEY=sk-ant-...``, after ``export`` or ``Bearer``, or
  pasted into the other company's box, was refused ("That isn't an OpenAI key", "Go back and tap
  Anthropic"). Now the extra around it is taken off (`clean`), and an Anthropic key in OpenAI's box,
  or an OpenAI key in Anthropic's, is kept as its own company's, saying so. On the Models page
  (`rouh/web/defaults.py`) and on the first run's key screen (`rouh/web/firstrun.py`).
- **No key yet? How to get one** (`key_steps`, shows up by itself). "Chat is not set up yet" sends
  a newcomer to Anatomy, Behaviour, Models, whose four key boxes say nothing about where a key comes
  from; the first run's steps are only reachable before the first run ends. Now each company with no
  key has a closed "No key yet? How to get one" under its box, with its steps (`STEPS`) and a link
  to where keys are made.
- **Show me around** (`show_around`, you ask for it). The main screen is a chat, a canvas, a round
  menu button and a row of small icons with no words. Now Show me around, on the Guide, points at
  each part of the screen in turn with one plain sentence (`TOUR`), with Back, Next and Done.
- **Rouh's own pages named in an answer open with a press** (`page_links`, changes how you work).
  An answer that says "open Anatomy, Behaviour, Models" or "it is in Clockwork" left the newcomer
  to find the page in the menu. Now each name of one of Rouh's own pages in Rouh's answer is a link
  that opens it, with what it is for as its title, the way a task's number already is.

The page is told which are on, the steps and the tour in `#rouhNewOwner` (`for_page`); each reports
its use through ``POST /api/new-owner`` (`rouh/web/new_owner.py`), and `key_clean` from where the
key is kept. No model is asked, and nothing is kept but the key, where it always was.
"""
from __future__ import annotations

import logging
import re

log = logging.getLogger("rouh.new_owner")

#: Each gene's switch, its title, and the events the page reports (`key_clean`'s are the server's).
GENES: dict[str, tuple[str, tuple[str, ...]]] = {
    "key_clean": ("A pasted AI key is cleaned, and put in its own company's box", ()),
    "key_steps": ("No key yet? How to get one, on the Models page", ("opened",)),
    "show_around": ("Show me around: a short tour of Rouh's screen", ("started", "finished")),
    "page_links": ("Rouh's own pages named in an answer open with a press", ("opened",)),
}

#: How to get each company's key, for somebody who has never made one: where, then the steps.
#: Anthropic's and OpenAI's are the first run's own (`rouh/templates/rouh/firstrun.html`, "key").
STEPS: dict[str, dict] = {
    "anthropic": {
        "where": "https://platform.claude.com/", "site": "the Claude Console",
        "steps": [
            "Make an account: open the Claude Console and press Continue with Google, or type your email.",
            "Buy $20 of credit: Settings, Billing, Buy credits.",
            "Turn on auto reload on the same page: when the balance reaches $5, bring it back up to $20.",
            "Set a monthly limit: Settings, Workspaces, Create workspace, name it Rouh, then Spend limits, $50.",
            "Make the key: Settings, API keys, Create key, in the Rouh workspace.",
            "Copy it now: it starts with sk-ant- and is shown only once. Paste it in the box above.",
        ]},
    "openai": {
        "where": "https://platform.openai.com/api-keys", "site": "the OpenAI Platform",
        "steps": [
            "Make an account: open the OpenAI Platform and sign up or sign in.",
            "Buy $20 of credit: Settings, Billing, Add to credit balance.",
            "Turn on auto recharge: when the balance falls below $5, recharge it to $20, at most $50 a month.",
            "Make the key: Settings, API keys, Create new secret key.",
            "Copy it now: it starts with sk- and is shown only once. Paste it in the box above.",
        ]},
    "google": {
        "where": "https://aistudio.google.com/apikey", "site": "Google AI Studio",
        "steps": [
            "Open Google AI Studio and sign in with a Google account.",
            "Press Create API key, and pick or make a Google Cloud project for it.",
            "To use more than the free amount, turn on billing for that project when it asks.",
            "Copy the key and paste it in the box above.",
        ]},
    "xai": {
        "where": "https://console.x.ai/", "site": "the xAI Console",
        "steps": [
            "Open the xAI Console and sign in, or make an account.",
            "Add credit under Billing.",
            "Under API Keys, press Create API key.",
            "Copy the key and paste it in the box above.",
        ]},
    "openrouter": {
        "where": "https://openrouter.ai/settings/keys", "site": "OpenRouter",
        "steps": [
            "Open OpenRouter and sign in, or make an account.",
            "Add credit under Credits. Some models are free, with low daily limits.",
            "Under Keys, press Create Key, and give it a monthly limit.",
            "Paste the key above, and the ids of the models you want, as openrouter.ai/models names them.",
        ]},
    "local": {
        "where": "https://ollama.com/download", "site": "Ollama's download page",
        "summary": "No server yet? How to run one",
        "steps": [
            "Install Ollama (or LM Studio, or vLLM) on this machine or on another one on your network.",
            "Get a small model: ollama pull qwen2.5:3b. It needs about 3 GB of memory and runs without a graphics card.",
            "Let Rouh reach it and give it room for Rouh's long instructions: start it with "
            "OLLAMA_HOST=0.0.0.0 and OLLAMA_CONTEXT_LENGTH=32768.",
            "Type its address above: http://host.docker.internal:11434/v1 for this machine, or "
            "http://its-address:11434/v1, and press Save.",
            "Put the model on a use or a tier below. It costs nothing per answer, but a small model is "
            "slow on a processor and much weaker than Smart's.",
        ]},
}

#: The stops of Show me around, in order: what on the screen (a CSS selector, the first one shown
#: wins) and the one sentence said about it. A stop whose part is not on the screen is skipped.
TOUR: list[dict] = [
    {"at": "#composerBox",
     "title": "Talk to Rouh here",
     "says": "Type what you want, or ask a question, and press the arrow or Enter. Rouh answers in the "
             "chat above."},
    {"at": "#composerTools",
     "title": "Your voice, files and more",
     "says": "These small buttons let you talk instead of typing, attach a file or a photo, and choose "
             "how Rouh answers. Hold one a moment to see its name."},
    {"at": "#transcript",
     "title": "The chat",
     "says": "Your messages and Rouh's answers. Each answer has small buttons under it to copy it, hear "
             "it or ask again."},
    {"at": "#canvasPanel",
     "title": "The canvas",
     "says": "Whatever Rouh shows you appears here: a page, a list, this Guide. Close it with the cross "
             "at its top."},
    {"at": "#orbOpen",
     "title": "The menu",
     "says": "Every page of Rouh is here, in groups: your reminders, the work Rouh does in the "
             "background, its settings and more."},
    {"at": "#crumbProject",
     "title": "Your chats",
     "says": "Rouh is the main chat. Press its name to see your other chats, or to start a new one."},
    {"at": "#chatSetup",
     "title": "Set up chat",
     "says": "Rouh needs an AI service to answer you. Set up chat connects one; the AI company charges "
             "a few cents an answer."},
]

#: Rouh's own pages that an answer may name, by the name it says, and where each opens. A name that
#: is also an everyday word (`COMMON`) is a link only inside a sentence, never as its first word.
PAGES: dict[str, str] = {
    "Metabolism": "/metabolism", "Anatomy": "/anatomy", "Synapse": "/synapse", "Clockwork": "/clockwork",
    "Mutations": "/evolution/mutations", "Incubator": "/evolution/incubator", "Gene Pool": "/evolution/pool",
    "Tuning": "/evolution/tuning", "Control room": "/control", "Quests": "/quests", "Task browser": "/tasks",
    "Morning brief": "/brief", "Live browser": "/browser", "Your part": "/actions", "Guide": "/guide",
    "Trusted contacts": "/anatomy/behaviour/trusted-contacts", "Vocabulary": "/synapse/vocabulary",
    "Heartbeat": "/anatomy/behaviour/heartbeat", "Models": "/anatomy/behaviour/models",
    "Permission gates": "/anatomy/behaviour/gates", "Agent instructions": "/agent-instructions",
    "MCP servers": "/anatomy/connections/mcp", "Email and calendar": "/anatomy/connections/email",
    "Decisions": "/decisions", "Approvals": "/mail/approvals", "Receipts": "/receipts", "Thoughts": "/thoughts",
    "Goals": "/goals", "Payments": "/anatomy/money/payments", "Silos": "/anatomy/you/silos",
}
COMMON = frozenset({"Decisions", "Approvals", "Receipts", "Thoughts", "Goals", "Payments", "Silos", "Guide",
                    "Models", "Heartbeat", "Tuning"})


def pages() -> list[dict]:
    """The pages `page_links` links, longest name first, each with what it is for in plain words when
    `first_help.PLAIN` has it."""
    from .first_help import PLAIN

    return [{"name": n, "route": r, "common": n in COMMON, "plain": PLAIN.get(n, "")}
            for n, r in sorted(PAGES.items(), key=lambda kv: -len(kv[0]))]


#: Words around a key that are not the key: quotes and brackets, and what a line that sets it says first.
_QUOTES = "\"'`“”‘’<>()[]{},;"
#: A setting's name has an underscore in it (ANTHROPIC_API_KEY), so a key with "=" in it is never taken for one.
_PREFIX = re.compile(r"^(?:export\s+|set\s+)?(?:[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*\s*[:=]\s*|bearer\s+"
                     r"|authorization\s*:\s*bearer\s+)", re.I)


def _org(who) -> str | None:
    return (getattr(who, "org_id", None) or None) if who is not None else None


def on_for(who) -> list[str]:
    """The switches of the four that are on for this person's organisation, for the page."""
    from . import switches

    if who is None:
        return []
    return [name for name in GENES if switches.on(name, _org(who))]


def for_page(who) -> dict:
    """What `#rouhNewOwner` tells the page: which are on, the steps while `key_steps` is, the tour
    while `show_around` is, and Rouh's pages while `page_links` is."""
    on = on_for(who)
    return {"on": on,
            "steps": STEPS if "key_steps" in on else {},
            "tour": TOUR if "show_around" in on else [],
            "pages": pages() if "page_links" in on else []}


# --- key_clean -----------------------------------------------------------------------------------


def clean(raw: str) -> str:
    """The key in what was pasted: the first piece that is not a name or a quote, with what wraps it
    taken off. "export ANTHROPIC_API_KEY='sk-ant-xyz'" is "sk-ant-xyz"."""
    text = str(raw or "").strip()
    for _ in range(3):
        before = text
        text = _PREFIX.sub("", text.strip()).strip().strip(_QUOTES).strip()
        if text == before:
            break
    # What is left is one token: a key has no spaces, so whatever follows a space is not it.
    return text.split()[0] if text.split() else ""


def whose(key: str) -> str:
    """Whose key this is by how it starts: "anthropic", "openai", or "" for one that says neither."""
    if key.startswith("sk-ant-"):
        return "anthropic"
    if key.startswith("sk-"):
        return "openai"
    return ""


def tidy(provider: str, raw: str, who=None) -> tuple[str, str, str]:
    """`(provider, key, said)`: a pasted key with what is around it taken off, and an Anthropic or
    OpenAI key typed in the other one's box kept as its own company's, while `key_clean` is on.
    `said` is the sentence that tells the person it moved, or "". Off, it is what was typed, with
    only the white space taken out, as before."""
    from . import switches

    plain = "".join(str(raw or "").split())
    provider = str(provider or "").strip().lower()
    if not plain or not switches.on("key_clean", _org(who)):
        return provider, plain, ""
    key = clean(raw)
    if not key:
        return provider, plain, ""
    said = ""
    own = whose(key)
    moved = provider in ("anthropic", "openai") and own and own != provider
    if moved:
        names = {"anthropic": "Anthropic", "openai": "OpenAI"}
        said = f"That was an {names[own]} key, so it was kept as {names[own]}'s."
        provider = own
    if key != plain or moved:
        from . import evolution

        evolution.used("key_clean", "cleaned", who=who,
                       detail=("moved to " + provider if moved else "") + (" trimmed" if key != plain else ""))
        log.info("key_clean: a pasted %s key was %s", provider,
                 "moved to its own box" if moved else "taken out of what was around it")
    return provider, key, said


# --- what the page reports ---------------------------------------------------------------------


def used(who, switch: str, event: str, detail: str = "") -> bool:
    """One of the page's three used: counted, nothing else. False for one not known, an event it
    does not report, or a switch that is off."""
    from . import evolution, switches

    if switch not in GENES or event not in GENES[switch][1] or who is None:
        return False
    if not switches.on(switch, _org(who)):
        return False
    detail = " ".join(str(detail or "").split())[:120]
    if switch == "key_steps":
        evolution.used("key_steps", "opened", who=who, detail=detail)
    elif (switch, event) == ("show_around", "started"):
        evolution.used("show_around", "started", who=who, detail=detail)
    elif switch == "show_around":
        evolution.used("show_around", "finished", who=who, detail=detail)
    else:
        evolution.used("page_links", "opened", who=who, detail=detail)
    return True
