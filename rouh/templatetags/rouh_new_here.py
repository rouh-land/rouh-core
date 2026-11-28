"""``{% new_here_signin %}``: Caps Lock is on, and Show the password, on the pages in front of the
sign-in (`rouh/new_here.py`, night 57).

It draws nothing while both switches are off; while either is on, a small script of its own
(`rouh/static/new_here_signin.js`) and which are on. Nobody is signed in on these pages, so the
switches read are the install's own.
"""
import json

from django import template
from django.utils.safestring import mark_safe

from rouh.web.assets import address

register = template.Library()


@register.simple_tag
def new_here_signin() -> str:
    from rouh import new_here

    on = new_here.for_signin()
    if not on:
        return ""
    data = json.dumps({"on": on}).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return mark_safe(f'<script type="application/json" id="rouhNewHereSignin">{data}</script>\n'
                     f'<script src="{address("new_here_signin.js")}" defer></script>')
