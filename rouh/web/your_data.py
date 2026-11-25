"""Your data, in plain formats, in one zip, over the web (`rouh/data_export.py`, `landaccountpage.js`).

    GET /api/your-data/export   the zip, made now and handed over as a download, then deleted from the
                                machine. An administrator's: its chats and tasks are the whole Rouh's.
"""
from __future__ import annotations

import asyncio
import os

from django.http import HttpRequest, HttpResponseNotAllowed, StreamingHttpResponse

from rouh import data_export

from .comments import NO_STORE
from .common import refuse, who


async def export(request: HttpRequest):
    me = await asyncio.to_thread(who, request)
    if me is None:
        return refuse("Sign in to Rouh first.", 401)
    if request.method != "GET":
        return HttpResponseNotAllowed(["GET"])
    if not getattr(me, "is_admin", False):
        return refuse("Only an administrator of this Rouh downloads its data.", 403)
    try:
        path = await asyncio.to_thread(data_export.make, me)
    except data_export.Refused as exc:
        return refuse(str(exc), 403)
    name = await asyncio.to_thread(data_export.file_name, me)
    size = os.path.getsize(path)

    async def chunks():
        handle = await asyncio.to_thread(open, path, "rb")
        try:
            while True:
                part = await asyncio.to_thread(handle.read, 1 << 20)
                if not part:
                    break
                yield part
        finally:
            await asyncio.to_thread(handle.close)
            try:
                os.unlink(path)
            except OSError:
                pass

    response = StreamingHttpResponse(chunks(), content_type="application/zip")
    response["Content-Length"] = str(size)
    response["Content-Disposition"] = f'attachment; filename="{name}"'
    response["X-Content-Type-Options"] = "nosniff"
    for k, v in NO_STORE.items():
        response[k] = v
    return response
