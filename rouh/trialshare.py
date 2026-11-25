"""A testing run, shared the way a task is.

The person, 25 November 2026, about /evolution/testing/63: "Basically this report for a testing
run I want someone to share and read and at a later point control that." Until then a testing run's
page could not be shared at all: sharing named a page of the workspace or a task's folder, and a
testing run is neither. It is rows in Rouh's database (`rouh/trials/`) and screenshots beside them.

So a testing run is shared by the very same rows, links and panel a task is (`rouh/sharing.py`): one
`public_pages` row per run per owner, its one link `/p/<token>`, public or not, and the same people
invited by email (`page_guests`, `/shared/<token>`), which is the one permission record every check
reads (DELEGATION.md, `rouh/task_access.py`). What tells it apart is the row's path:
`_trial/<its number>`, the number the owner's own page shows at `/evolution/testing/<n>`.

What a shared testing run shows
-------------------------------

**The run as it is now, never a copy.** Every open reads the run's rows again (`trials.one`), so
a step added while the run is going, a problem fixed by a wave, or a note added shows the next time
the link is opened. Nothing is written out to the workspace.

- Its goal, the tester, how it ended and its numbers; every step with its screenshot, what the
  tester saw, thought and did, and the problems met there, each with how bad it was, what should
  have happened, what did, the suggested fix and where it stands.
- **Never** the owner's other runs, the Fix list, the testers' profiles, the decisions on a problem
  (Fix it, Won't fix) or the owner's talk with Rouh about a problem. A reader has nothing to open
  them with, and the view says so in one line.
- **Read** (`sharing.VIEW`) is all a link anybody can open ever gives, whatever is sent.
- **Edit** (`sharing.EDIT`), for one person it is shared with, lets them add notes to the run's
  problems. A note goes into that problem's discussion on the owner's page, under their address, and
  they see the notes of everybody it is shared with to edit. Rouh does not answer a reader's note, so
  nobody else's questions are paid for by the owner. Decide is not a level here: a testing run has
  no decisions of the owner's to hand over, so asked for, it is edit.
- **Revoked like a task.** Taking it down, or stopping sharing it with a person, works exactly as it
  does for a task, because it is the same row.

The view is Rouh's own markup with every word of the run escaped, served with a policy of its own
(`HEADERS`): no script at all, pictures only from this Rouh, a form only back to it.
"""
from __future__ import annotations

import html
import logging
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

log = logging.getLogger("rouh.trialshare")

#: What every shared testing run's path starts with.
PREFIX = "_trial/"

#: Where the owner reads it.
HOME = "/evolution/testing/"

#: The longest note a reader adds.
NOTE_MAX = 4000

#: What a reader's note is filed as, in a problem's discussion: this and their address.
GUEST = "guest:"

#: Sent with the view. It is Rouh's own markup, so it is not sandboxed the way a workspace page
#: is (`pages.CSP`), which would keep the screenshots from loading for a person signed in: it has
#: no script at all instead, takes pictures from this Rouh only, and posts a note back here only.
HEADERS = {
    "Content-Security-Policy": ("default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; "
                                "form-action 'self'; frame-ancestors 'none'; base-uri 'none'"),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store, private",
}


def is_trial(rel) -> bool:
    """Whether a share's path is a testing run's."""
    return str(rel or "").startswith(PREFIX)


def number_of(rel) -> int | None:
    """The run's number a share names, or None."""
    found = re.fullmatch(re.escape(PREFIX) + r"(\d{1,9})", str(rel or ""))
    return int(found.group(1)) if found else None


def rel_of(number) -> str:
    return PREFIX + str(int(number))


_NAMED = (
    re.compile(r"(?:^|[/\s])evolution/(?:testing|trials)/(\d{1,9})(?:[/?#]|$)", re.I),
    re.compile(r"^_trial/(\d{1,9})$"),
    re.compile(r"^(?:testing\s+run|test\s+run|trial|try)\s*#?\s*(\d{1,9})$", re.I),
)


def named(text) -> int | None:
    """The testing run a tool was handed, or None when it names none: its address on Rouh
    (`/evolution/testing/63`, whole or not), "testing run 63", "test run 63", "trial 63" or the
    share's own path. A bare number is a task's, never a run's."""
    said = " ".join(str(text or "").split())
    for pattern in _NAMED:
        found = pattern.search(said)
        if found:
            return int(found.group(1))
    return None


def _trials():
    from rouh import trials

    return trials


class _Whose:
    """The owner a share belongs to, as `rouh/trials/` scopes every row."""

    def __init__(self, user_id, org_id):
        self.user_id, self.org_id = str(user_id), str(org_id)


def owner_of(share: dict) -> _Whose:
    return _Whose(share["owner_id"], share["org_id"])


def title_of(t: dict) -> str:
    """How the run is named wherever it is shared: "Testing run 63: Vesela on <what was tried>"."""
    on = t.get("job_name") or t.get("subject") or "a page of Rouh"
    return f"Testing run {t['number']}: {t.get('persona_name') or 'a tester'} on {on}"[:200]


def shareable(who, rel: str) -> tuple[str, str]:
    """The run `rel` names and what it is called, or `pages.Refused` saying why not: only one of
    the owner's own runs, asked by organisation and account together."""
    from rouh import pages

    number = number_of(rel)
    if number is None or who is None:
        raise pages.Refused("There is no testing run there to share.")
    trials = _trials()
    try:
        t = trials.trial_dict(trials._trial(who, number))
    except trials.Refused:
        raise pages.Refused(f"There is no testing run {number}.") from None
    return rel_of(number), title_of(t)


def read(share: dict) -> dict:
    """The run a share names, whole and as it is now, or `pages.Missing`."""
    from rouh import pages

    number = number_of(share.get("rel"))
    trials = _trials()
    try:
        return trials.one(owner_of(share), number)
    except trials.Refused:
        raise pages.Missing("That testing run is not there any more.") from None


def shot(share: dict, step) -> Path | None:
    """One step's screenshot of the run a share names, or None."""
    trials = _trials()
    try:
        return trials.shot_path(owner_of(share), number_of(share.get("rel")), int(step))
    except (trials.Refused, ValueError, TypeError):
        return None


def note(share: dict, email: str, problem: int, text: str) -> None:
    """A reader's note on one of the run's problems, into its discussion. `trials.Refused` when
    the problem is not one this run met, or there is nothing to say."""
    trials = _trials()
    text = str(text or "").strip()[:NOTE_MAX]
    if not text:
        raise trials.Refused("Write something first.")
    d = read(share)
    if int(problem) not in {f["number"] for f in d.get("found") or []}:
        raise trials.Refused("That problem is not one this testing run met.")
    owner = owner_of(share)
    p = trials._problem(owner, int(problem))
    trials._m().TrialNote.objects.create(org_id=owner.org_id, user_id=owner.user_id, problem_id=p.id,
                                         who=GUEST + str(email or "")[:254], kind="said", text=text,
                                         at=trials._now())
    log.info("trialshare: a note on problem %s of run %s from a person it is shared with",
             problem, d["number"])


def noted_by(who: str) -> str:
    """Whose a note in a discussion is, for a line of text: a reader's address, or ""."""
    who = str(who or "")
    return who[len(GUEST):] if who.startswith(GUEST) else ""


# --- the view ------------------------------------------------------------------------------

_RESULT = {"passed": "Passed", "failed": "Did not pass", "running": "Trying now",
           "queued": "Waiting to start", "broken": "Could not finish"}
_MANAGED = {"yes": "Yes", "partly": "Partly", "no": "No"}
_BAD = {"blocked": "Couldn't continue", "confused": "Confused the tester",
        "annoyed": "Annoyed the tester", "minor": "Small"}
_STAND = {"open": "Not fixed yet", "decided": "Chosen to fix", "fixed": "Fixed",
          "set_aside": "Won't fix"}


def _e(text) -> str:
    return html.escape("" if text is None else str(text))


def _day(t) -> str:
    try:
        return datetime.fromtimestamp(float(t)).strftime("%-d %b %Y, %H:%M") if t else ""
    except (TypeError, ValueError, OSError):
        return ""


def _minutes(seconds) -> str:
    m = round((seconds or 0) / 60)
    return "under a minute" if m < 1 else f"{m} min"


def _problem(f: dict, notes: list[dict] | None, base: str, can_note: bool, csrf: str,
             told: str = "") -> str:
    bad = f.get("how_bad") or "minor"
    stand = f.get("standing") or "open"
    rows = []
    for key, label in (("expected", "What should have happened"), ("actual", "What happened"),
                       ("fix", "Suggested fix")):
        if f.get(key):
            rows.append(f"<dt>{label}</dt><dd>{_e(f[key])}</dd>")
    quote_ = f'<blockquote>&ldquo;{_e(f["quote"])}&rdquo;</blockquote>' if f.get("quote") else ""
    talk = ""
    if notes is not None:
        said = "".join(
            f'<li><span class="tn-who">{_e(noted_by(n["who"]))} &middot; {_e(_day(n["at"]))}</span>'
            f'<p>{_e(n["text"])}</p></li>'
            for n in notes if n.get("kind") == "said" and noted_by(n.get("who")))
        form = ""
        if can_note:
            fid = f"tn-{int(f['number'])}"
            form = (f'<form class="tn-form" method="post" action="{_e(base)}/note">'
                    f'<input type="hidden" name="csrfmiddlewaretoken" value="{_e(csrf)}">'
                    f'<input type="hidden" name="problem" value="{int(f["number"])}">'
                    f'<label for="{fid}">Your note on this problem</label>'
                    f'<textarea id="{fid}" name="text" rows="3" maxlength="{NOTE_MAX}" required '
                    f'placeholder="How you see it, or what you would do"></textarea>'
                    f'<button type="submit">Add note</button></form>')
        talk = ((f'<ol class="tn-list">{said}</ol>' if said else "") + form) if (said or form) else ""
    if told:
        # What became of the note they just added, beside the box they added it in.
        talk += f'<p class="said" role="status">{_e(told)}</p>'
    local = f"#{f['local']}" if f.get("local") else f"Problem {f['number']}"
    return (f'<li class="tp" id="problem-{int(f["number"])}">'
            f'<div class="tp-head"><span class="tp-num">{_e(local)}</span>'
            f'<span class="tag" data-bad="{_e(bad)}"><span class="shape" aria-hidden="true"></span>'
            f'{_e(_BAD.get(bad, bad))}</span>'
            f'<span class="tag stand" data-stand="{_e(stand)}">{_e(_STAND.get(stand, stand))}</span></div>'
            f'<p class="tp-what">{_e(f.get("what"))}</p>{quote_}'
            + (f'<dl>{"".join(rows)}</dl>' if rows else "") + talk + "</li>")


def view(share: dict, base: str, *, owner: str, can_note: bool = False, home: str = "",
         csrf: str = "", said: str = "", said_at: int = 0) -> bytes:
    """The run a share names, as it is now, for somebody it lets in. `base` is the share's own
    address, `/p/<token>` or `/shared/<token>`, which its screenshots and its notes are under.
    `can_note` is a person it was shared with to edit; `said` is a line to show, such as that their
    note was added: under problem `said_at` when it is one of the run's, else at the top."""
    from rouh import trials

    t = read(share)
    walk = t.get("walk") or []
    found = t.get("found") or []
    at: dict[int, list[dict]] = {}
    for f in found:
        at.setdefault(int(f.get("step") or 0), []).append(f)
    threads: dict[int, list[dict]] = {}
    if can_note:
        for number in {f["number"] for f in found}:
            try:
                threads[number] = trials.problem(owner_of(share), number).get("thread") or []
            except trials.Refused:
                threads[number] = []
    name = t.get("persona_name") or "the tester"
    going = t.get("state") in ("queued", "running")

    def problems(fs):
        return ('<ol class="tps">' + "".join(
            _problem(f, threads.get(f["number"]) if can_note else None, base, can_note, csrf,
                     said if said_at and f["number"] == said_at else "")
            for f in fs) + "</ol>") if fs else ""

    facts = "" if going else "".join(
        f'<div class="fact"><b>{_e(v)}</b><span>{_e(k)}</span></div>' for v, k in (
            (t.get("steps") or 0, "steps"),
            (t.get("found_n") or 0, "problems found" + (f", {t['open']} not fixed" if t.get("open") else "")),
            (_minutes(t.get("seconds")), "time it took"),
            (_MANAGED.get(t.get("managed") or "", "-"), "managed it?"),
            (_RESULT.get(t.get("state") or "", "-") if t.get("mode") != "review"
             else len(t.get("waves") or []), "the result" if t.get("mode") != "review" else "waves of fixes")))
    over = [f'<p class="goal">&ldquo;{_e(t.get("goal"))}&rdquo;</p>']
    if facts:
        over.append(f'<div class="facts">{facts}</div>')
    if going:
        over.append(f'<p class="banner">{_e(name)} is trying it now. Open this link again to see '
                    'the steps taken since.</p>')
    if t.get("state") == "broken":
        over.append(f'<p class="banner">This testing run could not finish, so there is no report: '
                    f'{_e(t.get("why") or "something went wrong.")}</p>')
    if t.get("nearly_gave_up"):
        over.append(f'<h2 class="tsub">Where {_e(name)} nearly gave up</h2>'
                    f'<p>{_e(t["nearly_gave_up"])}</p>')
    if t.get("ending"):
        over.append(f'<h2 class="tsub">Conclusive words</h2>'
                    f'<blockquote class="last">&ldquo;{_e(t["ending"])}&rdquo;</blockquote>')

    steps = []
    for s in walk:
        n = int(s["n"])
        pic = (f'<a class="shot" href="{_e(base)}/shot/{n}"><img loading="lazy" '
               f'src="{_e(base)}/shot/{n}" alt="What {_e(name)} saw at step {n}"></a>'
               if s.get("shot") else "")
        lines = "".join(f"<dt>{k}</dt><dd>{_e(s.get(v))}</dd>" for k, v in
                        (("Saw", "see"), ("Thought", "think"), ("Did", "does")) if s.get(v))
        title = s.get("name") or s.get("title") or f"Step {n}"
        steps.append(f'<li class="step" id="step-{n}"><h3><span class="snum">Step {n}</span> '
                     f'{_e(title)}</h3>'
                     + (f'<p class="screen">{_e(s.get("screen"))}</p>' if s.get("screen") else "")
                     + f'<div class="sgrid">{pic}<dl>{lines}</dl></div>{problems(at.get(n, []))}</li>')
    whole = at.get(0, [])
    if whole:
        steps.append('<li class="step" id="step-whole"><h3>About the whole run</h3>'
                     f'{problems(whole)}</li>')
    body = ("".join(steps) and f'<ol class="steps">{"".join(steps)}</ol>') or \
        f'<p class="none">{"No steps yet." if going else "No steps were kept."}</p>'
    may = ("you can add notes to its problems" if can_note else "read only")
    top = (f'<p class="shared-by">Shared by {_e(owner or "somebody")} &middot; {may}'
           + (f' &middot; <a href="{_e(home)}">Everything shared with you</a>' if home else "")
           + "</p>")
    head = (f'<header class="ohead"><h1>Testing run {int(t["number"])}: {_e(name)}, a made-up tester, on '
            f'{_e(t.get("job_name") or t.get("subject") or "a page of Rouh")}</h1>'
            f'<p class="when">{_e(trials.MODE_NAMES.get(t.get("mode") or "auto", ""))}, '
            f'{_e(_day(t.get("created_at")))}</p></header>')
    placed = bool(said_at) and said_at in {f["number"] for f in found}
    note = f'<p class="said" role="status">{_e(said)}</p>' if said and not placed else ""
    rest = ('<p class="osaid">Only this testing run is shared: its steps, its screenshots and the '
            'problems it met. The owner\'s other runs, their decisions and their talk with Rouh are '
            'not.</p>')
    page = (top + note + head + "".join(over) + '<h2 class="divider">Step by step</h2>' + body
            + rest + f"<style>{_STYLE}</style>")
    return _shell(page, title_of(t))


def _shell(body: str, title: str) -> bytes:
    """The page around the run: the task page's own sheets (`taskbrowser.css`), and no script at all,
    which `HEADERS` holds it to. Not `objectindex._shell`, which adds the scripts its pages need."""
    from rouh import objectindex

    sheets = (objectindex._asset(objectindex.MENU_SHEET) + objectindex._asset(objectindex.LABELS_SHEET)
              + objectindex._asset(objectindex.SHEET))
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<link rel="icon" href="data:,">'
            f"<title>{html.escape(title)}</title><style>{sheets}</style></head>"
            f"<body>{body}</body></html>").encode()


#: The run's own parts, on top of the task page's look (`taskbrowser.css`), in its tokens.
_STYLE = """
body{max-width:980px;margin:0 auto}
.shared-by{margin:0 0 14px;font-size:12.5px;color:var(--subtle)}
.shared-by a,.said a{color:var(--primary)}
.tp .said{margin:10px 0 0}
.said{margin:0 0 14px;padding:10px 14px;border:1px solid var(--border-strong);border-radius:10px;
background:var(--surface);font-size:14px}
.ohead h1{font-size:24px;line-height:1.25;margin:4px 0 0;overflow-wrap:anywhere}
.when{margin:6px 0 0;font-size:13.5px;color:var(--subtle)}
.goal{font-size:18px;line-height:1.45;margin:6px 0 16px;color:var(--copy)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:0 0 18px}
.fact{border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--surface)}
.fact b{display:block;font-size:20px;font-weight:650}
.fact span{font-size:12.5px;color:var(--muted)}
.tsub{font-size:15px;margin:18px 0 4px}
.last,.tp blockquote{margin:6px 0 10px;padding:0 0 0 12px;border-left:2px solid var(--border-strong);
color:var(--muted);font-style:italic}
.banner{padding:10px 14px;border:1px solid var(--warn-line);background:var(--warn-bg);border-radius:10px}
.divider{margin-top:26px}
.steps{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.step{border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--panel)}
.step h3{margin:0;font-size:16px;line-height:1.35;overflow-wrap:anywhere}
.snum{font-family:var(--mono);font-size:11px;color:var(--muted);margin-right:6px}
.screen{margin:2px 0 10px;font-family:var(--mono);font-size:11.5px;color:var(--subtle);overflow-wrap:anywhere}
.sgrid{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:14px;align-items:start}
.sgrid dl,.tp dl{margin:0;display:grid;gap:4px}
dt{font-size:11.5px;font-weight:650;color:var(--subtle);text-transform:uppercase;letter-spacing:.06em}
dd{margin:0 0 6px;overflow-wrap:anywhere}
.shot{display:block;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg)}
.shot img{display:block;width:100%;height:auto}
.shot:focus-visible,a:focus-visible,button:focus-visible,textarea:focus-visible{outline:2px solid var(--primary);
outline-offset:2px}
.tps{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:10px}
.tp{border:1px solid var(--border-strong);border-radius:10px;padding:12px;background:var(--surface)}
.tp-head{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center}
.tp-num{font-family:var(--mono);font-size:12px;color:var(--muted)}
.tp-what{margin:6px 0;font-weight:600;overflow-wrap:anywhere}
.tag{display:inline-flex;align-items:center;gap:6px;font-size:12px;border:1px solid var(--border-strong);
border-radius:999px;padding:2px 9px;color:var(--muted)}
.shape{width:9px;height:9px;background:var(--muted);flex:none}
.tag[data-bad=blocked]{color:var(--cat-rose)}.tag[data-bad=blocked] .shape{background:var(--cat-rose)}
.tag[data-bad=confused]{color:var(--cat-amber)}
.tag[data-bad=confused] .shape{background:var(--cat-amber);border-radius:50%}
.tag[data-bad=annoyed]{color:var(--cat-violet)}
.tag[data-bad=annoyed] .shape{background:var(--cat-violet);transform:rotate(45deg) scale(.85)}
.tag[data-bad=minor] .shape{border-radius:2px;height:4px}
.tag.stand[data-stand=fixed]{color:var(--cat-green)}
.tn-list{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}
.tn-list li{border-top:1px solid var(--border);padding-top:8px}
.tn-list p{margin:2px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
.tn-who{font-size:12px;color:var(--subtle)}
.tn-form{display:grid;gap:6px;margin-top:10px}
.tn-form label{font-size:12.5px;color:var(--muted)}
.tn-form textarea{font:inherit;color:var(--copy);background:var(--bg);border:1px solid var(--border-strong);
border-radius:8px;padding:8px 10px;min-height:44px;resize:vertical}
.tn-form button{justify-self:start;min-height:44px;padding:0 16px;border-radius:999px;border:0;
background:var(--primary);color:var(--on-fg);font-weight:650;cursor:pointer}
.osaid{margin:22px 0 0;font-size:12.5px;color:var(--subtle);max-width:70ch}
.none{color:var(--subtle)}
@media (max-width:640px){.sgrid{grid-template-columns:minmax(0,1fr)}.ohead h1{font-size:20px}
.shot{max-width:260px}}
"""


# --- as text, for read_rouh_link and the tools ----------------------------------------------


def as_text(who, number) -> str:
    """One testing run as text, for Rouh reading its own address: what was tried, how it ended,
    every step and every problem. `trials.Refused` when the speaker has no such run."""
    trials = _trials()
    t = trials.one(who, number)
    name = t.get("persona_name") or "the tester"
    out = [title_of(t),
           f"{trials.MODE_NAMES.get(t.get('mode') or 'auto', '')}, {_day(t.get('created_at'))}. "
           f"Result: {_RESULT.get(t.get('state') or '', t.get('state'))}. Managed it: "
           f"{_MANAGED.get(t.get('managed') or '', '-')}. {t.get('steps') or 0} steps, "
           f"{t.get('found_n') or 0} problems found, {t.get('open') or 0} not fixed, {_minutes(t.get('seconds'))}.",
           f"Goal: {t.get('goal')}"]
    if t.get("nearly_gave_up"):
        out.append(f"Where {name} nearly gave up: {t['nearly_gave_up']}")
    if t.get("ending"):
        out.append(f"Conclusive words: {t['ending']}")
    if t.get("why"):
        out.append(f"Why: {t['why']}")
    at: dict[int, list[dict]] = {}
    for f in t.get("found") or []:
        at.setdefault(int(f.get("step") or 0), []).append(f)

    def probs(fs):
        return [f"  - {'#' + str(f['local']) if f.get('local') else 'Problem ' + str(f['number'])} "
                f"(problem {f['number']}, {_BAD.get(f.get('how_bad'), f.get('how_bad'))}, "
                f"{_STAND.get(f.get('standing'), f.get('standing'))}): {f.get('what')}"
                + (f" Expected: {f['expected']}" if f.get("expected") else "")
                + (f" Happened: {f['actual']}" if f.get("actual") else "")
                + (f" Fix: {f['fix']}" if f.get("fix") else "") for f in fs]
    out.append("")
    out.append("Step by step:")
    for s in t.get("walk") or []:
        out.append(f"Step {s['n']}, {s.get('name') or s.get('title') or ''} ({s.get('screen') or ''}): "
                   f"saw: {s.get('see') or '-'} | thought: {s.get('think') or '-'} | did: {s.get('does') or '-'}")
        out += probs(at.get(int(s["n"]), []))
    if at.get(0):
        out.append("About the whole run:")
        out += probs(at[0])
    return "\n".join(out)


def readable(who, number) -> list[tuple[str, str]]:
    """What sharing it would put out, as (text, where) pairs for `sharing.sensitive_text`."""
    t = _trials().one(who, number)
    pairs = [(" ".join(str(t.get(k) or "") for k in ("goal", "ending", "nearly_gave_up", "why")),
              "its summary")]
    for s in t.get("walk") or []:
        pairs.append((" ".join(str(s.get(k) or "") for k in ("see", "think", "does", "screen")),
                      f"step {s['n']}"))
    for f in t.get("found") or []:
        pairs.append((" ".join(str(f.get(k) or "") for k in ("what", "quote", "expected", "actual", "fix")),
                      f"problem {f['number']}"))
    return pairs


def address(number) -> str:
    """The owner's own page of the run."""
    return HOME + quote(str(int(number)))
