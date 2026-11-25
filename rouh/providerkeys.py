"""Which model providers this Rouh can ask, and with which key.

Petar, 24 October 2026: "Add Google (Gemini API) and xAI (Grok API) keys in Settings."
So there are four providers (`config.PROVIDERS`), and each install asks only the ones it
has a key for (`rouh/modeldefaults.py`: a use takes the first model on its list whose
provider has one).

- **Anthropic and OpenAI** are this installation's own keys, from its environment
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`), as they always were.
- **Google and xAI** are typed into Anatomy, Behaviour, Models, by an administrator of the
  organisation, and kept sealed with this instance's key (`rouh/encryption.py`), one row
  per organisation and provider (`ModelProviderKey`). The page is only ever told whether
  one is set, its last four characters, who saved it and when: nothing gives a key back.
  An installation may also set its own in its environment (`GEMINI_API_KEY`,
  `XAI_API_KEY`), the way it sets Anthropic's and OpenAI's; the organisation's own wins.

A key is read through here and nowhere else (`key`), and `has` is the one answer to
"can this provider be asked here", which the Models page, the picks and the LLM service
(`rouh/llm.py`) all use.
"""
from __future__ import annotations

import logging
import threading
import time

from .config import (ANTHROPIC, GOOGLE, LOCAL, OPEN_PROVIDERS, OPENAI, OPENROUTER, PROVIDER_NAMES, PROVIDERS,
                     XAI, config as _config)

log = logging.getLogger("rouh.providerkeys")

#: The providers whose key is typed into Settings.
TYPED = (GOOGLE, XAI)
#: This installation's own two, typed on the Models page too where the keys folder can be written
#: (the containers'), checked and kept the way the first run keeps them (`claude_signin.keep_key`).
CHAT_OWN = (ANTHROPIC, OPENAI)


def own_writable() -> bool:
    """Whether this Rouh keeps Anthropic's and OpenAI's keys in a folder it may write: the containers'."""
    import os

    from .web import claude_signin

    folder = claude_signin.keys_dir()
    return os.path.isdir(folder) and os.access(folder, os.W_OK)
#: The setting each provider's own key is in, for this installation.
ENV_FIELD = {ANTHROPIC: "anthropic_api_key", OPENAI: "openai_api_key",
             GOOGLE: "google_api_key", XAI: "xai_api_key",
             OPENROUTER: "openrouter_api_key", LOCAL: "local_base_url"}
ENV_NAME = {ANTHROPIC: "ANTHROPIC_API_KEY", OPENAI: "OPENAI_API_KEY",
            GOOGLE: "GEMINI_API_KEY", XAI: "XAI_API_KEY",
            OPENROUTER: "OPENROUTER_API_KEY", LOCAL: "ROUH_LOCAL_BASE_URL"}
#: Where each provider's keys are made, for the page.
WHERE = {GOOGLE: "https://aistudio.google.com/apikey", XAI: "https://console.x.ai/",
         OPENROUTER: "https://openrouter.ai/settings/keys"}
#: OpenRouter's own address, where its models and their prices are listed too.
OPENROUTER_URL = "https://openrouter.ai/api/v1"
#: What the OpenAI SDK is handed as the key of a server of your own that wants none: Ollama,
#: LM Studio and llama.cpp's server take any.
NO_KEY = "none"
#: Rouh's own containers (`deploy/stack/compose.yml`), which a server of your own is never: the
#: key proxy, above all, adds this Rouh's own keys to what it carries.
OWN_HOSTS = {"core", "keyproxy", "guard", "postgres", "checkdb", "browser", "edge", "backup"}
#: The most models one open provider offers on the page.
MOST_MODELS = 40

#: The organisations' sealed keys, read once and held a little while: a pick reads them on
#: every call. Emptied by every save.
_HELD: dict = {}
_LOCK = threading.Lock()
HOLD_SECONDS = 30


class Refused(ValueError):
    """A key that was not saved, with why in words a person can read."""


def _org(org_id: str | None) -> str:
    if org_id:
        return str(org_id)
    from .modeldefaults import org_now

    return org_now()


def _rows(org: str) -> dict:
    """{provider: (sealed, last4, saved_by, saved_at)} for this organisation, held briefly."""
    now = time.monotonic()
    with _LOCK:
        held = _HELD.get(org)
        if held and now - held[0] < HOLD_SECONDS:
            return held[1]
    got: dict = {}
    try:
        from .models import ModelProviderKey

        for r in ModelProviderKey.objects.filter(org_id=org).values(
                "provider", "key_sealed", "last4", "saved_by", "saved_at"):
            got[r["provider"]] = (r["key_sealed"], r["last4"], r["saved_by"], r["saved_at"])
    except Exception:                       # no database: only the environment's keys
        log.debug("the provider keys of %s could not be read", org, exc_info=True)
    with _LOCK:
        _HELD[org] = (now, got)
    return got


def forget() -> None:
    with _LOCK:
        _HELD.clear()


def server(provider: str, org_id: str | None = None, cfg=None) -> dict:
    """An open provider's record for this organisation (`config.OPEN_PROVIDERS`): `url`, `key`
    and `models` (each `{"id", "name"}`, the id with its provider in front), and `source`,
    "settings" or "server", or {} for none. The organisation's own, typed on the Models page and
    kept sealed, wins over this installation's environment."""
    cfg = cfg or _config
    if provider not in OPEN_PROVIDERS:
        return {}
    sealed = (_rows(_org(org_id)).get(provider) or ("",))[0]
    if sealed:
        try:
            import json

            from .encryption import box

            got = json.loads(box().open_(sealed))
            if isinstance(got, dict):
                got["source"] = "settings"
                return got
        except Exception:
            log.warning("the %s server of %s could not be opened", provider, org_id or "this Rouh")
    if provider == OPENROUTER:
        k = str(getattr(cfg, "openrouter_api_key", "") or "")
        if not k:
            return {}
        url = str(getattr(cfg, "openrouter_base_url", "") or "") or OPENROUTER_URL
        listed = str(getattr(cfg, "openrouter_models", "") or "")
    else:
        url = str(getattr(cfg, "local_base_url", "") or "")
        if not url:
            return {}
        k = str(getattr(cfg, "local_api_key", "") or "")
        listed = str(getattr(cfg, "local_models", "") or "")
    models = [{"id": f"{provider}/{m}", "name": m} for m in listed.replace(",", " ").split() if m]
    return {"url": url, "key": k, "models": models, "source": "server"}


def base_url(provider: str, org_id: str | None = None, cfg=None) -> str:
    """Where an open provider is asked, for this organisation, or ""."""
    return str(server(provider, org_id, cfg).get("url") or "")


def models_of(provider: str, org_id: str | None = None, cfg=None) -> list[dict]:
    """The models an open provider offers this organisation, `{"id", "name"}` each."""
    return [m for m in server(provider, org_id, cfg).get("models") or []
            if isinstance(m, dict) and m.get("id")]


def key(provider: str, org_id: str | None = None, cfg=None) -> str:
    """The key to ask this provider with, for this organisation, or "" for none."""
    cfg = cfg or _config
    if provider in OPEN_PROVIDERS:
        got = server(provider, org_id, cfg)
        if not got.get("url"):
            return ""
        return str(got.get("key") or "") or (NO_KEY if provider == LOCAL else "")
    if provider in TYPED:
        sealed = (_rows(_org(org_id)).get(provider) or ("",))[0]
        if sealed:
            try:
                from .encryption import box

                return box().open_(sealed)
            except Exception:
                log.warning("the %s key of %s could not be opened", provider, org_id or "this Rouh")
    return str(getattr(cfg, ENV_FIELD.get(provider, ""), "") or "")


def has(provider: str, org_id: str | None = None, cfg=None) -> bool:
    """Whether this provider can be asked here."""
    return bool(key(provider, org_id, cfg))


def available(org_id: str | None = None, cfg=None) -> tuple:
    """The providers that can be asked here, in the default order."""
    return tuple(p for p in PROVIDERS if has(p, org_id, cfg))


def chats_can_answer(org_id: str | None = None, cfg=None) -> bool:
    """Whether Rouh's own chats have a model to answer with: any provider's key here.

    Claude Code signed in with a Claude subscription does not count: that sign-in is the
    worker's, for its runs, and Rouh's chats call a provider's API with a key of their own.
    """
    return bool(available(org_id, cfg))


def where_to_add_a_key() -> str:
    """One sentence for somebody who is not technical: the chat cannot answer yet, and why.

    Until 22 November 2026 it named the providers and the Anatomy page ("Rouh's chats have no model
    key. Add an Anthropic, OpenAI, Google or xAI key ..."), which a tester read three times and still
    could not tell whether the chat worked (review 51, problems 330 and 335). The names, the key and
    the page are on the page the button opens; here, only what is wrong."""
    return "Chat is not set up yet, so Rouh cannot answer you."


def setup_href() -> str:
    """Where the chat is set up, on this installation: Claude's sign-in page where there is one,
    else Models, where the keys go."""
    from .web import claude_signin

    if claude_signin.enabled():
        return claude_signin.PATH
    from . import genes

    return genes.BY_ID["models"]["route"]


def chat_setup(org_id: str | None = None, cfg=None) -> dict | None:
    """What the chat shows while it cannot answer, in plain words, or None once it can: what is
    wrong, the one button that leads to setting it up, and whether that costs money (review 51,
    problems 330 and 335, Petar: "say that chat is not working yet, and give one clear button for
    what to do ... and say whether it costs money")."""
    if chats_can_answer(org_id, cfg):
        return None
    return {
        "head": "Chat is not set up yet",
        "said": "Rouh needs an AI service to answer you in the chat, and none is connected yet. "
                "Everything else in Rouh still works.",
        "cost": "Setting it up costs money: the AI company charges a little for each answer, usually "
                "a few cents. If someone else set up Rouh for you, ask them to do this.",
        "button": "Set up chat",
        "href": setup_href(),
    }


def shown(org_id: str | None = None, cfg=None) -> list[dict]:
    """What the Models page says of each provider: whether it can be asked and where its key
    comes from. Never the key."""
    cfg = cfg or _config
    org = _org(org_id)
    rows = _rows(org)
    writable = own_writable()
    out = []
    for p in PROVIDERS:
        own = rows.get(p)
        env = bool(getattr(cfg, ENV_FIELD[p], ""))
        if p in OPEN_PROVIDERS:
            got = server(p, org, cfg)
            out.append({"id": p, "name": PROVIDER_NAMES[p], "typed": True, "open": True,
                        "has": bool(key(p, org, cfg)), "source": got.get("source", ""),
                        "url": got.get("url", "") if p == LOCAL else "",
                        "has_key": bool(got.get("key")), "last4": str(got.get("key") or "")[-4:],
                        "models": [m["name"] for m in models_of(p, org, cfg)],
                        "saved_by": own[2] if own else "", "saved_at": own[3] if own else None,
                        "env": ENV_NAME[p], "where": WHERE.get(p, "")})
            continue
        out.append({"id": p, "name": PROVIDER_NAMES[p], "typed": p in TYPED or (p in CHAT_OWN and writable),
                    "has": bool((own and own[0]) or env),
                    "source": "settings" if own and own[0] else "server" if env else "",
                    "last4": own[1] if own else "", "saved_by": own[2] if own else "",
                    "saved_at": own[3] if own else None, "env": ENV_NAME[p],
                    "where": WHERE.get(p, "")})
    return out


def save(org_id: str, provider: str, value: str, *, by: str = "") -> None:
    """Keep an organisation's key for Google or xAI, sealed, or remove it with an empty one."""
    provider = str(provider or "").strip().lower()
    if provider not in TYPED:
        raise Refused(f"Only Google's and xAI's keys are typed in here; {PROVIDER_NAMES.get(provider, provider)}'s "
                      "is this server's own.")
    value = "".join(str(value or "").split())
    from .models import ModelProviderKey

    if not value:
        ModelProviderKey.objects.filter(org_id=str(org_id), provider=provider).delete()
        forget()
        log.info("the %s key of %s was removed by %s", provider, org_id, by or "somebody")
        return
    if len(value) < 16 or len(value) > 400:
        raise Refused(f"That does not look like a {PROVIDER_NAMES[provider]} API key.")
    from .encryption import box

    ModelProviderKey.objects.update_or_create(
        org_id=str(org_id), provider=provider,
        defaults={"key_sealed": box().seal(value), "last4": value[-4:], "saved_by": str(by or "")[:120],
                  "saved_at": time.time()})
    forget()
    log.info("a %s key for %s was saved by %s", provider, org_id, by or "somebody")


def _url_ok(provider: str, url: str) -> str:
    """An open provider's address, tidied, or Refused with why. Only http and https, never one of
    Rouh's own containers."""
    from urllib.parse import urlparse

    url = str(url or "").strip().rstrip("/")
    if provider == OPENROUTER and not url:
        return OPENROUTER_URL
    if not url:
        raise Refused("Type the address of your server, such as http://host.docker.internal:11434/v1 for "
                      "Ollama on this machine.")
    if "://" not in url:
        url = "http://" + url
    seen = urlparse(url)
    if seen.scheme not in ("http", "https") or not seen.hostname:
        raise Refused("That is not a web address. It looks like http://192.168.1.20:11434/v1.")
    if seen.hostname.lower() in OWN_HOSTS:
        raise Refused(f"{seen.hostname} is one of Rouh's own parts, not a model server.")
    if seen.username or seen.password:
        raise Refused("Put the server's key in the key box, not in its address.")
    if provider == LOCAL and not seen.path.rstrip("/"):
        url += "/v1"            # Ollama, LM Studio, vLLM and llama.cpp all answer under /v1
    return url


def _listed(provider: str, url: str, key_: str) -> list[str]:
    """The model ids a server says it has at `/models`, or Refused when it cannot be reached:
    so an address that is wrong is said at once, not at the first chat."""
    import httpx

    headers = {"Authorization": f"Bearer {key_}"} if key_ else {}
    try:
        got = httpx.get(url + "/models", headers=headers, timeout=10.0)
    except Exception as exc:
        raise Refused(f"Rouh could not reach {url} ({type(exc).__name__}). Check the address, and that the "
                      "server listens for other machines, not only for itself.") from None
    if got.status_code in (401, 403):
        raise Refused(f"{url} refused the key ({got.status_code}).")
    if got.status_code >= 400:
        raise Refused(f"{url}/models answered {got.status_code}: is it an OpenAI-compatible address, "
                      "ending in /v1?")
    try:
        data = got.json().get("data") or []
    except Exception:
        raise Refused(f"{url}/models did not answer as an OpenAI-compatible server does.") from None
    if provider == OPENROUTER:
        # Its list of models is public, so the key is checked on its own: OpenRouter's /key says
        # what a key is, and refuses one it does not know.
        try:
            mine = httpx.get(url + "/key", headers=headers, timeout=10.0)
        except Exception:
            mine = None
        if mine is not None and mine.status_code in (401, 403):
            raise Refused("OpenRouter does not know that key. Copy it again from openrouter.ai, Keys.")
    return [str(m.get("id")) for m in data if isinstance(m, dict) and m.get("id")]


def save_server(org_id: str, provider: str, *, url: str = "", key_: str | None = None,
                models=None, by: str = "", check: bool = True) -> list[str]:
    """Keep an open provider for an organisation, sealed: its address, its key (None keeps the one
    kept; "" removes it) and the models it offers (a list or a comma-separated string of the
    provider's own ids; empty for your own server means all it lists). With `url` empty and no
    models for your own server, or no key for OpenRouter, it is removed. Gives back the models kept.
    The server is asked for its models first (`check`), so a wrong address is refused here."""
    import json

    provider = str(provider or "").strip().lower()
    if provider not in OPEN_PROVIDERS:
        raise Refused(f"{PROVIDER_NAMES.get(provider, provider)} is not a server of your own.")
    from .models import ModelProviderKey

    held = server(provider, org_id) if (_rows(_org(org_id)).get(provider) or ("",))[0] else {}
    k = str(held.get("key") or "") if key_ is None else "".join(str(key_ or "").split())
    removing = (provider == LOCAL and not str(url or "").strip()) or (provider == OPENROUTER and not k)
    if removing:
        ModelProviderKey.objects.filter(org_id=str(org_id), provider=provider).delete()
        forget()
        log.info("the %s server of %s was removed by %s", provider, org_id, by or "somebody")
        return []
    url = _url_ok(provider, url)
    if isinstance(models, str):
        models = models.replace(",", " ").split()
    wanted = []
    for m in models or []:
        m = str(m or "").strip()
        if m.startswith(provider + "/"):
            m = m[len(provider) + 1:]
        if m and m not in wanted and len(m) <= 200:
            wanted.append(m)
    if check:
        there = _listed(provider, url, k)
        if not wanted and provider == LOCAL:
            wanted = there[:MOST_MODELS]
        missing = [m for m in wanted if there and m not in there]
        if missing:
            raise Refused(f"{url} has no model called {missing[0]}." + (
                " It has " + ", ".join(there[:12]) + "." if there else ""))
    if not wanted:
        raise Refused("Name at least one model, by its id at " + PROVIDER_NAMES[provider] + ".")
    if len(wanted) > MOST_MODELS:
        raise Refused(f"At most {MOST_MODELS} models.")
    from .encryption import box

    record = {"url": url, "key": k, "models": [{"id": f"{provider}/{m}", "name": m} for m in wanted]}
    ModelProviderKey.objects.update_or_create(
        org_id=str(org_id), provider=provider,
        defaults={"key_sealed": box().seal(json.dumps(record)), "last4": k[-4:] if k else "",
                  "saved_by": str(by or "")[:120], "saved_at": time.time()})
    forget()
    log.info("the %s server of %s was saved by %s, with %d models", provider, org_id, by or "somebody",
             len(wanted))
    return wanted
