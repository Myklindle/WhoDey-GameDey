#!/usr/bin/env python3
"""Find the Bengals' newest press conferences and highlights video and write press.json.
Reads the team's public YouTube Videos tab (no API key). If the lookup fails the
previous press.json is kept. press.json is rewritten only when the list changes,
so the workflow only commits when there is something new.
Usage: python3 scripts/update_press.py
"""
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "press.json")
CHANNEL = "UCnQUpSnJ39KsjZKbT0CprHQ"  # Cincinnati Bengals
MAX_PRESS = 12
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Cookie": "CONSENT=YES+cb; SOCS=CAI",
}
HIGHLIGHTS = re.compile(r"highlights\s+vs", re.I)
PRESS = re.compile(r"press conference", re.I)


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def initial_data(html):
    marker = "var ytInitialData = "
    start = html.find(marker)
    if start < 0:
        raise RuntimeError("ytInitialData not found (page layout changed or blocked)")
    data, _ = json.JSONDecoder().raw_decode(html[start + len(marker):])
    return data


def videos(node):
    """Yield (video_id, title) in page order from both old and new layouts."""
    stack = [node]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            if cur.get("contentType") == "LOCKUP_CONTENT_TYPE_VIDEO" and "contentId" in cur:
                meta = cur.get("metadata", {}).get("lockupMetadataViewModel", {})
                title = meta.get("title", {}).get("content")
                if title:
                    yield cur["contentId"], title
                continue
            if "videoId" in cur and isinstance(cur.get("title"), dict):
                runs = cur["title"].get("runs") or []
                title = runs[0].get("text") if runs else cur["title"].get("simpleText")
                if title:
                    yield cur["videoId"], title
                continue
            stack.extend(reversed(list(cur.values())))
        elif isinstance(cur, list):
            stack.extend(reversed(cur))


def pick(found):
    """Newest highlights video first, then up to MAX_PRESS press conferences."""
    seen, highlights, press = set(), [], []
    for vid, title in found:
        if vid in seen:
            continue
        seen.add(vid)
        if HIGHLIGHTS.search(title) and not highlights:
            highlights.append({"videoId": vid, "title": title, "kind": "highlights"})
        elif PRESS.search(title) and len(press) < MAX_PRESS:
            press.append({"videoId": vid, "title": title, "kind": "press"})
    return highlights + press


def main():
    try:
        with open(OUT, encoding="utf-8") as fh:
            current = json.load(fh)
    except (OSError, ValueError):
        current = {}
    changed = False
    try:
        html = fetch("https://www.youtube.com/channel/%s/videos" % CHANNEL)
        items = pick(videos(initial_data(html)))
        if not items:
            raise RuntimeError("no press conferences or highlights found")
        if items != current.get("items"):
            with open(OUT, "w", encoding="utf-8") as fh:
                json.dump({"items": items}, fh, indent=2, ensure_ascii=False)
                fh.write("\n")
            changed = True
        print("press.json: %d items%s" % (len(items), " (updated)" if changed else " (unchanged)"))
    except Exception as err:  # keep the old list on any failure
        print("press lookup failed, keeping previous list: %s" % err, file=sys.stderr)
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as fh:
            fh.write("changed=%s\n" % ("true" if changed else "false"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
