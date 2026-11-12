#!/usr/bin/env python3
"""Build data.js for the F1 seasons 1980-2026.

Race data comes from the official Formula 1 results pages
(https://www.formula1.com/en/results/) when a season has been fetched with
``fetch_formula1.py``. Seasons without a native Formula 1 cache fall back to the
legacy Jolpica/Ergast cache, so the history keeps building while the source is
migrated season by season.

The headline score is a single car-relative driver-season index: 35%
Bradley-Terry race-outcome skill, 30% teammate points share, 30%
teammate-relative skill and 5% reliability. Scores are placed on a uniform
0-100 rank scale. The same car-adjusted value is used in the season and
all-time views. Car is a separate data-fit team performance score.

A separate raw-Q diagnostic combines driver-only race skill, wins, podiums and
average finish with no car adjustment. It appears as a rankings column and as
the y-axis on the Raw Q vs car performance chart.
"""
from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path
from statistics import fmean, pstdev

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / "api_cache"
CACHE_F1 = CACHE / "formula1"
OUT = ROOT / "data.js"
SEASONS = list(range(1980, 2027))

# Seasons in which a Formula 1 driver died while competing. Q ratings are
# withheld for these seasons out of respect; race results and car ratings remain
# available. Jules Bianchi died in July 2015 from injuries sustained at the 2014
# Japanese Grand Prix and did not race in 2015, so 2015 is not suppressed.
MEMORIAL_SEASONS = {
    1980: "Patrick Depailler",
    1982: "Gilles Villeneuve and Riccardo Paletti",
    1986: "Elio de Angelis",
    1994: "Roland Ratzenberger and Ayrton Senna",
}

# Only the driver who died has their rating withheld. The rest of the season is
# rated normally.
MEMORIAL_DRIVERS = {
    1980: {"depailler"},
    1982: {"gilles_villeneuve", "paletti"},
    1986: {"angelis"},
    1994: {"ratzenberger", "senna"},
}

TEAM_COLORS = {
    "red_bull": "#3671C6", "ferrari": "#E8002D", "mclaren": "#FF8000",
    "mercedes": "#27F4D2", "williams": "#64C4FF", "renault": "#FFD800",
    "force_india": "#F596C8", "racing_point": "#F596C8", "aston_martin": "#229971",
    "haas": "#B6BABD", "sauber": "#52E252", "kick_sauber": "#52E252",
    "alfa": "#C92D4B", "alphatauri": "#5E8FAA", "rb": "#6692FF",
    "toro_rosso": "#4E7C9B", "lotus_f1": "#FFB800", "lotus_racing": "#FFB800",
    "caterham": "#0B7A3B", "marussia": "#6C6C6C", "manor": "#6C6C6C",
    "virgin": "#E4002B", "hrt": "#BDBDBD", "toyota": "#CC0000",
    "bmw_sauber": "#293B6A", "brawn": "#B8FF00", "audi": "#E4002B",
    "cadillac": "#D4AF37",
    "brabham": "#1B4D3E", "tyrrell": "#0057B8", "lotus": "#FFB800", "team_lotus": "#FFB800", "ats": "#C0C0C0", "life": "#FFD700",
    "benetton": "#00A551", "jordan": "#FFD700", "arrows": "#FF6B00",
    "ligier": "#0055A4", "alfa": "#C92D4B", "alfa_romeo": "#C92D4B",
    "toleman": "#E4002B", "minardi": "#FFD700", "march": "#222222",
    "wolf": "#C0C0C0", "shadow": "#333333", "ensign": "#E4002B",
    "osella": "#E8E8E8", "fittipaldi": "#FFD700", "theodore": "#E4002B",
    "ram": "#FFD700", "spirit": "#0057B8", "zakspeed": "#E4002B",
    "ags": "#0057B8", "coloni": "#FFD700", "eurobrun": "#0057B8",
    "onyx": "#FF6B00", "rial": "#0057B8", "leyton_house": "#FFD700",
    "larrousse": "#0057B8", "fondmetal": "#E4002B", "footwork": "#FF6B00",
    "prost": "#0057B8", "stewart": "#F4F1EC", "bar": "#E4002B", "honda": "#E8E8E8", "bmw_sauber": "#293B6A",
    "jaguar": "#005A2B", "toyota": "#CC0000", "super_aguri": "#E4002B",
    "spyker": "#FF6B00", "brawn": "#B8FF00", "manor": "#6C6C6C",
}
FALLBACK_COLORS = ["#e06c75", "#61afef", "#98c379", "#e5c07b", "#c678dd",
                   "#56b6c2", "#d19a66", "#abb2bf", "#ff7ab2", "#8bd5ca"]

FLAGS = {
    "British": ("United Kingdom", "GBR", "🇬🇧"),
    "German": ("Germany", "GER", "🇩🇪"),
    "Spanish": ("Spain", "ESP", "🇪🇸"),
    "Finnish": ("Finland", "FIN", "🇫🇮"),
    "Italian": ("Italy", "ITA", "🇮🇹"),
    "French": ("France", "FRA", "🇫🇷"),
    "Dutch": ("Netherlands", "NED", "🇳🇱"),
    "Australian": ("Australia", "AUS", "🇦🇺"),
    "Mexican": ("Mexico", "MEX", "🇲🇽"),
    "Canadian": ("Canada", "CAN", "🇨🇦"),
    "Brazilian": ("Brazil", "BRA", "🇧🇷"),
    "Japanese": ("Japan", "JPN", "🇯🇵"),
    "Thai": ("Thailand", "THA", "🇹🇭"),
    "Monegasque": ("Monaco", "MON", "🇲🇨"),
    "Austrian": ("Austria", "AUT", "🇦🇹"),
    "Swiss": ("Switzerland", "SUI", "🇨🇭"),
    "Belgian": ("Belgium", "BEL", "🇧🇪"),
    "Russian": ("Russia", "RUS", "🇷🇺"),
    "Danish": ("Denmark", "DEN", "🇩🇰"),
    "Swedish": ("Sweden", "SWE", "🇸🇪"),
    "New Zealander": ("New Zealand", "NZL", "🇳🇿"),
    "Argentine": ("Argentina", "ARG", "🇦🇷"),
    "American": ("United States", "USA", "🇺🇸"),
    "Portuguese": ("Portugal", "POR", "🇵🇹"),
    "Polish": ("Poland", "POL", "🇵🇱"),
    "Indonesian": ("Indonesia", "IDN", "🇮🇩"),
    "Malaysian": ("Malaysia", "MAS", "🇲🇾"),
    "Indian": ("India", "IND", "🇮🇳"),
    "Venezuelan": ("Venezuela", "VEN", "🇻🇪"),
    "South African": ("South Africa", "RSA", "🇿🇦"),
    "Czech": ("Czechia", "CZE", "🇨🇿"),
    "Hungarian": ("Hungary", "HUN", "🇭🇺"),
    "Irish": ("Ireland", "IRL", "🇮🇪"),
    "Chinese": ("China", "CHN", "🇨🇳"),
    "Colombian": ("Colombia", "COL", "🇨🇴"),
    "Chilean": ("Chile", "CHI", "🇨🇱"),
    "Uruguayan": ("Uruguay", "URU", "🇺🇾"),
}


def load(season: int, kind: str) -> dict:
    # Official Formula 1 pages take precedence; fall back to the historical
    # Jolpica/Ergast cache for seasons that have not been migrated yet.
    p = CACHE_F1 / f"{season}_{kind}.json"
    if not p.exists():
        p = CACHE / f"{season}_{kind}.json"
    if not p.exists():
        return {}
    return json.loads(p.read_text(encoding="utf-8"))


def name_of(driver: dict) -> str:
    return (driver.get("givenName", "") + " " + driver.get("familyName", "")).strip()


def code_of(driver: dict) -> str:
    code = (driver.get("code") or "").upper()
    if code:
        return code
    fam = driver.get("familyName", "")
    return "".join(ch for ch in fam.upper() if ch.isalpha())[:3]


def nationality(driver: dict):
    nat = driver.get("nationality", "")
    return FLAGS.get(nat, (nat, "", "🏁"))


def team_meta(cid: str, name: str, index: int) -> dict:
    color = TEAM_COLORS.get(cid) or FALLBACK_COLORS[index % len(FALLBACK_COLORS)]
    return {"id": cid, "name": name, "full": name, "color": color}


def parse_season(season: int) -> dict | None:
    cal = load(season, "calendar").get("RaceTable", {}).get("Races", [])
    res = load(season, "results").get("RaceTable", {}).get("Races", [])
    q = load(season, "qualifying").get("RaceTable", {}).get("Races", [])
    spr = load(season, "sprint").get("RaceTable", {}).get("Races", [])
    if not cal or not res:
        print(f"  ! missing data for {season}")
        return None

    q_by_round = {int(r["round"]): {x["Driver"]["driverId"]: x for x in r.get("QualifyingResults", [])} for r in q}
    spr_by_round = {int(r["round"]): {x["Driver"]["driverId"]: x for x in r.get("SprintResults", [])} for r in spr}

    completed = {int(r["round"]) for r in res if r.get("Results")}
    completed_rounds = sorted(completed)

    calendar = []
    for r in cal:
        rnd = int(r["round"])
        loc = r.get("Circuit", {}).get("Location", {})
        calendar.append({
            "round": rnd,
            "name": r.get("raceName", ""),
            "circuit": r.get("Circuit", {}).get("circuitName", ""),
            "locality": loc.get("locality", ""),
            "country": loc.get("country", ""),
            "date": r.get("date", ""),
            "sprint": rnd in spr_by_round,
            "status": "done" if rnd in completed else "upcoming",
        })

    races = []
    drivers: dict[str, dict] = {}
    team_names: dict[str, str] = {}
    for race in res:
        rnd = int(race["round"])
        if rnd not in completed:
            continue
        qmap = q_by_round.get(rnd, {})
        smap = spr_by_round.get(rnd, {})
        results = []
        for x in race.get("Results", []):
            drv = x["Driver"]
            ctor = x["Constructor"]
            did = drv["driverId"]
            cid = ctor["constructorId"]
            pos_text = str(x.get("positionText", ""))
            pos = int(x["position"]) if pos_text.isdigit() else None
            status_text = str(x.get("status", ""))
            # A classified retirement still carries a numeric position in Ergast.
            # Only genuine finishes count as race performances.
            finished = status_text in ("Finished", "Lapped") or status_text.startswith("+")
            grid = int(x.get("grid", 0) or 0)
            fl = x.get("FastestLap") or {}
            qx = qmap.get(did) or {}
            sx = smap.get(did) or {}
            qpos = int(qx["position"]) if qx.get("position", "").isdigit() else (grid if grid > 0 else None)
            sp = sx.get("position", "")
            spos = int(sp) if str(sp).isdigit() else None
            sgrid = int(sx.get("grid", 0) or 0)
            team_names[cid] = ctor.get("name", cid)
            row = {
                "driver": did, "team": cid,
                "grid": grid, "pos": pos, "posText": pos_text, "finished": finished,
                "status": status_text, "points": float(x.get("points", 0) or 0),
                "laps": int(x.get("laps", 0) or 0),
                "fastestRank": int(fl.get("rank", 0) or 0) or None,
                "fastestLap": int(fl.get("lap", 0) or 0) or None,
                "qualiPos": qpos,
                "sprintPos": spos, "sprintPoints": float(sx.get("points", 0) or 0),
                "sprintGrid": sgrid if spos else None,
                "sprintStatus": sx.get("status", ""),
                "sprintLaps": int(sx.get("laps", 0) or 0) if spos else None,
            }
            results.append(row)
            if did not in drivers:
                country, cc, flag = nationality(drv)
                drivers[did] = {
                    "id": did, "name": name_of(drv), "code": code_of(drv),
                    "number": int(drv["permanentNumber"]) if drv.get("permanentNumber", "").isdigit() else None,
                    "team": cid, "country": country, "countryCode": cc, "flag": flag,
                    "season": season,
                    "_teams": {},
                }
            drivers[did]["_teams"][cid] = drivers[did]["_teams"].get(cid, 0) + 1
        results.sort(key=lambda r: (r["pos"] is None, r["pos"] if r["pos"] is not None else 999, r["posText"]))
        winner = next((r for r in results if r["pos"] == 1), None)
        pole = next((r for r in results if r["qualiPos"] == 1), None)
        fl = next((r for r in results if r["fastestRank"] == 1), None)
        sw = next((r for r in results if r["sprintPos"] == 1), None)
        races.append({
            "round": rnd, "name": race.get("raceName", ""),
            "circuit": race.get("Circuit", {}).get("circuitName", ""),
            "locality": race.get("Circuit", {}).get("Location", {}).get("locality", ""),
            "country": race.get("Circuit", {}).get("Location", {}).get("country", ""),
            "date": race.get("date", ""), "sprint": rnd in spr_by_round,
            "winner": winner["driver"] if winner else None,
            "pole": pole["driver"] if pole else None,
            "fastestLap": fl["driver"] if fl else None,
            "sprintWinner": sw["driver"] if sw else None,
            "results": results,
        })
    races.sort(key=lambda r: r["round"])

    # Teams actually seen this season
    teams = {}
    for i, (cid, name) in enumerate(sorted(team_names.items(), key=lambda x: x[1])):
        teams[cid] = team_meta(cid, name, i)

    # ---- Season stats -----------------------------------------------------
    for d in drivers.values():
        d.update({
            "starts": 0, "finishes": 0, "dnf": 0,
            "wins": 0, "podiums": 0, "top5": 0, "top10": 0, "pointsFinishes": 0,
            "poles": 0, "fastestLaps": 0, "points": 0.0,
            "sprintStarts": 0, "sprintWins": 0, "sprintPodiums": 0,
            "sprintPoints": 0.0, "sprintBest": None,
            "bestFinish": None, "bestGrid": None,
            "finishSum": 0, "gridSum": 0, "qualiSum": 0, "qualiCount": 0, "gainedSum": 0, "gainedRaces": 0,
            "raceH2HWins": 0, "raceH2HLosses": 0,
            "qualiH2HWins": 0, "qualiH2HLosses": 0,
            "teammates": {},
        })
    for race in races:
        by_team: dict[str, list[dict]] = {}
        for r in race["results"]:
            by_team.setdefault(r["team"], []).append(r)
            d = drivers[r["driver"]]
            d["starts"] += 1
            d["sprintPoints"] += r["sprintPoints"]
            d["points"] += r["points"] + r["sprintPoints"]
            if r["sprintPos"] is not None:
                d["sprintStarts"] += 1
                if r["sprintPos"] == 1: d["sprintWins"] += 1
                if r["sprintPos"] <= 3: d["sprintPodiums"] += 1
                d["sprintBest"] = r["sprintPos"] if d["sprintBest"] is None else min(d["sprintBest"], r["sprintPos"])
            if r["finished"] and r["pos"] is not None:
                d["finishes"] += 1
                d["finishSum"] += r["pos"]
                d["bestFinish"] = r["pos"] if d["bestFinish"] is None else min(d["bestFinish"], r["pos"])
                if r["pos"] == 1: d["wins"] += 1
                if r["pos"] <= 3: d["podiums"] += 1
                if r["pos"] <= 5: d["top5"] += 1
                if r["pos"] <= 10: d["top10"] += 1
                if r["points"] > 0: d["pointsFinishes"] += 1
            else:
                d["dnf"] += 1
            if r["grid"] > 0:
                d["gridSum"] += r["grid"]
                d["bestGrid"] = r["grid"] if d["bestGrid"] is None else min(d["bestGrid"], r["grid"])
                if r["finished"] and r["pos"] is not None:
                    d["gainedSum"] += r["grid"] - r["pos"]
                    d["gainedRaces"] += 1
            if r["qualiPos"]:
                d["qualiSum"] += r["qualiPos"]
                d["qualiCount"] += 1
                if r["qualiPos"] == 1: d["poles"] += 1
            if r["fastestRank"] == 1: d["fastestLaps"] += 1
        for group in by_team.values():
            for r in group:
                d = drivers[r["driver"]]
                for o in group:
                    if o["driver"] == r["driver"]:
                        continue
                    d["teammates"][o["driver"]] = d["teammates"].get(o["driver"], 0) + 1
                    rf = r["finished"] and r["pos"] is not None
                    of = o["finished"] and o["pos"] is not None
                    if rf and of:
                        if r["pos"] < o["pos"]: d["raceH2HWins"] += 1
                        elif r["pos"] > o["pos"]: d["raceH2HLosses"] += 1
                    elif rf and not of:
                        d["raceH2HWins"] += 1
                    elif not rf and of:
                        d["raceH2HLosses"] += 1
                    if r["qualiPos"] and o["qualiPos"]:
                        if r["qualiPos"] < o["qualiPos"]: d["qualiH2HWins"] += 1
                        elif r["qualiPos"] > o["qualiPos"]: d["qualiH2HLosses"] += 1

    # Final team = car driven most often
    for d in drivers.values():
        counts = d.pop("_teams", {})
        d["team"] = max(counts, key=counts.get) if counts else d["team"]
        d["teamStarts"] = dict(counts)
        starts = d["starts"] or 1
        d["avgFinish"] = round(d["finishSum"] / d["finishes"], 2) if d["finishes"] else None
        d["avgGrid"] = round(d["gridSum"] / d["starts"], 2) if d["gridSum"] else None
        d["avgQuali"] = round(d["qualiSum"] / d["qualiCount"], 2) if d["qualiCount"] else d["avgGrid"]
        d["avgGained"] = round(d["gainedSum"] / d["gainedRaces"], 2) if d["gainedRaces"] else 0
        d["pointsPerStart"] = round(d["points"] / starts, 3)
        d["winRate"] = round(d["wins"] / starts, 4)
        d["podiumRate"] = round(d["podiums"] / starts, 4)
        d["reliability"] = round(d["finishes"] / starts, 4)
        d["sprintPointsPerStart"] = round(d["sprintPoints"] / starts, 3)
        d["teammate"] = max(d["teammates"], key=d["teammates"].get) if d["teammates"] else None
        d["bestFinish"] = d["bestFinish"] if d["bestFinish"] is not None else 99
        d["bestGrid"] = d["bestGrid"] if d["bestGrid"] is not None else 99
        d["teamName"] = teams.get(d["team"], {}).get("name", d["team"])
        for k in ("finishSum", "gridSum", "qualiSum", "qualiCount", "gainedSum", "gainedRaces", "teammates"):
            d.pop(k, None)

    # Championship position from the standings endpoint
    stand = load(season, "driverstandings").get("StandingsTable", {}).get("StandingsLists", [])
    standings = stand[0]["DriverStandings"] if stand else []
    for s in standings:
        did = s["Driver"]["driverId"]
        if did in drivers:
            try:
                drivers[did]["champPos"] = int(s.get("position", s.get("positionText", 0)))
            except (ValueError, TypeError):
                drivers[did]["champPos"] = None
            try:
                exp_pts = float(s.get("points", 0) or 0)
                if exp_pts - drivers[did]["points"] > 0.01:
                    print(f"  ! {season} {drivers[did]['name']}: points {drivers[did]['points']} vs {exp_pts}")
                # Official championship totals apply dropped-score rules in
                # older seasons; race points stay untouched in the race tables.
                drivers[did]["points"] = exp_pts
                starts = drivers[did]["starts"] or 1
                drivers[did]["pointsPerStart"] = round(exp_pts / starts, 3)
            except ValueError:
                pass
            if "wins" in s:
                try:
                    exp_wins = int(s.get("wins", 0) or 0)
                    if exp_wins != drivers[did]["wins"]:
                        print(f"  ! {season} {drivers[did]['name']}: wins {drivers[did]['wins']} vs {exp_wins}")
                except ValueError:
                    pass
    for d in drivers.values():
        d.setdefault("champPos", None)

    # ---- Car-adjusted score ----------------------------------------------
    score_season(drivers, races, teams)

    # Constructors
    constructors = []
    for cid, meta in teams.items():
        members = [d for d in drivers.values() if d["team"] == cid]
        cstats = {
            "id": cid, **meta,
            "drivers": [d["id"] for d in sorted(members, key=lambda x: -x["points"])],
            "points": 0.0, "wins": 0, "podiums": 0, "poles": 0,
            "fastestLaps": 0, "bestFinish": 99, "car": None,
        }
        for race in races:
            for r in race["results"]:
                if r["team"] != cid:
                    continue
                cstats["points"] += r["points"] + r["sprintPoints"]
                if r["finished"] and r["pos"] is not None:
                    cstats["bestFinish"] = min(cstats["bestFinish"], r["pos"])
                    if r["pos"] == 1: cstats["wins"] += 1
                    if r["pos"] <= 3: cstats["podiums"] += 1
                if r["qualiPos"] == 1: cstats["poles"] += 1
                if r["fastestRank"] == 1: cstats["fastestLaps"] += 1
        constructors.append(cstats)
    constructors.sort(key=lambda x: (-x["points"], -x["wins"], -x["podiums"], x["bestFinish"], x["name"]))
    cstand = load(season, "constructorstandings").get("StandingsTable", {}).get("StandingsLists", [])
    c_list = cstand[0]["ConstructorStandings"] if cstand else []
    c_map = {x["Constructor"]["constructorId"]: x for x in c_list}
    for c in constructors:
        c["pointsOnTrack"] = round(c["points"], 1)
        if c["id"] in c_map:
            x = c_map[c["id"]]
            try:
                c["pointsOfficial"] = float(x.get("points", c["points"]) or 0)
                c["points"] = c["pointsOfficial"]
            except ValueError:
                c["points"] = round(c["points"], 1)
            try:
                c["wins"] = int(x.get("wins", c["wins"]) or 0)
            except ValueError:
                pass
            try:
                c["champPos"] = int(x.get("position", 0) or 0)
            except ValueError:
                c["champPos"] = None
        c["points"] = round(c["points"], 1)
        c["car"] = teams.get(c["id"], {}).get("car")
    constructors.sort(key=lambda x: (-x["points"], -x["wins"], -x["podiums"], x["bestFinish"], x["name"]))

    return {
        "year": season,
        "completedRounds": len(races),
        "totalRounds": len(calendar),
        "calendar": calendar,
        "teams": teams,
        "drivers": sorted(drivers.values(), key=lambda d: (-(d["rating"] or 0), -d["points"])),
        "races": races,
        "constructors": constructors,
    }


def _shrink_mean(value: float, n: int) -> float:
    return value * n / (n + 8) if n else 0.0


def _shrink_rate(value: float, n: int, neutral: float = 0.5) -> float:
    return neutral + (value - neutral) * n / (n + 8) if n else neutral


def _strength_delta(delta: float, strength: float) -> float:
    factor = (0.5 + strength) if delta >= 0 else (1.5 - strength)
    return delta * factor


def _strength_rate(value: float, strength: float) -> float:
    dev = value - 0.5
    factor = (0.5 + strength) if dev >= 0 else (1.5 - strength)
    return 0.5 + dev * factor


def score_season(drivers: dict[str, dict], races: list[dict], teams: dict[str, dict]) -> None:
    """Compute descriptive, per-driver season statistics.

    This function builds the metrics shown on the site — average finish and
    qualifying, car-relative performance, teammate deltas and head-to-heads,
    points share, reliability, consistency, car pace and the worst-season
    flag. It does not assign the final ℚ rating: that comes from the
    car-relative quality index in main(), which blends the race-outcome fit,
    teammate points share and the teammate-only fit.

    Every metric based on completed races is shrunk by n / (n + 8), and only
    genuine finishes count as race performances; retirements are not treated
    as classified results.
    """
    # Car pace and expected race position for each race.
    race_car_grid: dict[int, dict[str, float]] = {}
    driver_race: dict[str, dict[int, dict]] = {}
    team_grids: dict[str, list[float]] = {cid: [] for cid in teams}
    team_finishes: dict[str, list[float]] = {cid: [] for cid in teams}
    for race in races:
        by_team: dict[str, dict[str, list[float]]] = {}
        for r in race["results"]:
            driver_race.setdefault(r["driver"], {})[race["round"]] = r
            slot = by_team.setdefault(r["team"], {"g": [], "f": []})
            if r["qualiPos"]:
                slot["g"].append(r["qualiPos"])
            if r["finished"] and r["pos"] is not None:
                slot["f"].append(r["pos"])
        gmap = {}
        for cid, slot in by_team.items():
            if cid not in teams:
                continue
            if slot["g"]:
                gmap[cid] = fmean(slot["g"])
                team_grids[cid].append(min(slot["g"]))
            if slot["f"]:
                team_finishes[cid].append(min(slot["f"]))
        race_car_grid[race["round"]] = gmap

    team_pace: dict[str, float] = {}
    team_grid_pace: dict[str, float] = {}
    for cid in teams:
        grid_avg = fmean(team_grids[cid]) if team_grids[cid] else 22.0
        finish_avg = fmean(team_finishes[cid]) if team_finishes[cid] else 22.0
        team_grid_pace[cid] = grid_avg
        team_pace[cid] = 0.45 * grid_avg + 0.55 * finish_avg
    q_mean = fmean(team_pace.values()) if team_pace else 0.0
    q_sd = pstdev(team_pace.values()) if len(team_pace) > 1 else 1.0
    q_sd = q_sd or 1.0
    for cid, q in team_pace.items():
        teams[cid]["carBase"] = round(q, 2)

    # Rate every driver-season with at least one start and one classified
    # finish. Single-race scores are heavily shrunk toward the middle by the
    # sample-size adjustment below, but they are still real ratings.
    rated = [d for d in drivers.values() if d["starts"] >= 1 and d["avgFinish"] and d["avgQuali"]]
    if len(rated) < 4:
        for d in drivers.values():
            d["rating"] = None
            d["seasonRating"] = None
            d["driverEffect"] = 0.0
            d["driverZ"] = 0.0
            d["car"] = None
            d["carBase"] = None
            d["overFinish"] = None
            d["mateDelta"] = 0.0
            d["qualiDelta"] = 0.0
            d["pointsShare"] = 0.5
        return

    by_id = {d["id"]: d for d in drivers.values()}
    mean_finish = fmean(d["avgFinish"] for d in rated if d["avgFinish"])
    mean_quali = fmean(d["avgQuali"] for d in rated if d["avgQuali"])
    finish_values = [d["avgFinish"] for d in rated if d["avgFinish"]]
    def finish_pct(d):
        if not d.get("avgFinish") or len(finish_values) <= 1:
            return 0.5
        below = sum(1 for x in finish_values if x > d["avgFinish"])
        equal = sum(1 for x in finish_values if x == d["avgFinish"])
        return (below + max(0, equal - 1) / 2) / (len(finish_values) - 1)

    rows = []
    for d in rated:
        mate = by_id.get(d["teammate"]) if d["teammate"] else None
        results = driver_race.get(d["id"], {})
        classified = [r for r in results.values() if r["finished"] and r["pos"] is not None]
        quali_results = [r for r in results.values() if r["qualiPos"]]

        race_over_vals = []
        quali_over_vals = []
        race_deltas = []
        quali_deltas = []
        for race in races:
            rr = results.get(race["round"])
            if not rr:
                continue
            car = race_car_grid.get(race["round"], {}).get(rr["team"])
            if car and rr["finished"] and rr["pos"] is not None:
                race_over_vals.append(car - rr["pos"])
            if car and rr["qualiPos"]:
                quali_over_vals.append(car - rr["qualiPos"])
            if mate:
                mr = driver_race.get(mate["id"], {}).get(race["round"])
                if mr:
                    if rr["finished"] and mr["finished"] and rr["pos"] is not None and mr["pos"] is not None:
                        race_deltas.append(mr["pos"] - rr["pos"])
                    if rr["qualiPos"] and mr["qualiPos"]:
                        quali_deltas.append(mr["qualiPos"] - rr["qualiPos"])

        race_over = _shrink_mean(fmean(race_over_vals) if race_over_vals else 0.0, len(race_over_vals))
        quali_over = _shrink_mean(fmean(quali_over_vals) if quali_over_vals else 0.0, len(quali_over_vals))
        race_delta = _shrink_mean(fmean(race_deltas) if race_deltas else 0.0, len(race_deltas))
        quali_delta = _shrink_mean(fmean(quali_deltas) if quali_deltas else 0.0, len(quali_deltas))

        r_w, r_l = d["raceH2HWins"] or 0, d["raceH2HLosses"] or 0
        q_w, q_l = d["qualiH2HWins"] or 0, d["qualiH2HLosses"] or 0
        race_n, quali_n = r_w + r_l, q_w + q_l
        race_rate = _shrink_rate(r_w / race_n if race_n else 0.5, race_n)
        quali_rate = _shrink_rate(q_w / quali_n if quali_n else 0.5, quali_n)

        strength = finish_pct(mate) if mate else 0.5
        race_delta = _strength_delta(race_delta, strength)
        quali_delta = _strength_delta(quali_delta, strength)
        race_rate = _strength_rate(race_rate, strength)
        quali_rate = _strength_rate(quali_rate, strength)

        rel_raw = d["finishes"] / d["starts"] if d["starts"] else 0.85
        reliability = _shrink_rate(rel_raw, d["starts"], 0.85)
        finish_list = [r["pos"] for r in classified]
        consistency = -(_shrink_mean(pstdev(finish_list) if len(finish_list) > 1 else 0.0, len(finish_list)))

        driver_teams = [res["team"] for race in races for res in race["results"] if res["driver"] == d["id"]]
        car_base = fmean([team_pace.get(tid, 22.0) for tid in driver_teams] or [team_pace.get(d["team"], 22.0)])
        car_grid = fmean([team_grid_pace.get(tid, 22.0) for tid in driver_teams] or [team_grid_pace.get(d["team"], 22.0)])
        d["mateDelta"] = round((mate["avgFinish"] - d["avgFinish"]) if mate and mate.get("avgFinish") else 0.0, 2)
        d["qualiDelta"] = round((mate["avgQuali"] - d["avgQuali"]) if mate and mate.get("avgQuali") else 0.0, 2)
        total_points = d["points"] + (mate["points"] if mate else 0.0)
        d["pointsShare"] = round((d["points"] / total_points) if total_points > 0 else 0.5, 3)
        d["carBase"] = round(car_base, 2)
        d["carGrid"] = round(car_grid, 2)
        d["overFinish"] = round(car_grid - d["avgFinish"], 2)

        finish_n = len(finish_list)
        quali_n = len(quali_results)
        shrink_finish = finish_n / (finish_n + 8) if finish_n else 0.0
        shrink_quali = quali_n / (quali_n + 8) if quali_n else 0.0
        abs_finish = -(mean_finish + (d["avgFinish"] - mean_finish) * shrink_finish)
        abs_quali = -(mean_quali + (d["avgQuali"] - mean_quali) * shrink_quali)
        win_rate = (d["winRate"] or 0.0) * d["starts"] / (d["starts"] + 8)
        podium_rate = (d["podiumRate"] or 0.0) * d["starts"] / (d["starts"] + 8)
        # A share of a tiny team points total is weak evidence. Shrink it
        # toward neutral when the team scored very little.
        team_total = d["points"] + (mate["points"] if mate else 0.0)
        share_reliability = team_total / (team_total + 10.0) if team_total > 0 else 0.0
        adjusted_share = 0.5 + (d["pointsShare"] - 0.5) * share_reliability
        points_share = _shrink_rate(adjusted_share, d["starts"], 0.5)
        rows.append((d, abs_finish, abs_quali, race_over, quali_over, race_delta, race_rate,
                     quali_delta, quali_rate, win_rate, podium_rate, points_share,
                     reliability, consistency))

    # Descriptive per-driver season statistics used by the leaderboard and
    # profile views. The 0-100 rating itself is produced later by the
    # pairwise fit in fit_pairwise(); nothing here is a hand-weighted score.
    for d, *_rest in rows:
        q_w, q_l = d["qualiH2HWins"] or 0, d["qualiH2HLosses"] or 0
        r_w, r_l = d["raceH2HWins"] or 0, d["raceH2HLosses"] or 0
        q_rate = q_w / (q_w + q_l) if (q_w + q_l) else 1.0
        r_rate = r_w / (r_w + r_l) if (r_w + r_l) else 1.0
        worst = (d["starts"] >= 20 and d["points"] == 0 and
                 q_rate <= 0.15 and r_rate <= 0.30 and (d["avgFinish"] or 0) >= 17)
        if worst:
            d["worstSeason"] = True

    for d in drivers.values():
        d.setdefault("driverEffect", 0.0)
        d.setdefault("driverZ", 0.0)
        d.setdefault("rating", None)
        d.setdefault("seasonRating", None)
        d.setdefault("car", None)
        d.setdefault("carBase", None)
        d.setdefault("overFinish", None)
        d.setdefault("mateDelta", 0.0)
        d.setdefault("qualiDelta", 0.0)
        d.setdefault("pointsShare", 0.5)


def _pct_map(paces: dict[str, float]) -> dict[str, float]:
    """Percentile within one race, 100 = best car, 0 = worst car."""
    values = list(paces.values())
    n = len(values)
    if n <= 1:
        return {tid: 50.0 for tid in paces}
    out = {}
    for tid, pace in paces.items():
        below = sum(1 for x in values if x < pace)
        equal = sum(1 for x in values if x == pace)
        out[tid] = 100.0 * (n - 1 - (below + max(0, equal - 1) / 2)) / (n - 1)
    return out


def fit_pairwise(seasons: dict[str, dict]) -> tuple[dict[tuple[int, str], float], dict[tuple[int, str], float]]:
    """Fit a Bradley-Terry model to race head-to-head results.

    Each classified finish contributes pairwise comparisons. The log-odds that
    driver i beats driver j are:

        skill[i] - skill[j] + car[team_i] - car[team_j]

    Driver-season skills and team-season car effects are estimated by maximum
    likelihood with L2 regularisation. This fit supplies the 35% race-outcome
    component of ℚ; the Car score is a separate data-fit team performance
    score.
    """
    driver_index: dict[tuple[int, str], int] = {}
    team_index: dict[tuple[int, str], int] = {}
    driver_keys: list[tuple[int, str]] = []
    team_keys: list[tuple[int, str]] = []
    for y_str, s in seasons.items():
        y = int(y_str)
        for d in s["drivers"]:
            k = (y, d["id"])
            if k not in driver_index:
                driver_index[k] = len(driver_keys)
                driver_keys.append(k)
        for c in s["constructors"]:
            k = (y, c["id"])
            if k not in team_index:
                team_index[k] = len(team_keys)
                team_keys.append(k)

    rows_i: list[int] = []
    rows_j: list[int] = []
    team_i: list[int] = []
    team_j: list[int] = []
    outcomes: list[float] = []
    for y_str, s in seasons.items():
        y = int(y_str)
        for race in s["races"]:
            classified = [r for r in race["results"] if r["finished"] and r["pos"] is not None]
            for a in range(len(classified)):
                ra = classified[a]
                for b in range(a + 1, len(classified)):
                    rb = classified[b]
                    if ra["pos"] == rb["pos"]:
                        continue
                    rows_i.append(driver_index[(y, ra["driver"])])
                    rows_j.append(driver_index[(y, rb["driver"])])
                    team_i.append(team_index[(y, ra["team"])])
                    team_j.append(team_index[(y, rb["team"])])
                    outcomes.append(1.0 if ra["pos"] < rb["pos"] else 0.0)

    if not outcomes:
        return {}, {}
    I = np.asarray(rows_i, dtype=np.int64)
    J = np.asarray(rows_j, dtype=np.int64)
    TI = np.asarray(team_i, dtype=np.int64)
    TJ = np.asarray(team_j, dtype=np.int64)
    Y = np.asarray(outcomes, dtype=np.float64)
    n_drivers = len(driver_keys)
    n_teams = len(team_keys)

    skill = np.zeros(n_drivers, dtype=np.float64)
    car = np.zeros(n_teams, dtype=np.float64)
    ms = np.zeros(n_drivers); vs = np.zeros(n_drivers)
    mc = np.zeros(n_teams); vc = np.zeros(n_teams)
    lr, lam, beta1, beta2, eps = 0.05, 1e-4, 0.9, 0.999, 1e-8
    for step in range(1, 1601):
        z = skill[I] - skill[J] + car[TI] - car[TJ]
        p = 1.0 / (1.0 + np.exp(-z))
        g = (p - Y) / len(Y)
        gs = np.zeros(n_drivers); gc = np.zeros(n_teams)
        np.add.at(gs, I, g); np.add.at(gs, J, -g)
        np.add.at(gc, TI, g); np.add.at(gc, TJ, -g)
        gs += 2 * lam * skill
        gc += 2 * lam * car
        ms = beta1 * ms + (1 - beta1) * gs
        vs = beta2 * vs + (1 - beta2) * gs * gs
        mc = beta1 * mc + (1 - beta1) * gc
        vc = beta2 * vc + (1 - beta2) * gc * gc
        skill -= lr * (ms / (1 - beta1 ** step)) / (np.sqrt(vs / (1 - beta2 ** step)) + eps)
        car -= lr * (mc / (1 - beta1 ** step)) / (np.sqrt(vc / (1 - beta2 ** step)) + eps)
        if step % 400 == 0:
            loss = -np.mean(Y * np.log(p + 1e-12) + (1 - Y) * np.log(1 - p + 1e-12))
            print(f"  pairwise step {step}: log loss {loss:.5f}")

    return (
        {driver_keys[i]: float(skill[i]) for i in range(n_drivers)},
        {team_keys[i]: float(car[i]) for i in range(n_teams)},
    )


def fit_driver_only(seasons: dict[str, dict]) -> dict[tuple[int, str], float]:
    """Fit a driver-only Bradley-Terry model, with no car adjustment.

    This is the diagnostic raw-Q model: every classified race pair counts, but
    there is no team-season car effect. It deliberately rewards absolute
    results, so drivers in good cars rise.
    """
    driver_index: dict[tuple[int, str], int] = {}
    driver_keys: list[tuple[int, str]] = []
    for y_str, s in seasons.items():
        y = int(y_str)
        for d in s["drivers"]:
            k = (y, d["id"])
            if k not in driver_index:
                driver_index[k] = len(driver_keys)
                driver_keys.append(k)

    rows_i: list[int] = []
    rows_j: list[int] = []
    outcomes: list[float] = []
    for y_str, s in seasons.items():
        y = int(y_str)
        for race in s["races"]:
            classified = [r for r in race["results"] if r["finished"] and r["pos"] is not None]
            for a in range(len(classified)):
                ra = classified[a]
                for b in range(a + 1, len(classified)):
                    rb = classified[b]
                    if ra["pos"] == rb["pos"]:
                        continue
                    rows_i.append(driver_index[(y, ra["driver"])])
                    rows_j.append(driver_index[(y, rb["driver"])])
                    outcomes.append(1.0 if ra["pos"] < rb["pos"] else 0.0)

    if not outcomes:
        return {}
    I = np.asarray(rows_i, dtype=np.int64)
    J = np.asarray(rows_j, dtype=np.int64)
    Y = np.asarray(outcomes, dtype=np.float64)
    n_drivers = len(driver_keys)

    skill = np.zeros(n_drivers, dtype=np.float64)
    ms = np.zeros(n_drivers); vs = np.zeros(n_drivers)
    lr, lam, beta1, beta2, eps = 0.05, 1e-4, 0.9, 0.999, 1e-8
    for step in range(1, 1601):
        z = skill[I] - skill[J]
        p = 1.0 / (1.0 + np.exp(-z))
        g = (p - Y) / len(Y)
        gs = np.zeros(n_drivers)
        np.add.at(gs, I, g); np.add.at(gs, J, -g)
        gs += 2 * lam * skill
        ms = beta1 * ms + (1 - beta1) * gs
        vs = beta2 * vs + (1 - beta2) * gs * gs
        skill -= lr * (ms / (1 - beta1 ** step)) / (np.sqrt(vs / (1 - beta2 ** step)) + eps)
        if step % 800 == 0:
            loss = -np.mean(Y * np.log(p + 1e-12) + (1 - Y) * np.log(1 - p + 1e-12))
            print(f"  raw-q step {step}: log loss {loss:.5f}")

    return {driver_keys[i]: float(skill[i]) for i in range(n_drivers)}


def fit_teammate_only(seasons: dict[str, dict]) -> dict[tuple[int, str], float]:
    """Fit a Bradley-Terry model on within-team race comparisons.

    Both drivers share the same car, so only teammate head-to-heads are used.
    Driver-season effects are estimated with L2 regularisation. This is the
    teammate-relative component of the car-adjusted score.
    """
    driver_index: dict[tuple[int, str], int] = {}
    driver_keys: list[tuple[int, str]] = []
    for y_str, s in seasons.items():
        y = int(y_str)
        for d in s["drivers"]:
            k = (y, d["id"])
            if k not in driver_index:
                driver_index[k] = len(driver_keys)
                driver_keys.append(k)

    rows_i: list[int] = []
    rows_j: list[int] = []
    outcomes: list[float] = []
    for y_str, s in seasons.items():
        y = int(y_str)
        for race in s["races"]:
            classified = [r for r in race["results"] if r["finished"] and r["pos"] is not None]
            for a in range(len(classified)):
                ra = classified[a]
                for b in range(a + 1, len(classified)):
                    rb = classified[b]
                    if ra["team"] != rb["team"] or ra["pos"] == rb["pos"]:
                        continue
                    rows_i.append(driver_index[(y, ra["driver"])])
                    rows_j.append(driver_index[(y, rb["driver"])])
                    outcomes.append(1.0 if ra["pos"] < rb["pos"] else 0.0)

    if not outcomes:
        return {}
    I = np.asarray(rows_i, dtype=np.int64)
    J = np.asarray(rows_j, dtype=np.int64)
    Y = np.asarray(outcomes, dtype=np.float64)
    n_drivers = len(driver_keys)

    skill = np.zeros(n_drivers, dtype=np.float64)
    ms = np.zeros(n_drivers); vs = np.zeros(n_drivers)
    lr, lam, beta1, beta2, eps = 0.05, 1e-5, 0.9, 0.999, 1e-8
    for step in range(1, 1601):
        z = skill[I] - skill[J]
        p = 1.0 / (1.0 + np.exp(-z))
        g = (p - Y) / len(Y)
        gs = np.zeros(n_drivers)
        np.add.at(gs, I, g); np.add.at(gs, J, -g)
        gs += 2 * lam * skill
        ms = beta1 * ms + (1 - beta1) * gs
        vs = beta2 * vs + (1 - beta2) * gs * gs
        skill -= lr * (ms / (1 - beta1 ** step)) / (np.sqrt(vs / (1 - beta2 ** step)) + eps)
        if step % 800 == 0:
            loss = -np.mean(Y * np.log(p + 1e-12) + (1 - Y) * np.log(1 - p + 1e-12))
            print(f"  teammate step {step}: log loss {loss:.5f}")

    return {driver_keys[i]: float(skill[i]) for i in range(n_drivers)}


def main() -> None:
    seasons = {}
    for season in reversed(SEASONS):
        print(f"building {season}")
        data = parse_season(season)
        if data:
            seasons[str(season)] = data
    # ---- Race model ------------------------------------------------------
    print("fitting pairwise driver/car model...")
    skills, car_effects = fit_pairwise(seasons)
    for y_str, s in seasons.items():
        y = int(y_str)
        for d in s["drivers"]:
            if skills.get((y, d["id"])) is None:
                d["rating"] = None
                d["seasonRating"] = None
                d["allTimeRating"] = None
                d["allTimeRatingExact"] = None

    # ---- Car dominance score (PCA) ---------------------------------------
    # Car is a data-fit combination of team win rate, points per race, best
    # car rate and raw pace. The first principal component sets the weights;
    # there are no hand-tuned car weights.
    car_rows = []
    for s in seasons.values():
        team_races = {}
        for race in s["races"]:
            for tid in set(r["team"] for r in race["results"]):
                team_races[tid] = team_races.get(tid, 0) + 1
        for race in s["races"]:
            by_team = {}
            for res in race["results"]:
                slot = by_team.setdefault(res["team"], {"g": [], "f": []})
                if res["qualiPos"]:
                    slot["g"].append(res["qualiPos"])
                if res["finished"] and res["pos"] is not None:
                    slot["f"].append(res["pos"])
            paces = {}
            for tid, slot in by_team.items():
                if slot["g"] and slot["f"]:
                    paces[tid] = 0.45 * min(slot["g"]) + 0.55 * min(slot["f"])
            race["_car_pct"] = _pct_map(paces)
        best_counts = {}
        for race in s["races"]:
            pct = race.pop("_car_pct", None) or {}
            if pct:
                best = max(pct, key=pct.get)
                best_counts[best] = best_counts.get(best, 0) + 1
        for c in s["constructors"]:
            c["bestCarRate"] = round(
                100.0 * best_counts.get(c["id"], 0) / max(1, len(s["races"])), 1)
            races = team_races.get(c["id"], 0)
            if races and c.get("carBase") is not None:
                car_rows.append({
                    "c": c,
                    "win": (c.get("wins") or 0) / races,
                    "pts": (c.get("points") or 0) / races,
                    "best": (c.get("bestCarRate") or 0) / 100.0,
                    "pace": -(c.get("carBase") or 22.0),
                })
    if car_rows:
        keys = ["win", "pts", "best", "pace"]
        X = np.array([[row[k] for k in keys] for row in car_rows], dtype=float)
        for j in range(X.shape[1]):
            col = X[:, j]
            mean = col.mean()
            sd = col.std() or 1.0
            X[:, j] = (col - mean) / sd
        _, _, Vt = np.linalg.svd(X, full_matrices=False)
        weights = Vt[0]
        if weights[keys.index("win")] < 0:
            weights = -weights
        scores = X @ weights
        order = sorted(range(len(car_rows)), key=lambda i: -scores[i])
        n_cars = len(order)
        for rank, idx in enumerate(order):
            car_rows[idx]["c"]["car"] = round(
                100.0 * (n_cars - 1 - rank) / max(1, n_cars - 1), 1)
        for s in seasons.values():
            for c in s["constructors"]:
                s["teams"][c["id"]]["car"] = c["car"]
            for d in s["drivers"]:
                counts = d.pop("teamStarts", {}) or {d["team"]: max(1, d["starts"])}
                total = sum(counts.values()) or 1
                d["car"] = round(sum(
                    count * (s["teams"].get(tid, {}).get("car") or 0)
                    for tid, count in counts.items()
                ) / total, 1)

    # ---- Car-relative score ---------------------------------------------
    # One car-adjusted score for both season and all-time views:
    #   35% race-outcome driver skill
    #   30% teammate points share (teammate-strength adjusted)
    #   30% teammate-relative race skill
    #    5% reliability (finishes / starts)
    print("fitting teammate-relative model...")
    teammate_skills = fit_teammate_only(seasons)
    print("fitting raw driver-only model...")
    raw_skills = fit_driver_only(seasons)
    scored = []
    for y_str, s in seasons.items():
        y = int(y_str)
        rated = [
            d for d in s["drivers"]
            if skills.get((y, d["id"])) is not None and d["id"] not in MEMORIAL_DRIVERS.get(y, set())
        ]
        if not rated:
            continue
        theta = {d["id"]: skills[(y, d["id"])] for d in rated}
        team = {d["id"]: teammate_skills.get((y, d["id"]), 0.0) for d in rated}
        by_id = {d["id"]: d for d in rated}
        finish_values = [d["avgFinish"] for d in rated if d.get("avgFinish")]

        def finish_pct(d):
            if not d.get("avgFinish") or len(finish_values) <= 1:
                return 0.5
            below = sum(1 for x in finish_values if x > d["avgFinish"])
            equal = sum(1 for x in finish_values if x == d["avgFinish"])
            return (below + max(0, equal - 1) / 2) / (len(finish_values) - 1)

        # Points component: compare points with the teammate(s) in the same
        # races. This matters for substitutes and drivers who switched teams.
        team_counts = {}
        stint_ratios = {}
        for d in rated:
            did = d["id"]
            by_team = {}
            for race in s["races"]:
                for r in race["results"]:
                    if r["driver"] == did:
                        by_team.setdefault(r["team"], []).append(race)
            team_counts[did] = len(by_team)
            total = 0
            weighted = 0.0
            for tid, races in by_team.items():
                driver_pts = 0.0
                mate_pts = 0.0
                n_races = 0
                for race in races:
                    mine = next((r for r in race["results"] if r["driver"] == did), None)
                    if not mine:
                        continue
                    mates = [r for r in race["results"] if r["team"] == tid and r["driver"] != did]
                    driver_pts += mine.get("points", 0) or 0
                    mate_pts += sum((r.get("points", 0) or 0) for r in mates)
                    n_races += 1
                if n_races:
                    denom = driver_pts + mate_pts
                    weighted += ((driver_pts / denom) if denom > 0 else 0.5) * n_races
                    total += n_races
            stint_ratios[did] = weighted / total if total else 0.5

        shares = {}
        reliability = {}
        wins = {}
        podiums = {}
        for d in rated:
            did = d["id"]
            starts = d.get("starts") or 1
            mate = by_id.get(d.get("teammate")) if d.get("teammate") else None
            strength = finish_pct(mate) if mate else 0.5
            if starts < 10 or team_counts.get(did, 1) > 1:
                raw_share = stint_ratios[did]
            else:
                raw_share = d.get("pointsShare", 0.5)
            share = 0.5 + (raw_share - 0.5) * (0.5 + strength)
            rel = (d.get("finishes") or 0) / max(1, starts)
            win_rate = d.get("winRate") or 0.0
            podium_rate = d.get("podiumRate") or 0.0
            if starts < 10:
                # Small samples are shrunk toward neutral: one or two races
                # should not produce an extreme score.
                factor = starts / (starts + 8)
                share = 0.5 + (share - 0.5) * factor
                theta[did] *= factor
                team[did] *= factor
                rel = 0.85 + (rel - 0.85) * factor
                win_rate *= factor
                podium_rate *= factor
            shares[did] = share
            reliability[did] = rel
            wins[did] = win_rate
            podiums[did] = podium_rate

        mean_theta = fmean(theta.values())
        sd_theta = pstdev(theta.values()) if len(theta) > 1 else 1.0
        sd_theta = sd_theta or 1.0

        def align(values):
            mean = fmean(values.values())
            sd = pstdev(values.values()) if len(values) > 1 else 1.0
            sd = sd or 1.0
            return {k: mean_theta + (v - mean) / sd * sd_theta for k, v in values.items()}

        points_scores = align(shares)
        teammate_scores = align(team)
        reliability_scores = align(reliability)
        win_scores = align(wins)
        podium_scores = align(podiums)
        for d in rated:
            d["_score"] = (
                0.40 * theta[d["id"]] +
                0.20 * points_scores[d["id"]] +
                0.20 * teammate_scores[d["id"]] +
                0.05 * reliability_scores[d["id"]] +
                0.10 * win_scores[d["id"]] +
                0.05 * podium_scores[d["id"]]
            )
            scored.append(d)
    if scored:
        floor = min(d["_score"] for d in scored) - 1e-6
        for d in scored:
            if d.get("worstSeason"):
                d["_score"] = floor

        # Uniform rank scale: every 10-point band holds roughly the same
        # number of driver-seasons. The same value is used by the season and
        # all-time views.
        ascending = sorted(scored, key=lambda d: (d["_score"], d["season"], d["name"]))
        n = len(ascending)
        for i, d in enumerate(ascending):
            exact = 100.0 * i / max(1, n - 1)
            d["ratingExact"] = round(exact, 6)
            d["rating"] = round(exact, 3)
        descending = list(reversed(ascending))
        previous = 100.001
        for d in descending:
            shown = d["rating"]
            if shown >= previous:
                shown = previous - 0.001
            shown = max(0.0, shown)
            d["rating"] = round(shown, 3)
            previous = d["rating"]
        descending[0]["rating"] = 100.0
        descending[0]["ratingExact"] = 100.0
        descending[-1]["rating"] = 0.0
        descending[-1]["ratingExact"] = 0.0
        for d in scored:
            d["seasonRating"] = d["rating"]
            d["allTimeRating"] = d["rating"]
            d["allTimeRatingExact"] = d["ratingExact"]
            d["driverEffect"] = d["_score"]
            d["driverZ"] = d["_score"]
            d.pop("_theta", None)
            d.pop("_podium", None)
            d.pop("_finish", None)
            d.pop("_score", None)

    # ---- Memorial drivers ------------------------------------------------
    # Withhold the rating of the driver who died in that season. Every other
    # driver in the same season keeps a normal rating.
    for y_str, s in seasons.items():
        y = int(y_str)
        if y not in MEMORIAL_SEASONS:
            continue
        s["memorial"] = MEMORIAL_SEASONS[y]
        memorial_ids = MEMORIAL_DRIVERS.get(y, set())
        for d in s["drivers"]:
            if d["id"] not in memorial_ids:
                continue
            d["memorial"] = True
            d["rating"] = None
            d["ratingExact"] = None
            d["seasonRating"] = None
            d["allTimeRating"] = None
            d["allTimeRatingExact"] = None
            d["driverEffect"] = None
            d["driverZ"] = None

    # ---- No-finish seasons -----------------------------------------------
    # A driver who started but never finished has no meaningful race sample.
    # Withhold both Q and Raw Q.
    for s in seasons.values():
        for d in s["drivers"]:
            if (d.get("starts") or 0) > 0 and (d.get("finishes") or 0) == 0:
                d["noFinish"] = True
                d["rating"] = None
                d["ratingExact"] = None
                d["seasonRating"] = None
                d["allTimeRating"] = None
                d["allTimeRatingExact"] = None
                d["driverEffect"] = None
                d["driverZ"] = None

    # ---- Raw Q diagnostic (no car adjustment) ---------------------------
    # Driver-only race skill plus absolute dominance and teammate head-to-head.
    # This is deliberately not car-adjusted: it rewards wins, podiums, average
    # finish and same-car comparisons as well as head-to-head race performance.
    raw_rows = []
    for y_str, s in seasons.items():
        y = int(y_str)
        for d in s["drivers"]:
            skill = raw_skills.get((y, d["id"]))
            if skill is None or d["id"] in MEMORIAL_DRIVERS.get(y, set()) or ((d.get("starts") or 0) > 0 and (d.get("finishes") or 0) == 0):
                d["rawQ"] = None
                d["rawQExact"] = None
                continue
            starts = d.get("starts") or 0
            if starts < 10:
                # Small samples are noisy. Borrow the teammate's same-car
                # estimate instead of letting a handful of races dominate the
                # raw skill. Use the teammate's own driver-only fit (not this
                # driver's teammate head-to-head, which is scored separately).
                mate_id = d.get("teammate")
                mate_skill = raw_skills.get((y, mate_id)) if mate_id else None
                if mate_skill is not None:
                    skill = 0.25 * skill + 0.75 * mate_skill
            d["_raw_skill"] = skill
            d["_raw_win"] = d.get("winRate") or 0.0
            d["_raw_podium"] = d.get("podiumRate") or 0.0
            d["_raw_finish"] = -(d.get("avgFinish") or 20.0)
            rw = d.get("raceH2HWins") or 0
            rl = d.get("raceH2HLosses") or 0
            d["_raw_h2h"] = rw / (rw + rl) if (rw + rl) else 0.5
            raw_rows.append(d)
    if raw_rows:
        def _raw_z(values):
            mean = fmean(values)
            sd = pstdev(values) or 1.0
            return [(v - mean) / sd for v in values]

        skill_z = _raw_z([d["_raw_skill"] for d in raw_rows])
        win_z = _raw_z([d["_raw_win"] for d in raw_rows])
        podium_z = _raw_z([d["_raw_podium"] for d in raw_rows])
        finish_z = _raw_z([d["_raw_finish"] for d in raw_rows])
        h2h_z = _raw_z([d["_raw_h2h"] for d in raw_rows])
        for i, d in enumerate(raw_rows):
            d["_raw_score"] = (
                0.60 * skill_z[i] +
                0.15 * win_z[i] +
                0.10 * podium_z[i] +
                0.05 * finish_z[i] +
                0.10 * h2h_z[i]
            )
        raw_floor = min(d["_raw_score"] for d in raw_rows) - 1e-6
        for d in raw_rows:
            if d.get("worstSeason"):
                d["_raw_score"] = raw_floor
        ascending = sorted(raw_rows, key=lambda d: (d["_raw_score"], d["season"], d["name"]))
        n = len(ascending)
        for i, d in enumerate(ascending):
            exact = 100.0 * i / max(1, n - 1)
            d["rawQExact"] = round(exact, 6)
            d["rawQ"] = round(exact, 3)
        descending = list(reversed(ascending))
        previous = 100.001
        for d in descending:
            shown = d["rawQ"]
            if shown >= previous:
                shown = previous - 0.001
            shown = max(0.0, shown)
            d["rawQ"] = round(shown, 3)
            previous = d["rawQ"]
        descending[0]["rawQ"] = 100.0
        descending[0]["rawQExact"] = 100.0
        descending[-1]["rawQ"] = 0.0
        descending[-1]["rawQExact"] = 0.0
        for d in raw_rows:
            d.pop("_raw_skill", None)
            d.pop("_raw_win", None)
            d.pop("_raw_podium", None)
            d.pop("_raw_finish", None)
            d.pop("_raw_h2h", None)
            d.pop("_raw_score", None)

    by_driver: dict[str, list[dict]] = {}
    for s in seasons.values():
        for d in s["drivers"]:
            if d.get("rating") is not None:
                by_driver.setdefault(d["id"], []).append(d)
    for arr in by_driver.values():
        qs = sorted((d["ratingExact"] for d in arr), reverse=True)
        num = sum(q * (0.9 ** i) for i, q in enumerate(qs))
        den = sum(0.9 ** i for i in range(len(qs)))
        career_q = round(num / den, 3) if den else None
        for d in arr:
            d["careerQ"] = career_q

    for s in seasons.values():
        s["drivers"].sort(key=lambda d: (-(d["rating"] if d["rating"] is not None else -1), -d["points"]))

    # ---- All-time Raw Q vs Car curve -------------------------------------
    curve_rows = [
        d for s in seasons.values() for d in s["drivers"]
        if d.get("rawQ") is not None and d.get("car") is not None and (d.get("starts") or 0) >= 3
    ]
    raw_curve = {}
    if len(curve_rows) > 2:
        def _logit(q):
            p = max(0.001, min(0.999, q / 100.0))
            return math.log(p / (1.0 - p))
        xs = [d["car"] for d in curve_rows]
        ys = [_logit(d["rawQ"]) for d in curve_rows]
        mean_x = fmean(xs)
        mean_y = fmean(ys)
        denom = sum((x - mean_x) ** 2 for x in xs)
        slope = (sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denom) if denom else 0.0
        intercept = mean_y - slope * mean_x
        preds = [100.0 / (1.0 + math.exp(-(intercept + slope * x))) for x in xs]
        raws = [d["rawQ"] for d in curve_rows]
        mean_raw = fmean(raws)
        ss_res = sum((r - p) ** 2 for r, p in zip(raws, preds))
        ss_tot = sum((r - mean_raw) ** 2 for r in raws)
        raw_curve = {
            "a": round(intercept, 6),
            "b": round(slope, 6),
            "n": len(curve_rows),
            "r2": round(1.0 - ss_res / ss_tot, 4) if ss_tot else 0.0,
        }

    payload = {
        "updated": date.today().isoformat(),
        "years": [int(y) for y in sorted(seasons, key=lambda x: -int(x))],
        "seasons": seasons,
        "rawQCurve": raw_curve,
    }
    OUT.write_text(
        "// Auto-generated by scripts/build_data.py from Formula 1 official results\n"
        "// (with a narrow legacy gap-fill for entries Formula 1 omits).\n"
        "window.F1_DATA = " + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
    for y, s in seasons.items():
        top = s["drivers"][0] if s["drivers"] else None
        print(f"  {y}: {len(s['drivers'])} drivers, {s['completedRounds']} rounds" +
              (f", top {top['name']} {top['rating']}" if top else ""))


if __name__ == "__main__":
    main()
