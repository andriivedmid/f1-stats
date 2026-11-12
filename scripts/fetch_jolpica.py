#!/usr/bin/env python3
"""Fetch modern F1 seasons from the Jolpica (Ergast-compatible) API.

Caches merged JSON per season/type in scripts/api_cache/.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import time
from pathlib import Path

import requests

API = "https://api.jolpi.ca/ergast/f1"
ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "api_cache"
SEASONS = list(range(1980, 2027))
TYPES = {
    "results": "/{season}/results.json",
    "qualifying": "/{season}/qualifying.json",
    "sprint": "/{season}/sprint.json",
    "calendar": "/{season}.json",
    "driverstandings": "/{season}/driverstandings.json",
    "constructorstandings": "/{season}/constructorstandings.json",
}
# Only these types use paginated RaceTable / StandingsTable payloads.
PAGINATED = {"results", "qualifying", "sprint"}


def get(url: str, tries: int = 6):
    for attempt in range(1, tries + 1):
        try:
            r = requests.get(url, timeout=40, headers={"User-Agent": "f1-stats/1.0"})
            if r.ok:
                return r.json()["MRData"]
            print(f"  {r.status_code} {url}", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            print(f"  {exc}", file=sys.stderr)
        time.sleep(1.5 * attempt)
    return None


def fetch_type(season: int, kind: str) -> dict | None:
    path = TYPES[kind].format(season=season)
    url = API + path + "?limit=100"
    first = get(url)
    if first is None:
        return None
    if kind not in PAGINATED:
        return first
    total = int(first.get("total") or 0)
    list_key = {"results": "Results", "qualifying": "QualifyingResults", "sprint": "SprintResults"}[kind]
    by_round: dict[str, dict] = {}
    pages = max(1, math.ceil(total / 100))

    def merge(page_data):
        for race in page_data.get("RaceTable", {}).get("Races", []):
            rnd = race.get("round")
            if rnd not in by_round:
                by_round[rnd] = race
            else:
                by_round[rnd].setdefault(list_key, []).extend(race.get(list_key, []))

    merge(first)
    for page in range(1, pages):
        page_data = get(API + path + f"?limit=100&offset={page * 100}")
        if page_data:
            merge(page_data)
        time.sleep(0.4)
    races = [by_round[k] for k in sorted(by_round, key=lambda x: int(x))]
    first["RaceTable"] = {**(first.get("RaceTable") or {}), "Races": races}
    first["total"] = str(len(races))
    return first


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--from", dest="start", type=int, default=min(SEASONS))
    ap.add_argument("--to", dest="end", type=int, default=max(SEASONS))
    args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)

    seasons = [s for s in SEASONS if args.start <= s <= args.end]
    failed = []
    for season in seasons:
        for kind in TYPES:
            if kind == "sprint" and season < 2021:
                continue
            if kind == "qualifying" and season < 1994:
                continue
            out = CACHE / f"{season}_{kind}.json"
            if out.exists() and out.stat().st_size > 500 and not args.refresh:
                print(f"cached {season} {kind}")
                continue
            print(f"fetch  {season} {kind}")
            data = fetch_type(season, kind)
            if data is None:
                print(f"  FAILED {season} {kind}", file=sys.stderr)
                failed.append(f"{season} {kind}")
                continue
            out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            time.sleep(0.35)
    if failed:
        print("failed: " + ", ".join(failed), file=sys.stderr)
        return 1
    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
