"""CONTAINERS.md: the spending limit (`rouh/spending_limit.py`).

What the owner sees and does on What the models cost, through the same API its Spending limit box
uses: today's and this month's cost against the limits, a limit changed, a chat turn refused in
plain words once today is over it, Allow more today letting the chat answer again, and the limit
put back as it was so the checks after this one are not stopped by it.
"""
from __future__ import annotations

from smoke import Stack, check, expect

from checks_tools import post


@check("gene.spending-limit")
def spending_limit(s: Stack) -> None:
    import json

    code, body, _ = s.get("/api/usage/limit")
    expect(code == 200, f"/api/usage/limit answered {code}: {body[:200]}")
    was = json.loads(body)
    for key in ("today", "month", "daily", "monthly", "state", "set"):
        expect(key in was, f"the limit says no {key}: {body[:300]}")
    s.say("Hello before the spending limit")          # something spent today, at the stand-in's price
    code, got = post(s, "/api/usage/limit", {"daily": 0.01, "monthly": 0})
    expect(code == 200, f"changing the limit answered {code}: {got}")
    try:
        if got.get("state") != "reached":
            return  # the stand-in's price was under a cent: nothing to stop at, and nothing broken
        _, seen = s.say("Hello past the spending limit")
        said = " ".join(str(m.get("message") or "") for m in seen if m.get("type") == "error")
        expect("spending limit" in said, f"a turn past the limit was not refused in words: {said[:300]}")
        code, got = post(s, "/api/usage/limit", {"more": 5})
        expect(code == 200 and got.get("state") == "ok" and got.get("extra") == 5,
               f"Allow more today did not let it go on: {code} {got}")
        text, _ = s.say("Hello after allowing more")
        expect("I received" in text, f"the turn after Allow more was not answered: {text[:300]}")
    finally:
        held = was.get("set") or {}
        post(s, "/api/usage/limit", {"daily": held.get("daily", 20), "monthly": held.get("monthly", 300)})
