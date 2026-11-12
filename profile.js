/* Driver career — ℚ-score arc, ℚ-rose, season detail and full career table. */
(function () {
  "use strict";
  const U = window.F1U;
  if (!U) return;

  const paramDriver = U.query("driver", U.query("id", ""));
  const paramSeason = U.query("season", "");
  let driverId = paramDriver;
  let career = driverId ? U.career(driverId) : [];
  if (!career.length) {
    const top = U.ranking(U.latestYear)[0] || U.season(U.latestYear).drivers[0];
    driverId = top.id;
    career = U.career(driverId);
  }
  career = career.slice().sort((a, b) => a.season - b.season);
  let selectedSeason = Number(paramSeason);
  if (!career.some((x) => x.season === selectedSeason)) {
    selectedSeason = career[career.length - 1].season;
  }
  let d = U.driver(selectedSeason, driverId);
  let team = U.teamFor(d);
  let rankedSeason = U.ranking(selectedSeason);
  let yrank = rankedSeason.findIndex((x) => x.id === driverId) + 1;
  let teammate = d.teammate ? U.driver(selectedSeason, d.teammate) : null;
  const qual = career.filter((x) => x.rating != null);
  const best = qual.slice().sort((a, b) => b.rating - a.rating)[0] || d;
  const span = career.length ? career[0].season + "–" + career[career.length - 1].season : String(selectedSeason);
  let tierScale = false;

  const main = document.getElementById("profile-main");
  main.style.setProperty("--team", team.color);

  const AXES = [
    ["Race pace", (x) => x.avgFinish, -1],
    ["Qualifying", (x) => x.avgQuali != null ? x.avgQuali : x.avgGrid, -1],
    ["Racecraft", (x) => x.avgGained, 1],
    ["Reliability", (x) => x.reliability, 1],
    ["Race H2H", (x) => h2hRate(x, "race"), 1],
    ["Quali H2H", (x) => h2hRate(x, "quali"), 1],
    ["Podium rate", (x) => x.podiumRate, 1],
    ["Points rate", (x) => x.pointsPerStart, 1],
  ];

  function h2hRate(x, kind) {
    const w = kind === "race" ? x.raceH2HWins : x.qualiH2HWins;
    const l = kind === "race" ? x.raceH2HLosses : x.qualiH2HLosses;
    return (w + l) ? w / (w + l) : 0.5;
  }

  function pct(value, values, higherBetter) {
    if (value == null || !Number.isFinite(Number(value))) return 0;
    const n = values.length;
    if (n <= 1) return 50;
    let below = 0;
    for (const v of values) {
      if (higherBetter ? v < value : v > value) below++;
    }
    return (below / (n - 1)) * 100;
  }

  function radarValues(x) {
    return AXES.map(([, get, dir]) => {
      const vals = rankedSeason.map((z) => Number(get(z) || 0));
      return pct(Number(get(x) || 0), vals, dir > 0);
    });
  }

  function header() {
    const meta = [
      '<span class="team-chip" style="--team:' + team.color + '"><span class="team-dot" style="background:' + team.color + '"></span>' + U.esc(team.name) + "</span>",
      '<span>' + d.flag + " " + U.esc(d.country) + "</span>",
      '<span>Career <b>' + span + "</b></span>",
    ];
    return '<section class="profile-head">' +
      '<div class="profile-number">' + (d.number || "—") + "</div>" +
      '<div class="profile-title"><h1>' + U.esc(d.name) + "</h1>" +
      '<div class="meta">' + meta.join(" · ") + "</div></div>" +
      '<div class="profile-actions">' +
      (teammate ? '<a class="ghost" href="' + U.driverUrl(teammate.id, selectedSeason) + '">Teammate: ' + U.esc(teammate.name) + "</a>" : "") +
      (teammate ? '<a class="ghost" href="index.html?a=' + encodeURIComponent(selectedSeason + "|" + driverId) +
        "&b=" + encodeURIComponent(selectedSeason + "|" + teammate.id) + '" title="Open this season as a custom matchup">Compare vs teammate</a>' : "") +
      '<a class="ghost" href="teams.html?season=' + selectedSeason + '">Team standings</a>' +
      '<a class="ghost" href="leaderboard.html?season=' + selectedSeason + '">Season rankings</a>' +
      "</div></section>" +
      (U.season(selectedSeason)?.memorial
        ? '<p class="muted small" style="margin:12px 0 0">In memory of ' +
          U.esc(U.season(selectedSeason).memorial) + '. Their rating for this season is withheld; the rest of the season is rated normally.</p>'
        : "");
  }

  function statCard(label, value, sub) {
    return '<div class="stat-card" style="--team:' + team.color + '"><div class="label">' + U.esc(label) +
      '</div><div class="value">' + U.esc(value) + '</div><div class="sub">' + U.esc(sub || "") + "</div></div>";
  }

  function heroCards() {
    const totals = career.reduce((a, x) => {
      a.starts += x.starts || 0;
      a.wins += x.wins || 0;
      a.podiums += x.podiums || 0;
      a.points += x.points || 0;
      return a;
    }, { starts: 0, wins: 0, podiums: 0, points: 0 });
    const cards = [
      statCard("Career ℚ", d.careerQ == null ? "—" : U.rating(d.careerQ), "peak-weighted · 0.9 decay"),
      statCard("Best season", U.rating(best.rating), best.season + " · " + U.teamFor(best).name),
      statCard("Seasons", String(career.length), span),
      statCard("Career", totals.starts + " starts", totals.wins + " wins · " + totals.podiums + " podiums · " + U.int(totals.points) + " pts"),
    ];
    return '<section class="profile-hero"><div class="profile-cards">' + cards.join("") + "</div></section>";
  }

  /* ---------- Career ℚ chart ---------- */
  function renderCareerChart() {
    const host = document.getElementById("career-chart");
    if (!host) return;
    const rows = career.slice().sort((a, b) => a.season - b.season);
    const pts = rows.filter((r) => r.rating != null);
    if (!pts.length) { host.innerHTML = '<p class="muted">No rated seasons.</p>'; return; }
    const W = 1000, H = 320, ml = 48, mr = 26, mt = 20, mb = 38;
    const n = rows.length;
    const x = (i) => n === 1 ? (ml + W - mr) / 2 : ml + (i / (n - 1)) * (W - ml - mr);
    const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));
    const bands = U.tierBands();
    const tierIndex = (q) => {
      const v = clamp(q);
      let i = bands.findIndex((b) => v >= b.lo);
      return i < 0 ? bands.length - 1 : i;
    };
    const tierY = (q) => {
      const v = clamp(q);
      const i = tierIndex(v);
      const b = bands[i];
      const frac = b.hi > b.lo ? Math.max(0, Math.min(1, (v - b.lo) / (b.hi - b.lo))) : 0;
      const units = (bands.length - 1 - i) + frac;
      return mt + (H - mt - mb) * (1 - units / bands.length);
    };
    const y = (q) => tierScale ? tierY(q) : mt + (H - mt - mb) * (1 - clamp(q) / 100);
    const tierFor = (q) => bands[tierIndex(q)] || null;

    let svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="ℚ score by season">';
    if (tierScale && bands.length) {
      const edges = bands.map((b) => b.lo).concat([100]);
      for (const v of edges) {
        svg += '<line class="grid" x1="' + ml + '" y1="' + y(v) + '" x2="' + (W - mr) + '" y2="' + y(v) + '"/>';
      }
      bands.forEach((b) => {
        const yc = (y(b.lo) + y(b.hi)) / 2;
        svg += '<text class="axis-label career-tier-no" x="' + (ml - 9) + '" y="' + (yc + 3) +
          '" text-anchor="end" style="fill:' + b.color + '">T' + b.no + "</text>";
      });
    } else {
      for (const v of [0, 25, 50, 75, 100]) {
        svg += '<line class="grid" x1="' + ml + '" y1="' + y(v) + '" x2="' + (W - mr) + '" y2="' + y(v) + '"/>';
        svg += '<text class="axis-label" x="' + (ml - 9) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>";
      }
    }

    const step = Math.max(1, Math.ceil(rows.length / 12));
    rows.forEach((r, i) => {
      if (i % step !== 0 && i !== rows.length - 1) return;
      svg += '<text class="axis-label" x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle">' + r.season + "</text>";
    });

    const line = pts.map((r, i) => (i ? "L" : "M") + x(rows.indexOf(r)) + " " + y(r.rating)).join("");
    if (pts.length > 1) {
      const first = pts[0], last = pts[pts.length - 1];
      svg += '<path class="career-area" d="' + line + "L" + x(rows.indexOf(last)) + " " + (H - mb) +
        "L" + x(rows.indexOf(first)) + " " + (H - mb) + 'Z"/>';
    }
    svg += '<path class="career-line" d="' + line + '"/>';

    const selected = rows.find((r) => r.season === selectedSeason);
    if (selected && selected.rating != null) {
      const sx = x(rows.indexOf(selected));
      svg += '<line class="career-sel" x1="' + sx + '" y1="' + mt + '" x2="' + sx + '" y2="' + (H - mb) + '"/>';
      const tier = tierScale ? tierFor(selected.rating) : null;
      const label = "ℚ " + U.rating(selected.rating) + (tier ? " · T" + tier.no : "");
      svg += '<text class="career-val" x="' + (sx + 7) + '" y="' + (y(selected.rating) - 9) + '">' + label + "</text>";
    }

    pts.forEach((r) => {
      const idx = rows.indexOf(r);
      const tier = tierScale ? tierFor(r.rating) : null;
      const col = tier ? tier.color : U.team(r.season, r.team).color;
      const isSel = r.season === selectedSeason;
      svg += '<circle class="career-dot' + (isSel ? " selected" : "") + '" data-year="' + r.season +
        '" cx="' + x(idx) + '" cy="' + y(r.rating) + '" r="' + (isSel ? 6 : 4.2) +
        '" fill="' + (isSel ? col : "#0b0b0f") + '" stroke="' + col + '" stroke-width="2">' +
        "<title>" + r.season + ": ℚ " + U.rating(r.rating) +
        (tier ? " · T" + tier.no + " (" + tier.name + ")" : "") + "</title></circle>";
    });
    svg += "</svg>";
    host.innerHTML = svg;
    host.querySelectorAll(".career-dot").forEach((dot) => {
      dot.addEventListener("click", () => selectSeason(Number(dot.dataset.year)));
    });
  }

  function careerSection() {
    return '<div class="section"><div class="section-head"><h2>ℚ score by season</h2>' +
      '<div class="chart-head-tools"><span class="hint">Click a point to inspect that season</span>' +
      '<button id="tier-toggle" class="chart-toggle' + (tierScale ? " active" : "") +
      '" type="button" aria-pressed="' + String(tierScale) + '">' +
      (tierScale ? "ℚ points" : "Tiers") + "</button></div></div>" +
      '<div id="career-chart"></div></div>';
  }

  /* ---------- ℚ-rose ---------- */
  function radar() {
    const W = 440, H = 420, cx = W / 2, cy = H / 2 + 4, R = 142;
    const n = AXES.length;
    const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const point = (i, r) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];
    let svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Driver ℚ-rose">';
    for (const frac of [0.25, 0.5, 0.75, 1]) {
      const pts = AXES.map((_, i) => point(i, R * frac).join(",")).join(" ");
      svg += '<polygon points="' + pts + '" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="1"/>';
    }
    AXES.forEach((_, i) => {
      const [x, y] = point(i, R);
      svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" stroke="rgba(255,255,255,.07)"/>';
    });
    const draw = (vals, color, dashed, opacity) => {
      const pts = vals.map((v, i) => point(i, R * (v / 100)).join(",")).join(" ");
      return '<polygon points="' + pts + '" fill="' + color + '" fill-opacity="' + opacity +
        '" stroke="' + color + '" stroke-width="2"' + (dashed ? ' stroke-dasharray="5 4"' : "") + "/>";
    };
    if (teammate && teammate.rating != null) svg += draw(radarValues(teammate), "#9aa0ab", true, 0.04);
    svg += draw(radarValues(d), team.color, false, 0.16);
    AXES.forEach(([label], i) => {
      const [x, y] = point(i, R + 25);
      const anchor = Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end";
      svg += '<text x="' + x + '" y="' + (y + 4) + '" fill="#b9c0ca" font-size="11" font-weight="600" text-anchor="' + anchor + '">' + label + "</text>";
    });
    svg += "</svg>";
    return '<div class="section"><div class="section-head"><h2>ℚ-rose</h2><p>' +
      (teammate ? "Grey dashed = " + U.esc(teammate.name) : "Percentile vs the field") +
      '</p></div><div class="radar-wrap">' + svg + "</div>" +
      '<p class="muted small" style="text-align:center;margin:0">Each spoke is a percentile against the rated drivers of ' + selectedSeason + ".</p></div>";
  }

  /* ---------- Season detail ---------- */
  function seasonDetail() {
    const tier = U.tierForQ(d.rating);
    const bits = [
      ["Team", U.esc(team.name)],
      ["Car", U.int(d.car)],
      ["Championship", "P" + (d.champPos || "—")],
      ["Points", U.int(d.points)],
      ["Wins", d.wins],
      ["Podiums", d.podiums],
      ["Poles", d.poles],
      ["Fastest laps", d.fastestLaps],
      ["Starts", d.starts],
      ["Avg finish", U.fmt(d.avgFinish, 2)],
      ["Avg grid", U.fmt(d.avgGrid, 2)],
      ["Avg quali", U.fmt(d.avgQuali, 2)],
      ["Teammate Δ", (d.mateDelta > 0 ? "+" : "") + U.fmt(d.mateDelta, 2)],
      ["Finish rate", U.pct(d.reliability, 0)],
      ["Sprint points", U.int(d.sprintPoints)],
    ];
    const lines = bits.map(([k, v]) => "<span>" + k + " <b>" + v + "</b></span>").join("");
    const h2h = teammate ? '<div class="h2h-box" style="margin-top:12px">' +
      [["Race H2H", (d.raceH2HWins || 0) + "–" + (d.raceH2HLosses || 0)],
       ["Quali H2H", (d.qualiH2HWins || 0) + "–" + (d.qualiH2HLosses || 0)],
       ["Points", U.int(d.points) + "–" + U.int(teammate.points)],
       ["ℚ", U.rating(d.rating) + "–" + U.rating(teammate.rating)]].map(([l, v]) =>
        '<div class="h2h-card"><div class="big">' + v + '</div><div class="lbl">' + l + "</div></div>").join("") +
      "</div>" : "";
    return '<div class="section"><div class="section-head"><h2>Season detail</h2><p>' + selectedSeason + "</p></div>" +
      '<div class="season-q"><b>ℚ ' + U.rating(d.rating) + "</b><span>#" + (yrank || "—") + " of " + rankedSeason.length +
      (tier ? " · " + tier.name : "") + (d.worstSeason ? " · worst-season floor" : "") + "</span></div>" +
      '<div class="season-line">' + lines + "</div>" + h2h +
      '<p class="muted small" style="margin:10px 0 0">' + (teammate
        ? "Teammate: <a href=\"" + U.driverUrl(teammate.id, selectedSeason) + "\">" + U.esc(teammate.name) + "</a>. Head-to-head counts only races both drivers started."
        : "") + "</p></div>";
  }

  function seasonTable() {
    const rows = career.slice().sort((a, b) => b.season - a.season).map((r) => {
      const t = U.teamFor(r);
      const tier = U.tierForQ(r.rating);
      const sel = r.season === selectedSeason;
      return '<tr class="career-row" data-season="' + r.season + '" style="cursor:pointer' + (sel ? ";background:rgba(225,6,0,.08)" : "") + '">' +
        '<td class="year"><b>' + r.season + "</b></td>" +
        '<td class="name"><span class="team-dot" style="background:' + t.color + '"></span>' + U.esc(t.name) + "</td>" +
        '<td class="rating">' + U.rating(r.rating) + "</td>" +
        (tier ? '<td style="color:' + tier.color + ';font-weight:700">T' + tier.no + "</td>" : "<td>—</td>") +
        '<td class="muted">' + U.int(r.car) + "</td>" +
        "<td>" + (r.champPos || "—") + "</td>" +
        '<td class="points">' + U.int(r.points) + "</td>" +
        "<td>" + r.wins + "</td><td>" + r.podiums + "</td><td>" + r.poles + "</td><td>" + r.fastestLaps + "</td>" +
        "<td>" + r.starts + "</td><td>" + U.fmt(r.avgFinish, 2) + "</td><td>" + U.fmt(r.avgGrid, 2) + "</td><td>" + U.fmt(r.avgQuali, 2) + "</td>" +
        "<td>" + U.pct(r.reliability, 0) + "</td></tr>";
    }).join("");
    return '<div class="section"><div class="section-head"><h2>Entire career</h2><p>Click a row to inspect that season</p></div>' +
      '<div class="table-wrap"><table class="rank-table" style="min-width:980px"><thead><tr>' +
      ["Year", "Team", "ℚ", "Tier", "Car", "C#", "Pts", "Wins", "Podiums", "Poles", "FL", "Starts", "Avg fin", "Avg grid", "Avg quali", "Finish %"].map((h) => "<th>" + h + "</th>").join("") +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>";
  }

  function raceTable() {
    const s = U.season(selectedSeason);
    const rows = s.races.map((race) => {
      const r = U.raceResult(race, driverId);
      if (!r) return "";
      const gained = r.grid > 0 && r.pos && r.finished ? r.grid - r.pos : null;
      const gainTxt = gained == null ? "—" : (gained > 0 ? "+" + gained : String(gained));
      const gainCls = gained > 0 ? "delta-pos" : gained < 0 ? "delta-neg" : "";
      const cls = r.finished ? (r.pos === 1 ? "win" : r.pos && r.pos <= 3 ? "podium" : "") : "";
      return "<tr>" +
        '<td class="rank">' + race.round + "</td>" +
        '<td class="name"><a href="' + U.raceUrl(selectedSeason, race.round) + '">' + U.esc(race.name) + "</a></td>" +
        "<td>" + (r.grid || "PL") + "</td>" +
        '<td class="' + cls + '">' + U.statusLabel(r) + "</td>" +
        '<td class="' + gainCls + '">' + gainTxt + "</td>" +
        '<td class="points">' + U.fmt(r.points, 0) + "</td>" +
        "<td>" + (r.sprintPos != null ? "P" + r.sprintPos + " (" + U.fmt(r.sprintPoints, 0) + ")" : "—") + "</td>" +
        "<td>" + (r.fastestRank === 1 ? "FL" : "—") + "</td>" +
        "<td>" + (r.laps || "—") + "</td>" +
        "<td>" + U.esc(r.status || "—") + "</td></tr>";
    }).join("");
    return '<div class="section"><div class="section-head"><h2>' + selectedSeason + " race by race</h2><p>Grid is the actual starting grid · sprint points in brackets</p></div>" +
      '<div class="table-wrap"><table class="rank-table" style="min-width:900px"><thead><tr>' +
      ["R", "Grand Prix", "Grid", "Finish", "+/−", "Pts", "Sprint", "FL", "Laps", "Status"].map((h) => "<th>" + h + "</th>").join("") +
      "</tr></thead><tbody>" + rows + "</tbody></table></div></div>";
  }

  function populateSelects() {
    const drivers = new Map();
    for (const y of U.years) {
      for (const x of U.season(y).drivers) {
        if (!drivers.has(x.id) || x.season > drivers.get(x.id).season) drivers.set(x.id, x);
      }
    }
    const list = [...drivers.values()].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const ds = document.getElementById("driver-select");
    ds.innerHTML = list.map((x) =>
      '<option value="' + x.id + '"' + (x.id === driverId ? " selected" : "") + ">" +
      U.esc(x.name) + " — " + U.esc(U.teamFor(x).name) + "</option>").join("");
    ds.value = driverId;

    const ss = document.getElementById("season-select");
    ss.innerHTML = career.slice().sort((a, b) => b.season - a.season).map((x) =>
      '<option value="' + x.season + '"' + (x.season === selectedSeason ? " selected" : "") + ">" + x.season + "</option>").join("");
    ss.value = String(selectedSeason);
  }

  function bindSelects() {
    document.getElementById("driver-select").onchange = (e) => {
      const c = U.career(e.target.value);
      const latest = c.length ? c[c.length - 1].season : U.latestYear;
      location.href = "profile.html?driver=" + encodeURIComponent(e.target.value) + "&season=" + latest;
    };
    document.getElementById("season-select").onchange = (e) => selectSeason(Number(e.target.value));
  }

  function updateUrl() {
    const params = new URLSearchParams();
    params.set("driver", driverId);
    params.set("season", String(selectedSeason));
    history.replaceState(null, "", location.pathname + "?" + params.toString());
  }

  function renderPage() {
    d = U.driver(selectedSeason, driverId);
    team = U.teamFor(d);
    rankedSeason = U.ranking(selectedSeason);
    yrank = rankedSeason.findIndex((x) => x.id === driverId) + 1;
    teammate = d.teammate ? U.driver(selectedSeason, d.teammate) : null;
    main.style.setProperty("--team", team.color);
    main.innerHTML = header() + heroCards() + careerSection() +
      '<div class="profile-grid">' + radar() + seasonDetail() + "</div>" +
      seasonTable() + raceTable();
    renderCareerChart();
    const toggle = document.getElementById("tier-toggle");
    toggle.addEventListener("click", (e) => {
      tierScale = !tierScale;
      e.currentTarget.classList.toggle("active", tierScale);
      e.currentTarget.setAttribute("aria-pressed", String(tierScale));
      e.currentTarget.textContent = tierScale ? "ℚ points" : "Tiers";
      renderCareerChart();
    });
    main.querySelectorAll(".career-row").forEach((row) => {
      row.addEventListener("click", () => selectSeason(Number(row.dataset.season)));
    });
    populateSelects();
  }

  function selectSeason(year) {
    if (!career.some((x) => x.season === year) || year === selectedSeason) return;
    const scrollY = window.scrollY;
    selectedSeason = year;
    updateUrl();
    renderPage();
    window.scrollTo(0, scrollY);
  }

  bindSelects();
  renderPage();
})();
