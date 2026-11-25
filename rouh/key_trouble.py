"""What a refused key or an empty account says to the person: plainly, with where to fix it.

Petar, 25 November 2026 (task 98, step 98-25, gap G12): when credit runs out, say so plainly with
a link to add credit, and every key error says where the key is set and fixed. Before this an
Anthropic account with no credit reached the person as "The model call failed (400).", because
Anthropic sends a low credit balance as a 400 with only its words to tell it apart.

One place answers for every company Rouh pays per use: the model providers (Anthropic, OpenAI,
Google, xAI) and ElevenLabs, the voice. Each failure is one of two kinds, and each kind has its
own sentence and its own button, in the same voice as the spending limit's
(`rouh/spending_limit.py`: what happened, then "To carry on, ..."):

- **No credit.** The account the key belongs to has run out (`out_of_credit`): Anthropic's 400
  "Your credit balance is too low", its `billing_error`, OpenAI's `insufficient_quota`, xAI's
  "does not have any credits", ElevenLabs' `quota_exceeded`. The button opens that company's own
  billing page, in a tab of its own (`BILLING`).
- **Key refused.** A 401 or a 403 that is not about credit (`key_refused`). The button opens the
  page in Rouh where that key is typed (`WHERE`): Models for a model's key, Keys for the voice.

`said(exc, provider)` is the sentence, or None for any other failure; `button(exc, provider)` is
the button the error notice carries (`error`'s `link`, PROTOCOL.md), or None.
"""
from __future__ import annotations

import json

from .config import ANTHROPIC, GOOGLE, LOCAL, OPENAI, OPENROUTER, XAI

#: The voice's company, beside the model providers of `config.PROVIDERS`.
ELEVENLABS = "elevenlabs"

NAMES = {ANTHROPIC: "Anthropic", OPENAI: "OpenAI", GOOGLE: "Google", XAI: "xAI", OPENROUTER: "OpenRouter",
         LOCAL: "Your own model server", ELEVENLABS: "ElevenLabs"}

#: Where each company's credit is bought: its own billing page, opened in a tab of its own.
BILLING = {
    ANTHROPIC: "https://platform.claude.com/settings/billing",
    OPENAI: "https://platform.openai.com/settings/organization/billing/overview",
    GOOGLE: "https://aistudio.google.com/apikey",
    XAI: "https://console.x.ai/",
    OPENROUTER: "https://openrouter.ai/settings/credits",
    ELEVENLABS: "https://elevenlabs.io/app/subscription",
}

#: Where in Rouh each company's key is typed, as the screens name the page, and its address.
MODELS_PAGE = ("Anatomy, Behaviour, Models", "/anatomy/behaviour/models")
KEYS_PAGE = ("Anatomy, Connections, Keys", "/anatomy/connections/keys")
WHERE = {ANTHROPIC: MODELS_PAGE, OPENAI: MODELS_PAGE, GOOGLE: MODELS_PAGE, XAI: MODELS_PAGE,
         OPENROUTER: MODELS_PAGE, LOCAL: MODELS_PAGE, ELEVENLABS: KEYS_PAGE}

#: What each company says when its account is empty, lower-cased, as far as any of them says it.
_EMPTY_WORDS = ("credit balance is too low", "insufficient_quota", "exceeded your current quota",
                "quota_exceeded", "does not have any credits", "doesn't have any credits",
                "has no credits", "out of credits", "insufficient credits", "insufficient balance")


def _status(exc) -> int | None:
    for attr in ("status_code", "status"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    value = getattr(getattr(exc, "response", None), "status_code", None)
    return value if isinstance(value, int) else None


def _words(exc) -> str:
    """Everything the failure said about itself, lower-cased: its type, its code and its message."""
    bits = [str(getattr(exc, attr, "") or "") for attr in ("type", "code", "message")]
    body = getattr(exc, "body", None)
    if body:
        # The whole body, however the company nests it: xAI puts its words in a plain "error"
        # string, ElevenLabs in "detail".
        try:
            bits.append(json.dumps(body, ensure_ascii=False, default=str))
        except (TypeError, ValueError):
            bits.append(str(body))
    bits.append(str(exc))
    return " ".join(bits).lower()


def out_of_credit(exc) -> bool:
    """Whether the account behind the key has run out of credit, whatever the status it came with."""
    said = _words(exc)
    if "billing_error" in said:
        return True
    return any(w in said for w in _EMPTY_WORDS)


def key_refused(exc) -> bool:
    """Whether the company turned the key itself away: a 401 or a 403 that is not about credit."""
    return _status(exc) in (401, 403) and not out_of_credit(exc)


def credit_words(provider: str, doing: str = "answer") -> str:
    name = NAMES.get(provider, "The provider's")
    if provider == ELEVENLABS:
        return (f"Your ElevenLabs account has run out of credit, so Rouh cannot {doing}. "
                "To carry on, add credit or choose a bigger plan on ElevenLabs' billing page. Typing still works.")
    return (f"Your {name} account has run out of credit, so Rouh cannot {doing}. "
            f"To carry on, add credit on {name}'s billing page, then ask again.")


def key_words(provider: str, status: int | None, doing: str = "answer") -> str:
    name = NAMES.get(provider, "The provider")
    page = WHERE.get(provider, MODELS_PAGE)[0]
    what = "is not accepting Rouh's API key" if status != 403 else "is not letting Rouh's API key do this"
    tail = " Typing still works." if provider == ELEVENLABS else ""
    return (f"{name} {what}, so Rouh cannot {doing}. "
            f"To fix it, paste a working {name} key in {page}.{tail}")


def said(exc, provider: str, doing: str = "answer") -> str | None:
    """The failure in plain words, with where to fix it, or None when it is not about a key or credit."""
    if out_of_credit(exc):
        return credit_words(provider, doing)
    if key_refused(exc):
        return key_words(provider, _status(exc), doing)
    return None


def button(exc, provider: str) -> dict | None:
    """The one button the error carries: the company's billing page, or the page in Rouh where the key
    is typed. `{label, url}`; a url starting "/" is Rouh's own page."""
    if out_of_credit(exc) and provider in BILLING:
        return {"label": f"Add credit at {NAMES[provider]}", "url": BILLING[provider]}
    if key_refused(exc):
        name, url = WHERE.get(provider, MODELS_PAGE)
        return {"label": "Open " + name.split(", ")[-1], "url": url}
    return None


__all__ = ["BILLING", "ELEVENLABS", "WHERE", "button", "credit_words", "key_refused", "key_words",
           "out_of_credit", "said"]
