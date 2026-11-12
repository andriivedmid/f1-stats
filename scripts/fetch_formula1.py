#!/usr/bin/env python3
"""Fetch Formula 1 results from formula1.com and cache them for the site.

The official results pages are server-rendered. This script reads the tables
from those pages and writes Ergast-shaped JSON into
``scripts/api_cache/formula1/`` so ``build_data.py`` can consume it unchanged.

Examples:
    python3 scripts/fetch_formula1.py --from 2026 --to 2026 --refresh
    python3 scripts/fetch_formula1.py --all
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "api_cache"
OUTDIR = CACHE / "formula1"
BASE = "https://www.formula1.com/en/results"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
    ),
    "Accept-Language": "en-GB,en;q=0.9",
}

MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}

ADJ_TO_ISO = {
    "British": "GBR", "Italian": "ITA", "Spanish": "ESP", "Finnish": "FIN",
    "French": "FRA", "Dutch": "NED", "Australian": "AUS", "Mexican": "MEX",
    "Canadian": "CAN", "Brazilian": "BRA", "Japanese": "JPN", "Thai": "THA",
    "Monegasque": "MON", "Austrian": "AUT", "Swiss": "SUI", "Belgian": "BEL",
    "Russian": "RUS", "Danish": "DEN", "Swedish": "SWE", "New Zealander": "NZL",
    "Argentine": "ARG", "American": "USA", "Portuguese": "POR", "Polish": "POL",
    "Indonesian": "IDN", "Malaysian": "MAS", "Indian": "IND", "Venezuelan": "VEN",
    "South African": "RSA", "Czech": "CZE", "Hungarian": "HUN", "Irish": "IRL",
    "Chinese": "CHN", "Colombian": "COL", "Chilean": "CHI", "Uruguayan": "URU",
    "German": "GER", "Korean": "KOR", "Saudi": "SAU", "Emirati": "UAE",
    "Luxembourgish": "LUX", "Moroccan": "MAR",
}

ISO3_TO_ADJ = {
    "GBR": "British", "ITA": "Italian", "ESP": "Spanish", "FIN": "Finnish",
    "FRA": "French", "NED": "Dutch", "AUS": "Australian", "MEX": "Mexican",
    "CAN": "Canadian", "BRA": "Brazilian", "JPN": "Japanese", "THA": "Thai",
    "MON": "Monegasque", "AUT": "Austrian", "SUI": "Swiss", "BEL": "Belgian",
    "RUS": "Russian", "DEN": "Danish", "SWE": "Swedish", "NZL": "New Zealander",
    "ARG": "Argentine", "USA": "American", "POR": "Portuguese", "POL": "Polish",
    "IDN": "Indonesian", "MAS": "Malaysian", "IND": "Indian", "VEN": "Venezuelan",
    "RSA": "South African", "CZE": "Czech", "HUN": "Hungarian", "IRL": "Irish",
    "CHN": "Chinese", "COL": "Colombian", "CHI": "Chilean", "URU": "Uruguayan",
    "GER": "German", "DEU": "German", "KOR": "Korean", "SAU": "Saudi",
    "UAE": "Emirati", "LUX": "Luxembourgish", "MAR": "Moroccan",
}

# Race names for slugs that are not present in the current historical cache.
SLUG_NAMES = {
    "australia": "Australian Grand Prix",
    "china": "Chinese Grand Prix",
    "japan": "Japanese Grand Prix",
    "bahrain": "Bahrain Grand Prix",
    "saudi-arabia": "Saudi Arabian Grand Prix",
    "miami": "Miami Grand Prix",
    "emilia-romagna": "Emilia Romagna Grand Prix",
    "monaco": "Monaco Grand Prix",
    "canada": "Canadian Grand Prix",
    "barcelona-catalunya": "Barcelona-Catalunya Grand Prix",
    "spain": "Spanish Grand Prix",
    "austria": "Austrian Grand Prix",
    "great-britain": "British Grand Prix",
    "belgium": "Belgian Grand Prix",
    "hungary": "Hungarian Grand Prix",
    "netherlands": "Dutch Grand Prix",
    "italy": "Italian Grand Prix",
    "azerbaijan": "Azerbaijan Grand Prix",
    "singapore": "Singapore Grand Prix",
    "united-states": "United States Grand Prix",
    "mexico": "Mexico City Grand Prix",
    "brazil": "Brazilian Grand Prix",
    "las-vegas": "Las Vegas Grand Prix",
    "qatar": "Qatar Grand Prix",
    "abu-dhabi": "Abu Dhabi Grand Prix",
    "sakhir": "Sakhir Grand Prix",
    "styria": "Styrian Grand Prix",
    "tuscany": "Tuscan Grand Prix",
    "eifel": "Eifel Grand Prix",
    "portugal": "Portuguese Grand Prix",
    "turkey": "Turkish Grand Prix",
    "russia": "Russian Grand Prix",
    "vietnam": "Vietnamese Grand Prix",
    "korea": "Korean Grand Prix",
    "india": "Indian Grand Prix",
    "europe": "European Grand Prix",
    "pacific": "Pacific Grand Prix",
    "san-marino": "San Marino Grand Prix",
    "luxembourg": "Luxembourg Grand Prix",
    "sweden": "Swedish Grand Prix",
    "south-africa": "South African Grand Prix",
    "usa-west": "United States Grand Prix West",
    "usa-east": "United States Grand Prix East",
    "caesars-palace": "Caesars Palace Grand Prix",
    "detroit": "Detroit Grand Prix",
    "dallas": "Dallas Grand Prix",
    "switzerland": "Swiss Grand Prix",
    "morocco": "Moroccan Grand Prix",
    "argentina": "Argentine Grand Prix",
    "70th-anniversary": "70th Anniversary Grand Prix",
    "toscana": "Tuscan Grand Prix",
}

SLUG_COUNTRIES = {
    "australia": "Australia", "china": "China", "japan": "Japan",
    "bahrain": "Bahrain", "saudi-arabia": "Saudi Arabia", "miami": "USA",
    "emilia-romagna": "Italy", "monaco": "Monaco", "canada": "Canada",
    "barcelona-catalunya": "Spain", "spain": "Spain", "austria": "Austria",
    "great-britain": "UK", "belgium": "Belgium", "hungary": "Hungary",
    "netherlands": "Netherlands", "italy": "Italy", "azerbaijan": "Azerbaijan",
    "singapore": "Singapore", "united-states": "USA", "mexico": "Mexico",
    "brazil": "Brazil", "las-vegas": "USA", "qatar": "Qatar",
    "abu-dhabi": "United Arab Emirates", "sakhir": "Bahrain", "styria": "Austria",
    "tuscany": "Italy", "eifel": "Germany", "portugal": "Portugal",
    "turkey": "Turkey", "russia": "Russia", "vietnam": "Vietnam",
    "korea": "Korea", "india": "India", "europe": "Europe", "pacific": "Pacific",
    "san-marino": "San Marino", "luxembourg": "Luxembourg", "sweden": "Sweden",
    "south-africa": "South Africa", "usa-west": "USA", "usa-east": "USA",
    "caesars-palace": "USA", "detroit": "USA", "dallas": "USA",
    "switzerland": "Switzerland", "morocco": "Morocco", "argentina": "Argentina",
    "70th-anniversary": "UK",
}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def slug(value: str) -> str:
    return norm(value).replace(" ", "_")


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("\xa0", " ")).strip()


def load_current() -> dict:
    raw = (ROOT / "data.js").read_text(encoding="utf-8")
    match = re.search(r"window\.F1_DATA\s*=\s*(\{.*\});", raw, re.S)
    if not match:
        raise SystemExit("Could not read data.js")
    return json.loads(match.group(1))


CURRENT = load_current()
CURRENT_SEASONS = CURRENT.get("seasons", {})

# Driver name/code -> existing site ID (preserves profile URLs).
NAME_TO_ID: dict[str, str] = {}
CODE_TO_ID: dict[str, str] = {}
ID_TO_NAME: dict[str, str] = {}
ID_TO_CODE: dict[str, str] = {}
ID_TO_ISO: dict[str, str] = {}
for _year in CURRENT.get("years", []):
    for _d in CURRENT_SEASONS.get(str(_year), {}).get("drivers", []):
        NAME_TO_ID.setdefault(norm(_d.get("name", "")), _d["id"])
        if _d.get("code"):
            CODE_TO_ID.setdefault(str(_d["code"]).upper(), _d["id"])
        ID_TO_NAME.setdefault(_d["id"], _d.get("name", _d["id"]))
        if _d.get("code"):
            ID_TO_CODE.setdefault(_d["id"], str(_d["code"]).upper())
        if _d.get("countryCode"):
            ID_TO_ISO.setdefault(_d["id"], str(_d["countryCode"]).upper())


# ---------------------------------------------------------------------------
# HTTP and table parsing
# ---------------------------------------------------------------------------

def fetch(url: str, retries: int = 3, timeout: int = 35) -> str | None:
    last = None
    for attempt in range(retries):
        try:
            response = requests.get(url, headers=HEADERS, timeout=timeout)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.text
        except Exception as exc:  # noqa: BLE001 - retry any transport error
            last = exc
            if attempt + 1 < retries:
                time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"GET failed: {url}: {last}")


def soup_of(url: str) -> BeautifulSoup | None:
    html = fetch(url)
    return BeautifulSoup(html, "lxml") if html else None


def table_of(soup: BeautifulSoup):
    """Return (headers, rows) for the first result table on the page."""
    if soup is None:
        return [], []
    table = soup.find("table")
    if table is None:
        return [], []
    header_row = table.find("tr")
    headers = [clean(c.get_text(" ", strip=True)) for c in header_row.find_all(["th", "td"])] if header_row else []
    rows = []
    for tr in table.find_all("tr")[1:]:
        cells = tr.find_all("td")
        if cells:
            rows.append(cells)
    return headers, rows


def hindex(headers: list[str], *names: str, default: int | None = None) -> int:
    wanted = [norm(n) for n in names]
    for i, header in enumerate(headers):
        if norm(header) in wanted:
            return i
    if default is not None:
        return default
    raise KeyError(f"None of {names} in {headers}")


def cell_text(cell, idx: int) -> str:
    return clean(cell[idx].get_text(" ", strip=True))


def driver_name_cell(cell) -> str:
    spans = [s for s in cell.find_all("span") if s.find("span") is None and clean(s.get_text("", strip=True))]
    parts = [clean(s.get_text("", strip=True)) for s in spans
             if "md:hidden" not in (s.get("class") or [])]
    full = " ".join(parts)
    return full or clean(cell.get_text(" ", strip=True))


def driver_code_cell(cell) -> str:
    for span in cell.find_all("span"):
        classes = span.get("class") or []
        text = clean(span.get_text("", strip=True))
        if "md:hidden" in classes and 2 <= len(text) <= 3 and text.isupper():
            return text
    return ""


def number_cell(cell) -> int | None:
    text = clean(cell.get_text(" ", strip=True))
    return int(text) if text.isdigit() else None


def int_text(text: str) -> int | None:
    text = clean(text)
    return int(text) if text.isdigit() else None


def float_text(text: str) -> float:
    text = clean(text).replace(",", "")
    try:
        return float(text)
    except ValueError:
        return 0.0


# ---------------------------------------------------------------------------
# Metadata helpers
# ---------------------------------------------------------------------------

_OLD_CACHE: dict[tuple[int, str], dict] = {}
_OLD_DRIVER_MAPS: dict[int, tuple[dict[str, str], dict[str, str], dict[str, str], dict[str, str]]] = {}
_OLD_TEAM_MAPS: dict[int, tuple[dict[str, str], dict[str, str]]] = {}


def old_json(season: int, kind: str) -> dict:
    """Load the legacy Jolpica/Ergast cache for a season (if it exists)."""
    key = (season, kind)
    if key not in _OLD_CACHE:
        path = CACHE / f"{season}_{kind}.json"
        _OLD_CACHE[key] = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return _OLD_CACHE[key]


def old_race_by_round(season: int) -> dict[int, dict]:
    races = old_json(season, "calendar").get("RaceTable", {}).get("Races", [])
    return {int(r["round"]): r for r in races}


def old_driver_maps(season: int):
    """Name/code/display/nationality maps from the legacy cache."""
    if season in _OLD_DRIVER_MAPS:
        return _OLD_DRIVER_MAPS[season]
    names: dict[str, str] = {}
    codes: dict[str, str] = {}
    display: dict[str, str] = {}
    iso: dict[str, str] = {}
    for race in old_json(season, "results").get("RaceTable", {}).get("Races", []):
        for row in race.get("Results", []):
            driver = row.get("Driver", {})
            did = driver.get("driverId")
            if not did:
                continue
            full = (driver.get("givenName", "") + " " + driver.get("familyName", "")).strip()
            if full:
                names.setdefault(norm(full), did)
                display.setdefault(did, full)
            if driver.get("code"):
                codes.setdefault(str(driver["code"]).upper(), did)
            if driver.get("nationality"):
                iso.setdefault(did, ADJ_TO_ISO.get(driver["nationality"], ""))
    # Fall back to the current dataset for new drivers not in the legacy cache.
    for driver in CURRENT_SEASONS.get(str(season), {}).get("drivers", []):
        did = driver.get("id")
        full = driver.get("name")
        if not did or not full:
            continue
        names.setdefault(norm(full), did)
        display.setdefault(did, full)
        if driver.get("code"):
            codes.setdefault(str(driver["code"]).upper(), did)
        if driver.get("countryCode"):
            iso.setdefault(did, str(driver["countryCode"]).upper())
    _OLD_DRIVER_MAPS[season] = (names, codes, display, iso)
    return _OLD_DRIVER_MAPS[season]


def old_team_maps(season: int):
    """Name/display maps from the legacy cache, preserving existing team IDs."""
    if season in _OLD_TEAM_MAPS:
        return _OLD_TEAM_MAPS[season]
    names: dict[str, str] = {}
    display: dict[str, str] = {}
    for race in old_json(season, "results").get("RaceTable", {}).get("Races", []):
        for row in race.get("Results", []):
            ctor = row.get("Constructor", {})
            cid = ctor.get("constructorId")
            if not cid:
                continue
            name = ctor.get("name", cid)
            display.setdefault(cid, name)
            names.setdefault(norm(name), cid)
            names.setdefault(cid.replace("_", " "), cid)
    for standing in old_json(season, "constructorstandings").get("StandingsTable", {}).get("StandingsLists", [{}])[0].get("ConstructorStandings", []):
        ctor = standing.get("Constructor", {})
        cid = ctor.get("constructorId")
        if not cid:
            continue
        name = ctor.get("name", cid)
        display.setdefault(cid, name)
        names.setdefault(norm(name), cid)
        names.setdefault(cid.replace("_", " "), cid)
    # Fall back to the current dataset for teams not in the legacy cache.
    for team in CURRENT_SEASONS.get(str(season), {}).get("constructors", []):
        cid = team.get("id")
        name = team.get("name")
        if not cid or not name:
            continue
        display.setdefault(cid, name)
        names.setdefault(norm(name), cid)
        names.setdefault(cid.replace("_", " "), cid)
    _OLD_TEAM_MAPS[season] = (names, display)
    return _OLD_TEAM_MAPS[season]


def current_by_round(season: int) -> dict[int, dict]:
    data = CURRENT_SEASONS.get(str(season), {})
    return {int(r["round"]): r for r in data.get("races", [])}


def season_team_maps(season: int):
    """Return (normalised-name -> id, id -> display name) for a season."""
    names, display = old_team_maps(season)
    # Common formula1.com aliases. Some are engine/chassis names that the
    # official site uses but the legacy constructor IDs spell differently.
    aliases = {
        "red bull racing": "red_bull",
        "rbr": "red_bull",
        "racing bulls": "rb",
        "rb f1 team": "rb",
        "haas": "haas",
        "haas f1 team": "haas",
        "str": "toro_rosso",
        "scuderia toro rosso": "toro_rosso",
        "toro rosso": "toro_rosso",
        "alphatauri": "alphatauri",
        "sauber bmw": "bmw_sauber",
        "kick sauber": "sauber",
        "marussia": "manor",
        "mrt": "manor",
        "alfa romeo": "alfa",
        "aston martin": "aston_martin",
        "alpine": "alpine",
        "alpine f1 team": "alpine",
        "cadillac": "cadillac",
        "cadillac f1 team": "cadillac",
        "mercedes": "mercedes",
        "ferrari": "ferrari",
        "mclaren": "mclaren",
        "williams": "williams",
        "audi": "audi",
        "renault": "renault",
        "racing point": "racing_point",
        "force india": "force_india",
        "team lotus": "team_lotus",
        "spyker mf1": "spyker_mf1",
        "mf1": "mf1",
    }
    for key, value in aliases.items():
        if value in display:
            names.setdefault(key, value)
    # Lotus used several constructor IDs across the eras. Resolve the generic
    # "Lotus" alias against the actual team in this season.
    lotus_ids = [cid for cid in display
                 if "lotus" in cid or "lotus" in norm(display[cid])]
    if lotus_ids:
        preferred = next((cid for cid in lotus_ids if norm(display[cid]) == "lotus" or cid == "lotus"), lotus_ids[0])
        names.setdefault("lotus", preferred)
    # Lola and Venturi are the Larrousse entries in the legacy data.
    if "larrousse" in display:
        names.setdefault("lola", "larrousse")
        names.setdefault("venturi", "larrousse")
    return names, display


TEAM_MAPS: dict[int, tuple[dict[str, str], dict[str, str]]] = {}


def team_id_for(name: str, season: int) -> str:
    if season not in TEAM_MAPS:
        TEAM_MAPS[season] = season_team_maps(season)
    names, _ = TEAM_MAPS[season]
    key = norm(name)
    if key in names:
        return names[key]
    # Formula 1 team names often append the engine ("Williams Renault",
    # "Lotus Ford"), so match the chassis name at the start of the string.
    best_key = ""
    best_id = ""
    for candidate, cid in names.items():
        if candidate and (key == candidate or key.startswith(candidate + " ")):
            if len(candidate) > len(best_key):
                best_key = candidate
                best_id = cid
    return best_id or slug(name)


def team_display_name(cid: str, formula1_name: str, season: int) -> str:
    if season not in TEAM_MAPS:
        TEAM_MAPS[season] = season_team_maps(season)
    _, display = TEAM_MAPS[season]
    return display.get(cid) or clean(formula1_name)


def driver_id_for(full_name: str, code: str, season: int | None = None) -> str:
    if season is not None:
        names, codes, _, _ = old_driver_maps(season)
        if norm(full_name) in names:
            return names[norm(full_name)]
        if code and code.upper() in codes:
            return codes[code.upper()]
    if norm(full_name) in NAME_TO_ID:
        return NAME_TO_ID[norm(full_name)]
    # Driver codes are reused across eras (for example CAM belongs to both
    # Adrián Campos and Rafael Câmara). If the full name is not already known
    # for this season, use the name slug rather than the global code map.
    if season is not None:
        return slug(full_name)
    if code and code.upper() in CODE_TO_ID:
        return CODE_TO_ID[code.upper()]
    return slug(full_name)


def driver_display_name(did: str, full_name: str, season: int | None = None) -> str:
    if season is not None:
        _, _, display, _ = old_driver_maps(season)
        if did in display:
            return display[did]
    return ID_TO_NAME.get(did) or clean(full_name)


def split_name(full_name: str) -> tuple[str, str]:
    parts = clean(full_name).split()
    if len(parts) <= 1:
        return "", full_name
    return " ".join(parts[:-1]), parts[-1]


def parse_event_meta(soup: BeautifulSoup, season: int) -> dict:
    lines = [clean(x) for x in soup.get_text("\n").splitlines() if clean(x)]
    event_date = None
    circuit = ""
    locality = ""
    for i, line in enumerate(lines):
        match = re.search(r"(\d{1,2})\s+([A-Za-z]{3})\s*-\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})", line)
        if match:
            d1, m1, d2, m2, year = match.groups()
            try:
                event_date = date(int(year), MONTHS[m2.upper()], int(d2)).isoformat()
            except Exception:
                pass
        else:
            match = re.search(r"(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})", line)
            if match:
                d1, d2, m2, year = match.groups()
                try:
                    event_date = date(int(year), MONTHS[m2.upper()], int(d2)).isoformat()
                except Exception:
                    pass
            else:
                match = re.search(r"(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})", line)
                if match:
                    d1, m1, year = match.groups()
                    try:
                        event_date = date(int(year), MONTHS[m1.upper()], int(d1)).isoformat()
                    except Exception:
                        pass
        if event_date and i + 1 < len(lines):
            location = lines[i + 1]
            if "," in location and not location.upper().startswith(("FORMULA", "POS")):
                parts = [clean(x) for x in location.split(",")]
                circuit = parts[0]
                locality = ", ".join(parts[1:])
                break
    return {"date": event_date, "circuit": circuit, "locality": locality}


def race_meta(season: int, rnd: int, slug_name: str, meta: dict) -> dict:
    # Prefer the legacy calendar for names/circuits because it covers rounds
    # that Formula 1 has removed from its results archive (e.g. cancelled
    # races and excluded teams). For new rounds, fall back to the page and slug.
    old = old_race_by_round(season).get(rnd)
    if old:
        loc = old.get("Circuit", {}).get("Location", {})
        return {
            "name": old.get("raceName") or SLUG_NAMES.get(slug_name, clean(slug_name.title()) + " Grand Prix"),
            "circuit": old.get("Circuit", {}).get("circuitName") or meta.get("circuit", ""),
            "locality": loc.get("locality") or meta.get("locality", ""),
            "country": loc.get("country") or SLUG_COUNTRIES.get(slug_name, ""),
            "date": old.get("date") or meta.get("date", ""),
        }
    current = current_by_round(season).get(rnd)
    if current:
        return {
            "name": current.get("name") or SLUG_NAMES.get(slug_name, clean(slug_name.title()) + " Grand Prix"),
            "circuit": current.get("circuit") or meta.get("circuit", ""),
            "locality": current.get("locality") or meta.get("locality", ""),
            "country": current.get("country") or SLUG_COUNTRIES.get(slug_name, ""),
            "date": meta.get("date") or current.get("date", ""),
        }
    return {
        "name": SLUG_NAMES.get(slug_name, clean(slug_name.replace("-", " ").title()) + " Grand Prix"),
        "circuit": meta.get("circuit", ""),
        "locality": meta.get("locality", ""),
        "country": SLUG_COUNTRIES.get(slug_name, ""),
        "date": meta.get("date", ""),
    }


# ---------------------------------------------------------------------------
# Session parsing
# ---------------------------------------------------------------------------

def status_for(pos_text: str, time_text: str) -> str:
    value = clean(time_text)
    if pos_text.isdigit():
        if value.startswith("+") and "lap" in value.lower():
            return value
        if value.upper() in ("DNF", "RETIRED", "DSQ", "DNS", "NC", "W"):
            return "DNF"
        return "Finished"
    upper = clean(pos_text).upper()
    if upper in ("D", "DSQ"):
        return "Disqualified"
    if upper in ("W", "WD"):
        return "Withdrew"
    if upper in ("DNS", "DNQ", "DNPQ"):
        return upper
    if value.upper() == "DNF":
        return "DNF"
    return "Not classified"


def parse_session(soup: BeautifulSoup) -> list[dict]:
    headers, rows = table_of(soup)
    if not rows:
        return []
    i_pos = hindex(headers, "pos", "pos.", default=0)
    i_no = hindex(headers, "no", "no.", default=1)
    i_drv = hindex(headers, "driver", default=2)
    i_team = hindex(headers, "team", default=3)
    i_laps = hindex(headers, "laps", default=4)
    i_time = hindex(headers, "time retired", "time / retired", "time", default=5)
    i_pts = hindex(headers, "pts", "pts.", default=6)
    out = []
    for cells in rows:
        if len(cells) <= max(i_pos, i_drv, i_team, i_laps, i_time, i_pts):
            continue
        pos_text = cell_text(cells, i_pos)
        driver_cell = cells[i_drv]
        full_name = driver_name_cell(driver_cell)
        if not full_name:
            continue
        code = driver_code_cell(driver_cell)
        number = number_cell(cells[i_no]) if i_no < len(cells) else None
        team_name = cell_text(cells, i_team)
        time_text = cell_text(cells, i_time)
        pos = int(pos_text) if pos_text.isdigit() else None
        out.append({
            "name": full_name,
            "code": code,
            "number": number,
            "team_name": team_name,
            "pos": pos,
            "pos_text": pos_text,
            "laps": int_text(cell_text(cells, i_laps)) or 0,
            "time": time_text,
            "status": status_for(pos_text, time_text),
            "points": float_text(cell_text(cells, i_pts)),
        })
    return out


def parse_grid(soup: BeautifulSoup) -> dict[str, int]:
    headers, rows = table_of(soup)
    if not rows:
        return {}
    i_pos = hindex(headers, "pos", "pos.", default=0)
    i_drv = hindex(headers, "driver", default=2)
    out = {}
    for cells in rows:
        if len(cells) <= max(i_pos, i_drv):
            continue
        full_name = driver_name_cell(cells[i_drv])
        pos = int_text(cell_text(cells, i_pos))
        if full_name and pos:
            out[full_name] = pos
    return out


def parse_qualifying(soup: BeautifulSoup) -> list[dict]:
    headers, rows = table_of(soup)
    if not rows:
        return []
    i_pos = hindex(headers, "pos", "pos.", default=0)
    i_drv = hindex(headers, "driver", default=2)
    i_team = hindex(headers, "team", default=3)
    i_q1 = hindex(headers, "q1", default=4)
    i_q2 = hindex(headers, "q2", default=5)
    i_q3 = hindex(headers, "q3", default=6)
    out = []
    for cells in rows:
        if len(cells) <= max(i_pos, i_drv, i_team):
            continue
        pos_text = cell_text(cells, i_pos)
        if not pos_text.isdigit():
            continue
        full_name = driver_name_cell(cells[i_drv])
        if not full_name:
            continue
        out.append({
            "position": int(pos_text),
            "name": full_name,
            "code": driver_code_cell(cells[i_drv]),
            "team_name": cell_text(cells, i_team),
            "q1": cell_text(cells, i_q1) if i_q1 < len(cells) else "",
            "q2": cell_text(cells, i_q2) if i_q2 < len(cells) else "",
            "q3": cell_text(cells, i_q3) if i_q3 < len(cells) else "",
        })
    return out


def parse_fastest(soup: BeautifulSoup) -> dict[str, tuple[int, int | None]]:
    headers, rows = table_of(soup)
    if not rows:
        return {}
    i_pos = hindex(headers, "pos", "pos.", default=0)
    i_drv = hindex(headers, "driver", default=2)
    i_lap = hindex(headers, "lap", default=4)
    out = {}
    for cells in rows:
        if len(cells) <= max(i_pos, i_drv):
            continue
        full_name = driver_name_cell(cells[i_drv])
        rank = int_text(cell_text(cells, i_pos))
        lap = int_text(cell_text(cells, i_lap)) if i_lap < len(cells) else None
        if full_name and rank:
            out[full_name] = (rank, lap)
    return out


# ---------------------------------------------------------------------------
# Season scraping
# ---------------------------------------------------------------------------

def season_links(season: int, soup: BeautifulSoup) -> list[tuple[int, str, str]]:
    pattern = re.compile(rf"/en/results/{season}/races/(\d+)/([^/]+)/race-result")
    found: dict[tuple[int, str], None] = {}
    order: list[tuple[int, str, str]] = []
    for a in soup.find_all("a", href=True):
        match = pattern.search(a["href"])
        if not match:
            continue
        race_id, race_slug = int(match.group(1)), match.group(2)
        key = (race_id, race_slug)
        if key in found:
            continue
        found[key] = None
        order.append((race_id, race_slug, a["href"]))
    return order


def season_list_count(soup: BeautifulSoup) -> int:
    table = soup.find("table")
    if table is None:
        return 0
    return sum(1 for tr in table.find_all("tr")[1:] if tr.find_all("td"))


def scrape_race(season: int, link_index: int, race_id: int, race_slug: str, href: str):
    page_url = "https://www.formula1.com" + href
    soup = soup_of(page_url)
    if soup is None:
        return None
    links = [a.get("href", "") for a in soup.find_all("a", href=True)]
    prefix = f"/en/results/{season}/races/{race_id}/{race_slug}/"

    def find_link(name: str) -> str | None:
        for link in links:
            if link.startswith(prefix) and link[len(prefix):].startswith(name):
                return "https://www.formula1.com" + link
        return None

    meta = parse_event_meta(soup, season)
    results = parse_session(soup)

    grid_url = find_link("starting-grid")
    quali_url = find_link("qualifying")
    fastest_url = find_link("fastest-laps")
    sprint_url = find_link("sprint-results")
    sprint_grid_url = find_link("sprint-grid")

    grid = parse_grid(soup_of(grid_url)) if grid_url else {}
    quali = parse_qualifying(soup_of(quali_url)) if quali_url else []
    fastest = parse_fastest(soup_of(fastest_url)) if fastest_url else {}
    sprint = parse_session(soup_of(sprint_url)) if sprint_url else []
    sprint_grid = parse_grid(soup_of(sprint_grid_url)) if sprint_grid_url else {}

    return {
        "link_index": link_index,
        "round": 0,
        "race_id": race_id,
        "slug": race_slug,
        "meta": meta,
        "results": results,
        "grid": grid,
        "qualifying": quali,
        "fastest": fastest,
        "sprint": sprint,
        "sprint_grid": sprint_grid,
        "has_sprint": bool(sprint_url),
    }


def parse_standings_drivers(soup: BeautifulSoup) -> list[dict]:
    headers, rows = table_of(soup)
    if not rows:
        return []
    i_pos = hindex(headers, "pos", "pos.", default=0)
    i_drv = hindex(headers, "driver", default=1)
    i_nat = hindex(headers, "nationality", default=2)
    i_team = hindex(headers, "team", default=3)
    i_pts = hindex(headers, "pts", "pts.", default=4)
    out = []
    for cells in rows:
        if len(cells) <= max(i_pos, i_drv, i_pts):
            continue
        full_name = driver_name_cell(cells[i_drv])
        pos = int_text(cell_text(cells, i_pos))
        if not full_name or pos is None:
            continue
        team_name = cell_text(cells, i_team) if i_team < len(cells) else ""
        out.append({
            "position": pos,
            "name": full_name,
            "code": driver_code_cell(cells[i_drv]),
            "nationality": cell_text(cells, i_nat) if i_nat < len(cells) else "",
            "team_name": team_name,
            "points": float_text(cell_text(cells, i_pts)),
        })
    return out


def parse_standings_teams(soup: BeautifulSoup) -> list[dict]:
    headers, rows = table_of(soup)
    if not rows:
        return []
    i_pos = hindex(headers, "pos", "pos.", default=0)
    i_team = hindex(headers, "team", default=1)
    i_pts = hindex(headers, "pts", "pts.", default=2)
    out = []
    for cells in rows:
        if len(cells) <= max(i_pos, i_team, i_pts):
            continue
        team_name = cell_text(cells, i_team)
        pos = int_text(cell_text(cells, i_pos))
        if not team_name or pos is None:
            continue
        out.append({
            "position": pos,
            "team_name": team_name,
            "points": float_text(cell_text(cells, i_pts)),
        })
    return out


def driver_object(full_name: str, code: str, iso: str, number: int | None,
                  season: int | None = None) -> dict:
    did = driver_id_for(full_name, code, season)
    display = driver_display_name(did, full_name, season)
    given, family = split_name(display)
    old_iso = ""
    if season is not None:
        _, _, _, old_iso_map = old_driver_maps(season)
        old_iso = old_iso_map.get(did, "")
    return {
        "driverId": did,
        "permanentNumber": str(number) if number else "",
        "code": (code or ID_TO_CODE.get(did) or "").upper(),
        "givenName": given,
        "familyName": family,
        "nationality": ISO3_TO_ADJ.get((iso or old_iso).upper(), iso or old_iso) if (iso or old_iso) else "",
    }


def team_object(cid: str, name: str, season: int) -> dict:
    return {"constructorId": cid, "name": team_display_name(cid, name, season), "nationality": ""}


def scrape_season(season: int, workers: int = 4) -> dict:
    season_url = f"{BASE}/{season}/races"
    soup = soup_of(season_url)
    if soup is None:
        raise RuntimeError(f"No season page for {season}")
    links = season_links(season, soup)
    if not links:
        raise RuntimeError(f"No race links for {season}")
    listed = season_list_count(soup)

    fetched: list[dict] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(scrape_race, season, i, race_id, race_slug, href): i
            for i, (race_id, race_slug, href) in enumerate(links)
        }
        for future in as_completed(futures):
            race = future.result()
            if race:
                fetched.append(race)
    fetched.sort(key=lambda r: r["link_index"])

    # Drop cancelled races (links with no results in the middle of the season).
    # For the latest season, keep no-result links after the last completed race
    # as upcoming rounds.
    last_completed = max((r["link_index"] for r in fetched if r["results"]), default=-1)
    include_upcoming = season == latest_season()
    kept: list[dict] = []
    skipped: list[str] = []
    for race in fetched:
        if race["results"]:
            kept.append(race)
        elif include_upcoming and race["link_index"] > last_completed:
            kept.append(race)
        else:
            skipped.append(race["slug"])
    for race in kept:
        race["round"] = len([x for x in kept if x["link_index"] <= race["link_index"]])
    completed = sum(1 for r in kept if r["results"])
    if listed and completed != listed:
        raise RuntimeError(
            f"{season}: scraped {completed} completed races but the official "
            f"calendar lists {listed}; refusing to write incomplete data"
        )
    if skipped:
        print(f"  {season}: skipped cancelled rounds: {', '.join(skipped)}")
    for race in kept:
        print(f"  {season} round {race['round']:02d}: {race['slug']} "
              f"({len(race['results'])} results)")
    races = kept

    driver_standings = parse_standings_drivers(soup_of(f"{BASE}/{season}/drivers"))
    team_standings = parse_standings_teams(soup_of(f"{BASE}/{season}/team"))

    return {
        "season": season,
        "races": races,
        "driver_standings": driver_standings,
        "team_standings": team_standings,
    }


# ---------------------------------------------------------------------------
# Convert scraped data to the Ergast-shaped files build_data.py expects
# ---------------------------------------------------------------------------

def race_points(season: int, pos: int | None, is_sprint: bool = False,
                fastest_rank: int | None = None) -> float:
    """Official points for a finishing position, used only to repair holes in
    formula1.com's PTS column (occasionally a classified top-ten car shows 0)."""
    if not pos:
        return 0.0
    if is_sprint:
        table = [3, 2, 1] if season <= 2022 else [8, 7, 6, 5, 4, 3, 2, 1]
    elif season <= 1990:
        table = [9, 6, 4, 3, 2, 1]
    elif season <= 2002:
        table = [10, 6, 4, 3, 2, 1]
    elif season <= 2009:
        table = [10, 8, 6, 5, 4, 3, 2, 1]
    else:
        table = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1]
    points = float(table[pos - 1]) if 1 <= pos <= len(table) else 0.0
    if (not is_sprint and 2019 <= season <= 2024 and fastest_rank == 1
            and pos <= 10):
        points += 1.0
    return points


def build_outputs(data: dict) -> dict[str, dict]:
    season = data["season"]
    races = data["races"]

    # Nationality by driver id, from the official standings.
    nat_by_id: dict[str, str] = {}
    number_by_id: dict[str, int] = {}
    for standing in data["driver_standings"]:
        did = driver_id_for(standing["name"], standing["code"], season)
        if standing.get("nationality"):
            nat_by_id[did] = standing["nationality"]
    for race in races:
        for r in race["results"]:
            did = driver_id_for(r["name"], r["code"], season)
            if r.get("number"):
                number_by_id.setdefault(did, r["number"])
                # Prefer the most frequent number in case of one-off entries.
    # Counts for the most common number.
    number_counts: dict[str, dict[int, int]] = {}
    for race in races:
        for r in race["results"]:
            did = driver_id_for(r["name"], r["code"], season)
            num = r.get("number")
            if num:
                number_counts.setdefault(did, {})
                number_counts[did][num] = number_counts[did].get(num, 0) + 1
    for did, counts in number_counts.items():
        number_by_id[did] = max(counts, key=counts.get)

    def make_driver(name: str, code: str, number: int | None = None) -> dict:
        did = driver_id_for(name, code, season)
        old_iso = old_driver_maps(season)[3].get(did, "")
        iso = nat_by_id.get(did) or old_iso or ID_TO_ISO.get(did, "")
        return driver_object(name, code, iso,
                             number if number is not None else number_by_id.get(did), season)

    calendar_races = []
    result_races = []
    quali_races = []
    sprint_races = []

    for race in races:
        rnd = race["round"]
        meta = race_meta(season, rnd, race["slug"], race["meta"])
        calendar_races.append({
            "round": str(rnd),
            "raceName": meta["name"],
            "Circuit": {
                "circuitName": meta["circuit"],
                "Location": {"locality": meta["locality"], "country": meta["country"]},
            },
            "date": meta["date"],
        })

        results = []
        if race["results"]:
            for r in race["results"]:
                did = driver_id_for(r["name"], r["code"], season)
                cid = team_id_for(r["team_name"], season)
                grid = race["grid"].get(r["name"], 0)
                if not grid:
                    # Fall back to qualifying position, then to race position.
                    grid = 0
                fastest = race["fastest"].get(r["name"])
                fastest_rank = fastest[0] if fastest else None
                points = r["points"]
                if points == 0 and r["pos"]:
                    points = race_points(season, r["pos"], False, fastest_rank)
                result = {
                    "position": str(r["pos"]) if r["pos"] is not None else "",
                    "positionText": r["pos_text"],
                    "grid": str(grid),
                    "laps": str(r["laps"]),
                    "status": r["status"],
                    "points": f"{points:.1f}",
                    "Driver": make_driver(r["name"], r["code"], r.get("number")),
                    "Constructor": team_object(cid, r["team_name"], season),
                }
                if fastest:
                    rank, lap = fastest
                    result["FastestLap"] = {"rank": str(rank)}
                    if lap:
                        result["FastestLap"]["lap"] = str(lap)
                results.append(result)
            results.sort(key=lambda x: (not x["position"].isdigit(),
                                        int(x["position"]) if x["position"].isdigit() else 999,
                                        x["positionText"]))
            result_races.append({"round": str(rnd), "raceName": meta["name"], "Results": results})

        if race["qualifying"]:
            qresults = []
            for q in race["qualifying"]:
                did = driver_id_for(q["name"], q["code"], season)
                cid = team_id_for(q["team_name"], season)
                qresults.append({
                    "position": str(q["position"]),
                    "Driver": make_driver(q["name"], q["code"]),
                    "Constructor": team_object(cid, q["team_name"], season),
                    "Q1": q["q1"] or None,
                    "Q2": q["q2"] or None,
                    "Q3": q["q3"] or None,
                })
            quali_races.append({"round": str(rnd), "raceName": meta["name"], "QualifyingResults": qresults})

        if race["sprint"]:
            sresults = []
            for s in race["sprint"]:
                did = driver_id_for(s["name"], s["code"], season)
                cid = team_id_for(s["team_name"], season)
                points = s["points"]
                if points == 0 and s["pos"]:
                    points = race_points(season, s["pos"], True)
                sresults.append({
                    "position": str(s["pos"]) if s["pos"] is not None else "",
                    "positionText": s["pos_text"],
                    "grid": str(race["sprint_grid"].get(s["name"], 0)),
                    "laps": str(s["laps"]),
                    "status": s["status"],
                    "points": f"{points:.1f}",
                    "Driver": make_driver(s["name"], s["code"], s.get("number")),
                    "Constructor": team_object(cid, s["team_name"], season),
                })
            sresults.sort(key=lambda x: (not x["position"].isdigit(),
                                         int(x["position"]) if x["position"].isdigit() else 999,
                                         x["positionText"]))
            sprint_races.append({"round": str(rnd), "raceName": meta["name"], "SprintResults": sresults})

    # Formula 1 sometimes splits a constructor by engine (e.g. Tyrrell Ford and
    # Tyrrell Renault in 1985). Merge those rows back into one team.
    driver_standings = []
    for s in data["driver_standings"]:
        did = driver_id_for(s["name"], s["code"], season)
        cid = team_id_for(s["team_name"], season)
        driver_standings.append({
            "position": str(s["position"]),
            "points": f"{s['points']:.1f}",
            "Driver": make_driver(s["name"], s["code"]),
            "Constructors": [team_object(cid, s["team_name"], season)],
        })
    merged_drivers: dict[str, dict] = {}
    for row in driver_standings:
        did = row["Driver"]["driverId"]
        if did not in merged_drivers:
            merged_drivers[did] = row
        else:
            current = merged_drivers[did]
            current["points"] = f"{float(current['points']) + float(row['points']):.1f}"
            current["position"] = str(min(int(current["position"]), int(row["position"])))
    driver_standings = sorted(merged_drivers.values(), key=lambda x: int(x["position"]))

    merged_teams: dict[str, dict] = {}
    for s in data["team_standings"]:
        cid = team_id_for(s["team_name"], season)
        if cid not in merged_teams:
            merged_teams[cid] = {
                "position": str(s["position"]),
                "points": f"{s['points']:.1f}",
                "Constructor": team_object(cid, s["team_name"], season),
            }
        else:
            current = merged_teams[cid]
            current["points"] = f"{float(current['points']) + float(s['points']):.1f}"
            current["position"] = str(min(int(current["position"]), int(s["position"])))
    constructor_standings = sorted(merged_teams.values(), key=lambda x: int(x["position"]))

    # Gap-fill: Formula 1 omits a few historical entries (notably Tyrrell in
    # 1984, which was excluded from the championship). Add only rows that are
    # missing from the Formula 1 data so the legacy archive stays complete.
    gaps = 0
    old_results = {int(r["round"]): r for r in old_json(season, "results").get("RaceTable", {}).get("Races", [])}
    for race in result_races:
        legacy = old_results.get(int(race["round"]))
        if not legacy:
            continue
        have = {x["Driver"]["driverId"] for x in race["Results"]}
        for row in legacy.get("Results", []):
            if row["Driver"]["driverId"] not in have:
                race["Results"].append(row)
                gaps += 1
        race["Results"].sort(key=lambda x: (not x["position"].isdigit(),
                                            int(x["position"]) if x["position"].isdigit() else 999,
                                            x["positionText"]))

    old_quali = {int(r["round"]): r for r in old_json(season, "qualifying").get("RaceTable", {}).get("Races", [])}
    for race in quali_races:
        legacy = old_quali.get(int(race["round"]))
        if not legacy:
            continue
        have = {x["Driver"]["driverId"] for x in race["QualifyingResults"]}
        for row in legacy.get("QualifyingResults", []):
            if row["Driver"]["driverId"] not in have:
                race["QualifyingResults"].append(row)
                gaps += 1
        race["QualifyingResults"].sort(key=lambda x: int(x["position"]))

    old_sprint = {int(r["round"]): r for r in old_json(season, "sprint").get("RaceTable", {}).get("Races", [])}
    for race in sprint_races:
        legacy = old_sprint.get(int(race["round"]))
        if not legacy:
            continue
        have = {x["Driver"]["driverId"] for x in race["SprintResults"]}
        for row in legacy.get("SprintResults", []):
            if row["Driver"]["driverId"] not in have:
                race["SprintResults"].append(row)
                gaps += 1

    old_ds = old_json(season, "driverstandings").get("StandingsTable", {}).get("StandingsLists", [{}])[0].get("DriverStandings", [])
    have_ds = {x["Driver"]["driverId"] for x in driver_standings}
    for row in old_ds:
        if row["Driver"]["driverId"] not in have_ds:
            driver_standings.append(row)
            gaps += 1
    driver_standings.sort(key=lambda x: int(x.get("position", 999)))

    old_cs = old_json(season, "constructorstandings").get("StandingsTable", {}).get("StandingsLists", [{}])[0].get("ConstructorStandings", [])
    have_cs = {x["Constructor"]["constructorId"] for x in constructor_standings}
    for row in old_cs:
        if row["Constructor"]["constructorId"] not in have_cs:
            constructor_standings.append(row)
            gaps += 1
    constructor_standings.sort(key=lambda x: int(x.get("position", 999)))
    if gaps:
        print(f"  {season}: legacy gap-fill added {gaps} missing rows")

    return {
        "calendar": {"RaceTable": {"season": str(season), "Races": calendar_races}},
        "results": {"RaceTable": {"season": str(season), "Races": result_races}},
        "qualifying": {"RaceTable": {"season": str(season), "Races": quali_races}},
        "sprint": {"RaceTable": {"season": str(season), "Races": sprint_races}},
        "driverstandings": {"StandingsTable": {"StandingsLists": [{"DriverStandings": driver_standings}]}},
        "constructorstandings": {"StandingsTable": {"StandingsLists": [{"ConstructorStandings": constructor_standings}]}},
    }


def write_outputs(season: int, outputs: dict[str, dict]) -> None:
    OUTDIR.mkdir(parents=True, exist_ok=True)
    for kind, payload in outputs.items():
        path = OUTDIR / f"{season}_{kind}.json"
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        tmp.replace(path)


def season_ready(season: int) -> bool:
    kinds = ("calendar", "results", "qualifying", "sprint", "driverstandings", "constructorstandings")
    return all((OUTDIR / f"{season}_{k}.json").exists() for k in kinds)


def latest_season() -> int:
    years = CURRENT.get("years") or [2026]
    return int(years[0])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from", dest="start", type=int, help="first season to fetch")
    parser.add_argument("--to", dest="end", type=int, help="last season to fetch")
    parser.add_argument("--all", action="store_true", help="fetch every season from 1980 to the latest")
    parser.add_argument("--refresh", action="store_true", help="re-fetch seasons that already have a cache")
    parser.add_argument("--workers", type=int, default=4, help="parallel race workers (default 4)")
    args = parser.parse_args()

    if args.all:
        start, end = 1980, latest_season()
    else:
        start = args.start or latest_season()
        end = args.end or start
    if start > end:
        start, end = end, start

    print(f"Formula 1 results fetcher: {start}–{end}")
    print(f"Cache: {OUTDIR}")
    for season in range(start, end + 1):
        if not args.refresh and season_ready(season):
            print(f"{season}: cached, skipping (use --refresh to re-fetch)")
            continue
        print(f"{season}: fetching from formula1.com ...")
        started = time.time()
        data = scrape_season(season, workers=args.workers)
        outputs = build_outputs(data)
        write_outputs(season, outputs)
        print(f"{season}: {len(data['races'])} races, "
              f"{len(data['races'])} race pages in {time.time() - started:.1f}s")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted. No partial season was written.", file=sys.stderr)
        sys.exit(130)
