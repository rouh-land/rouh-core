"""A stand-in for the public sources the watch list looks titles up in (`rouh/watchlist.py`).

IMDb's search suggestions, TVmaze, Wikidata's query service and Wikipedia's page summaries, all at
once, with a few made-up titles, so a world can add a title by picking a match and watch its poster,
seasons and details arrive with nothing reaching the network. Point a world at it with
``ROUH_TEST_WATCH_LOOKUP=http://127.0.0.1:<port>`` (the harness hands it on as ``ROUH_WATCH_LOOKUP``).

    python -m rouh.testing.fake_watch 18471

Every title here is made up. ``GET /_asked`` says every request it answered, oldest first.
"""
from __future__ import annotations

import json
import struct
import sys
import urllib.parse
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

#: The made-up titles: an IMDb-style number, its kind, and what each source says about it.
TITLES = [
    {"id": "tt9000001", "l": "Harbour Lights", "qid": "tvSeries", "y": 2021, "yr": "2021-2024",
     "s": "Mara Example, Teo Sample", "tvmaze": 9001, "type": "Scripted", "genres": ["Drama", "Mystery"],
     "runtime": 52, "rating": 7.8, "web": "Netflix", "seasons": [(1, "", 8, 2021), (2, "", 8, 2022), (3, "The Storm", 6, 2024)],
     "summary": "<p>A harbour town keeps its secrets until the lighthouse goes dark.</p>", "colour": (40, 90, 140)},
    {"id": "tt9000002", "l": "The Long Orbit", "qid": "movie", "y": 2019, "s": "Ines Placeholder",
     "runtime": 128, "genres": ["science fiction film", "drama film"], "wiki": "The_Long_Orbit",
     "extract": "The Long Orbit is a 2019 film about a crew that cannot come home.", "colour": (120, 60, 30)},
    {"id": "tt9000003", "l": "The Long Orbit", "qid": "tvMiniSeries", "y": 2023, "yr": "2023-2023",
     "s": "Ana Fictive", "tvmaze": 9003, "type": "Documentary", "genres": ["History"], "runtime": 44,
     "rating": None, "web": "", "net": "Example TV", "seasons": [(1, "", 4, 2023)],
     "summary": "<p>A documentary about the mission behind the film.</p>", "colour": (60, 120, 80)},
    {"id": "tt9000004", "l": "Small Hours", "qid": "movie", "y": 2025, "s": "Pat Sample", "runtime": 94,
     "genres": ["comedy film"], "wiki": "Small_Hours", "extract": "A comedy set in one night.",
     "colour": (150, 40, 90)},
]

ASKED: list[str] = []


def _png(rgb) -> bytes:
    """A small poster: 120 by 180, the title's colour with a lighter band."""
    w, h = 120, 180
    rows = []
    for y in range(h):
        band = 60 <= y < 90
        r, g, b = (min(255, c + 70) for c in rgb) if band else rgb
        rows.append(b"\x00" + bytes((r, g, b)) * w)
    raw = b"".join(rows)

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet
        pass

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802 - the standard library's name
        url = urllib.parse.urlsplit(self.path)
        path, q = url.path, urllib.parse.parse_qs(url.query)
        ASKED.append(self.path)
        base = f"http://{self.headers.get('Host')}"
        if path == "/_asked":
            return self._json(ASKED)
        if path.startswith("/imdb/suggestion/x/") and path.endswith(".json"):
            words = urllib.parse.unquote(path[len("/imdb/suggestion/x/"):-5]).lower()
            hits = [t for t in TITLES if words and (words in t["l"].lower() or t["l"].lower().startswith(words))]
            return self._json({"d": [{"id": t["id"], "l": t["l"], "qid": t["qid"], "y": t["y"], "yr": t.get("yr"),
                                      "s": t["s"], "i": {"imageUrl": f"{base}/posters/{t['id']}._V1_.png"}}
                                     for t in hits], "q": words})
        if path.startswith("/posters/"):
            tid = path[len("/posters/"):].split(".")[0]
            t = next((t for t in TITLES if t["id"] == tid), None)
            if t is None:
                return self._json({"error": "none"}, 404)
            body = _png(t["colour"])
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return None
        shows = {t["tvmaze"]: t for t in TITLES if t.get("tvmaze")}

        def show(t):
            first = t["seasons"][0][3]
            return {"id": t["tvmaze"], "name": t["l"], "type": t["type"], "genres": t["genres"],
                    "premiered": f"{first}-01-10", "ended": f"{t['seasons'][-1][3]}-12-01",
                    "averageRuntime": t["runtime"], "rating": {"average": t.get("rating")},
                    "webChannel": {"name": t["web"]} if t.get("web") else None,
                    "network": {"name": t["net"]} if t.get("net") else None,
                    "officialSite": "https://example.test/watch" if t.get("web") else None,
                    "summary": t["summary"], "externals": {"imdb": t["id"]},
                    "image": {"medium": f"{base}/posters/{t['id']}.png", "original": f"{base}/posters/{t['id']}.png"}}

        if path == "/tvmaze/search/shows":
            words = (q.get("q") or [""])[0].lower()
            return self._json([{"score": 1, "show": show(t)} for t in shows.values() if words in t["l"].lower()])
        if path == "/tvmaze/lookup/shows":
            t = next((t for t in shows.values() if t["id"] == (q.get("imdb") or [""])[0]), None)
            return self._json(show(t)) if t else self._json(None, 404)
        if path.startswith("/tvmaze/shows/"):
            parts = path.split("/")
            t = shows.get(int(parts[3])) if parts[3].isdigit() else None
            if t is None:
                return self._json(None, 404)
            if len(parts) > 4 and parts[4] == "seasons":
                return self._json([{"number": n, "name": name, "episodeOrder": eps, "premiereDate": f"{y}-02-01"}
                                   for n, name, eps, y in t["seasons"]])
            return self._json(show(t))
        if path == "/wikidata/sparql":
            query = (q.get("query") or [""])[0]
            t = next((t for t in TITLES if f'"{t["id"]}"' in query), None)
            rows = []
            if t:
                for g in t["genres"]:
                    row = {"genreLabel": {"value": g}}
                    if t.get("runtime") and t["qid"] == "movie":
                        row["duration"] = {"value": str(t["runtime"])}
                    if t.get("wiki"):
                        row["article"] = {"value": f"https://en.wikipedia.org/wiki/{t['wiki']}"}
                    rows.append(row)
            return self._json({"results": {"bindings": rows}})
        if path.startswith("/wikipedia/api/rest_v1/page/summary/"):
            name = path.rsplit("/", 1)[-1]
            t = next((t for t in TITLES if t.get("wiki") == name), None)
            return self._json({"extract": t["extract"]}) if t else self._json({}, 404)
        return self._json({"error": "not here"}, 404)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18471
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
