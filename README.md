# F1 Stats — driver ratings, 1980–2026

A stats site for modern Formula 1 built around one question:
**who is actually driving better than the car?**

Wins and championship points are shown for context, but they are **not** inputs
to the headline score. A driver finishing third in a Haas can — and should —
outrank a driver winning in a Mercedes.

## Data

Source: the official [Formula 1 results archive](https://www.formula1.com/en/results/2026/races).
`scripts/fetch_formula1.py` reads the race-result, starting-grid, qualifying,
fastest-lap, sprint and standings tables and writes Ergast-shaped JSON into
`scripts/api_cache/formula1/`.

- Seasons: **1980–2026**
- Driver-seasons are rated from **1 start** (with at least one classified finish);
  the leaderboard defaults to **3+ starts** so one-off appearances stay out of the
  main list.
- 2026 currently covers **19 of 23 rounds** (through the Mexico City GP);
  upcoming rounds stay on the calendar as “upcoming”.
- Earlier seasons are complete.
- The build validates every driver's points against the official standings.
- Races cancelled before the start are detected from the official page and
  skipped when numbering rounds (for example Emilia-Romagna 2023).
- A small legacy gap-fill keeps historical entries that Formula 1 omits from
  its archive — most notably Tyrrell's excluded 1984 season — and preserves the
  existing driver/team IDs. The old Jolpica/Ergast cache remains in
  `scripts/api_cache/` for that purpose.

Data is cached in `scripts/api_cache/formula1/` so rebuilds are offline.

```bash
python3 scripts/fetch_formula1.py --from 2026 --to 2026 --refresh
python3 scripts/build_data.py        # parse + score -> data.js
python3 -m http.server 8000          # open http://localhost:8000
```

The double-clickable `Update Data.command` refreshes the latest season from
formula1.com, rebuilds every rating, prints the biggest ℚ-score changes
(old rating → new rating, Δ, starts), and bumps the `?v=` cache token on every
page.

## The ℚ score

**ℚ** is a single 0–100 car-relative driver-season score. The same value is used
in the season view and the all-time view; filtering to a season only changes
which rows are shown, not how the score is calculated.

It combines six fixed components, weighted the same way for every
driver-season:

| Component | Weight | What it captures |
| --- | ---: | --- |
| Race-outcome skill | 40% | Bradley-Terry pairwise fit on every classified race pair, with team-season car effects |
| Teammate points share | 20% | Share of the team's points, adjusted for teammate strength and standardised inside the season |
| Teammate-relative skill | 20% | Bradley-Terry pairwise fit on teammate head-to-heads only |
| Win rate | 10% | Wins divided by starts, standardised inside the season |
| Podium rate | 5% | Podiums divided by starts, standardised inside the season |
| Reliability | 5% | Finishes divided by starts, standardised inside the season |

The race-outcome fit uses **87,319 head-to-head pairs** across **1,316
driver-seasons** and **585 team-seasons**, with a log loss of **0.380** per
pair. The teammate fit uses **4,359 within-team pairs**. Each component is
standardised inside its season and aligned to that season's race-skill scale,
so the blend preserves between-season differences. The weights are fixed for
every season: **40% race-outcome, 20% teammate points share, 20%
teammate-relative skill, 10% win rate, 5% podium rate, 5% reliability**.
Points share built against a weak teammate is shrunk toward neutral before it
enters the index. Drivers with fewer than 10 starts are shrunk toward neutral,
so a one- or two-race substitute does not get an extreme score. For drivers who
raced for more than one team, the points component compares them with the
teammate in the same races.

ℚ is placed on a uniform 0–100 rank scale: the best season is exactly **100**,
the worst is exactly **0**, and every 10-point band contains roughly the same
number of driver-seasons. Each value is stored with six decimals for
uniqueness and displayed to three; hover a score to see the exact value.

The only hard rule is the **worst-season floor**: a full 20+ race season with
zero points, fewer than 15% of qualifying wins and fewer than 30% of race wins
against the teammate is pinned below the rest of the field. That currently
applies only to Mazepin 2021, who is the 0.000.

Why this shape:

- **Race skill alone rewards the car.** The pairwise race fit is the best
  predictor of results, but it puts drivers in fast cars near the top.
- **Teammates are the cleanest car-controlled test.** The teammate fit and
  points share give the index its car-relative signal.
- **Absolute results still count.** Win rate and podium rate keep dominant
  seasons high even when the teammate comparison is close, so an elite
  same-team fight such as Senna and Prost in 1988 is not penalised twice.
- **Reliability matters.** A driver who finishes 18 of 19 races should not lose
  to a faster but more fragile season.
- **No championship bonus.** The title is not a separate input.
- **One score everywhere.** Season and all-time views always show the same ℚ
  for the same driver-season, and both are car-adjusted.
- **Car is a data-fit team score.** It combines win rate, points per race,
  best car rate and raw pace through the first principal component; there are
  no hand-tuned car weights.
- **Driver Car is stint-weighted.** A mid-season switch is weighted by the
  starts actually made for each team.
- **Qualifying is not yet included.** The fits use race classifications only.
- **No-finish seasons are unrated.** A driver who started but never finished
  has no Q and no Raw Q.
- **Memorial seasons are rated for everyone else.** In a season where a driver
  died, only that driver's rating is withheld; every other driver keeps a
  normal ℚ and Raw Q.
- **Raw Q diagnostic.** A separate no-car score combining race skill, win
  rate, podium rate, average finish and teammate head-to-head. Small samples
  borrow their teammate's same-car skill estimate. It is shown as a rankings
  column and as the y-axis on the Raw Q vs car performance chart. That chart
  uses a fixed all-time logistic curve, and the charts season selector has an
  All time option. It is a diagnostic, not the headline ℚ.

## Pages

- `index.html` — “Which season is better?” Pick between two driver-seasons
  from their stat lines, then reveal ℚ, Car and season rank. Game stats are
  per-start rates (win %, podium %, pole %, points finish %, team points %, finish %)
  and averages (avg finish, avg grid, teammate H2H, positions gained),
  so eras compare fairly; hover for the raw breakdown.
- `leaderboard.html` — every driver-season, sortable by ℚ, Car, mate delta,
  points, wins, podiums, poles, fastest laps, average finish, average grid,
  average qualifying, positions gained and DNFs. Filter by season, starts,
  ℚ range and search.
- `charts.html` — championship progression, ℚ vs car strength (who outperforms
  the machinery), Raw Q vs car, every season's best driver in All time mode,
  constructor points and a full season form guide.
- `profile.html?driver=...&season=...` — career dashboard: peak-weighted career
  ℚ, best season, career totals, a ℚ arc with a **Tiers** mode, ℚ-rose,
  season-by-season table, teammate duel and race-by-race results.
- `races.html?season=...` — full calendar; click a completed round for the
  classification and sprint result.
- `teams.html?season=...` — constructor standings with Car score, driver
  breakdown and cumulative points sparkline.
- `cars.html` — all-time car rankings: every team-season sorted by Car, with
  pace, points, wins, podiums, poles and drivers.
- `tiers.html` — the field split into eight car-adjusted bands, with three
  example driver-seasons per tier, all seasons or one season at a time.
- `method.html` — the full methodology: the six ℚ components, pairwise
  fit, uniform scale, retirement handling, Car estimation, leaderboard column
  guide and model limits.
- The primary nav is shared across every page. Driver profiles include a
  **Compare vs teammate** action that opens the game as a custom matchup
  (`index.html?a=2025|norris&b=2025|piastri`).

## Notes

- Before 1994, detailed qualifying data is sparse; the starting grid is used for the raw pace diagnostic and for pole counts.
- Championship totals use the official standings, including dropped-score rules in older seasons.
- Car performance is fitted from race classifications. The separate pace and
  best-car diagnostics use raw weekend pace; track points are shown for context
  and are not fed into the fit.

- Only genuine finishes count as race performances. A classified retirement
  (for example P18 with status “Retired”) is excluded from average race finish,
  car-relative race pace and finish consistency; reliability counts actual
  finishes only. This prevents one late retirement from being penalised four
  times while an early retirement is treated as neutral.
- “Grid” is the actual starting grid. Average grid excludes pit-lane starts.
- DNF includes retirements, disqualifications and non-classifications.
- Drivers who changed teams mid-season are attributed to the car they drove in
  each race; the constructor table sums those race-by-race points.
- The front end is dependency-free: `data.js` plus vanilla JS and SVG.
