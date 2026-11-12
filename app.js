/* Which F1 driver-season is better? — game logic. */
(function () {
  "use strict";
  const U = window.F1U;
  if (!U) return;

  const pct = (part, whole) => whole ? (part / whole) * 100 : 0;
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const h2hRate = (d) => {
    const w = d.raceH2HWins || 0, l = d.raceH2HLosses || 0;
    return (w + l) ? (w / (w + l)) * 100 : 50;
  };

  const MAIN_COLS = [
    { key: "winPct", label: "Win %", digits: 1, low: false,
      get: (d) => pct(d.wins, d.starts), meter: (d) => pct(d.wins, d.starts),
      raw: (d) => d.wins + " wins / " + d.starts + " starts" },
    { key: "podiumPct", label: "Podium %", digits: 1, low: false,
      get: (d) => pct(d.podiums, d.starts), meter: (d) => pct(d.podiums, d.starts),
      raw: (d) => d.podiums + " podiums / " + d.starts + " starts" },
    { key: "polePct", label: "Pole %", digits: 1, low: false,
      get: (d) => pct(d.poles, d.starts), meter: (d) => pct(d.poles, d.starts),
      raw: (d) => d.poles + " poles / " + d.starts + " starts" },
    { key: "pointsFinishPct", label: "Points %", digits: 1, low: false,
      get: (d) => pct(d.pointsFinishes, d.starts), meter: (d) => pct(d.pointsFinishes, d.starts),
      raw: (d) => d.pointsFinishes + " points finishes / " + d.starts + " starts" },
    { key: "teamPtsPct", label: "Team pts %", digits: 1, low: false,
      get: (d) => d.pointsShare * 100, meter: (d) => d.pointsShare * 100,
      raw: (d) => U.pct(d.pointsShare, 1) + " of the team's points" },
    { key: "finishPct", label: "Finish %", digits: 1, low: false,
      get: (d) => d.reliability * 100, meter: (d) => d.reliability * 100,
      raw: (d) => (d.starts - d.dnf) + " finished / " + d.starts + " starts" },
    { key: "avgFinish", label: "Avg finish", digits: 2, low: true,
      get: (d) => d.avgFinish, meter: (d) => d.avgFinish ? clamp((21 - d.avgFinish) / 20 * 100) : 0,
      raw: (d) => "Average race finish " + U.fmt(d.avgFinish, 2) + " (" + (d.starts - d.dnf) + " finishes)" },
    { key: "avgGrid", label: "Avg grid", digits: 2, low: true,
      get: (d) => d.avgGrid, meter: (d) => d.avgGrid ? clamp((21 - d.avgGrid) / 20 * 100) : 0,
      raw: (d) => "Average starting grid " + U.fmt(d.avgGrid, 2) },
    { key: "h2h", label: "Teammate H2H", digits: 1, low: false,
      get: (d) => h2hRate(d), meter: (d) => h2hRate(d),
      raw: (d) => (d.raceH2HWins || 0) + "–" + (d.raceH2HLosses || 0) + " vs teammate" },
    { key: "gained", label: "Positions gained", digits: 2, low: false,
      get: (d) => d.avgGained, meter: (d) => clamp((Number(d.avgGained || 0) + 5) / 10 * 100),
      raw: (d) => (d.avgGained > 0 ? "+" : "") + U.fmt(d.avgGained, 2) + " places per race" },
  ];

  const state = {
    year: U.query("season", String(U.latestYear)),
    pair: null,
    revealed: false,
    correct: 0,
    wrong: 0,
    streak: 0,
    bestStreak: Number(localStorage.getItem("f1_best_streak_d") || 0),
    customMode: false,
  };
  if (state.year !== "" && !U.season(state.year)) state.year = String(U.latestYear);

  let FILTERED_POOLS = {};
  const rankOf = new Map();
  function rebuildRanks() {
    rankOf.clear();
    if (state.year === "") {
      U.ranking().forEach((d, i) => rankOf.set(U.driverKey(d), i + 1));
    } else {
      U.ranking(state.year).forEach((d, i) => rankOf.set(U.driverKey(d), i + 1));
    }
  }

  const els = {
    cardA: document.getElementById("card-a"),
    cardB: document.getElementById("card-b"),
    labelA: document.getElementById("label-a"),
    labelB: document.getElementById("label-b"),
    eraA: document.getElementById("era-a"),
    eraB: document.getElementById("era-b"),
    badgeA: document.getElementById("badge-a"),
    badgeB: document.getElementById("badge-b"),
    statsA: document.getElementById("stats-a"),
    statsB: document.getElementById("stats-b"),
    seasonSelect: document.getElementById("season-select"),
    startsSelect: document.getElementById("starts-select"),
    startsValue: document.getElementById("starts-value"),
    teamSelect: document.getElementById("team-select"),
    ratingInput: document.getElementById("rating-input"),
    ratingMaxInput: document.getElementById("rating-max-input"),
    result: document.getElementById("result"),
    resultText: document.getElementById("result-text"),
    again: document.getElementById("again-btn"),
    customToggle: document.getElementById("custom-toggle"),
    customPanel: document.querySelector(".custom"),
    scoreEl: document.querySelector(".score"),
    streakEl: document.querySelector(".streak"),
    bestEl: document.querySelector(".best"),
  };

  function entries() {
    return state.year === "" ? U.all() : U.season(state.year).drivers;
  }

  function fillTeams() {
    const names = new Set();
    for (const d of entries()) names.add(U.teamFor(d).name);
    const current = els.teamSelect.value;
    els.teamSelect.innerHTML = '<option value="">All teams</option>' +
      [...names].sort().map((n) => '<option value="' + U.esc(n) + '">' + U.esc(n) + "</option>").join("");
    if ([...names].includes(current)) els.teamSelect.value = current;
  }

  function numInput(el) {
    const raw = el.value.trim();
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  function getPool() {
    const minStarts = Number(els.startsSelect.value);
    const team = els.teamSelect.value;
    const minD = numInput(els.ratingInput);
    const maxD = numInput(els.ratingMaxInput);
    const key = [state.year, minStarts, team, minD, maxD].join("|");
    if (FILTERED_POOLS[key]) return FILTERED_POOLS[key];
    const pool = entries().filter((d) => {
      if (d.rating == null) return false;
      if (d.starts < minStarts) return false;
      if (team && U.teamFor(d).name !== team) return false;
      if (minD != null && d.rating < minD) return false;
      if (maxD != null && d.rating > maxD) return false;
      return true;
    });
    FILTERED_POOLS[key] = pool;
    return pool;
  }

  const PAIR_WINDOW = 6.0;
  const MIN_GAP = 0.2;

  function pickPairInPool(pool, width) {
    if (pool.length < 2) return null;
    const sorted = pool.slice().sort((a, b) => a.rating - b.rating);
    let lo = 0;
    const anchors = [];
    for (let hi = 0; hi < sorted.length; hi++) {
      while (lo < hi && sorted[hi].rating - sorted[lo].rating > width) lo++;
      if (lo >= hi) continue;
      const threshold = sorted[hi].rating - MIN_GAP;
      let left = lo, right = hi;
      while (left < right) {
        const mid = (left + right) >> 1;
        if (sorted[mid].rating >= threshold) right = mid;
        else left = mid + 1;
      }
      const bmax = left - 1;
      if (bmax >= lo) anchors.push([hi, lo, bmax]);
    }
    if (!anchors.length) return null;
    const [hi, plo, phi] = anchors[Math.floor(Math.random() * anchors.length)];
    const a = sorted[hi];
    const b = sorted[plo + Math.floor(Math.random() * (phi - plo + 1))];
    return Math.random() < 0.5 ? [a, b] : [b, a];
  }

  function pickPair() {
    const pool = getPool();
    for (const w of [PAIR_WINDOW, PAIR_WINDOW * 2, PAIR_WINDOW * 4, Infinity]) {
      const pair = pickPairInPool(pool, w);
      if (pair) return pair;
    }
    return null;
  }

  function statValue(d, metric) {
    const v = Number(metric.get(d));
    return Number.isFinite(v) ? v : null;
  }

  function statText(d, metric) {
    const v = statValue(d, metric);
    if (v === null) return "—";
    if (metric.key.endsWith("Pct") || metric.key === "h2h") return U.fmt(v, metric.digits) + "%";
    if (metric.key === "gained") return (v > 0 ? "+" : "") + U.fmt(v, metric.digits);
    return U.fmt(v, metric.digits);
  }

  function renderStats(el, d) {
    el.innerHTML = "";
    for (const metric of MAIN_COLS) {
      const v = statValue(d, metric);
      const pct = v === null ? 0 : metric.meter(d);
      const row = document.createElement("div");
      row.className = "stat-row";
      row.dataset.stat = metric.key;
      row.title = metric.raw(d);
      row.style.setProperty("--pct", Math.max(0, Math.min(100, pct)));
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = metric.label;
      const val = document.createElement("span");
      val.className = "v";
      val.textContent = statText(d, metric);
      const meter = document.createElement("span");
      meter.className = "meter";
      row.appendChild(k);
      row.appendChild(val);
      row.appendChild(meter);
      el.appendChild(row);
    }
  }

  function refreshScore() {
    els.scoreEl.textContent = state.correct + " points";
    els.streakEl.textContent = "🔥 " + state.streak;
    els.bestEl.textContent = "👑 " + state.bestStreak;
  }

  function resetBoard() {
    state.revealed = false;
    state.pair = null;
    for (const card of [els.cardA, els.cardB]) {
      card.classList.remove("locked", "picked", "winner", "loser");
      card.style.removeProperty("--team");
      card.removeAttribute("data-number");
    }
    els.badgeA.classList.add("hidden");
    els.badgeB.classList.add("hidden");
    els.eraA.classList.add("hidden");
    els.eraB.classList.add("hidden");
    els.labelA.textContent = "Driver A";
    els.labelB.textContent = "Driver B";
    els.statsA.innerHTML = "";
    els.statsB.innerHTML = "";
  }

  function newRound(pairOverride) {
    let pair = pairOverride;
    let reason = "";
    if (!pair) {
      pair = pickPair();
      if (!pair) reason = getPool().length < 2 ? "empty" : "nopair";
    }
    state.customMode = !!pairOverride;
    if (!pair) {
      resetBoard();
      els.resultText.textContent = reason === "empty"
        ? "No driver-seasons meet the current filters. Lower Min starts or clear the ℚ limits."
        : "No close pair found with these filters. Widen the ℚ range.";
      els.result.classList.remove("hidden");
      return;
    }
    state.revealed = false;
    state.pair = pair;
    const [pa, pb] = pair;
    const url = new URLSearchParams(location.search);
    if (pairOverride) {
      url.set("a", pa.season + "|" + pa.id);
      url.set("b", pb.season + "|" + pb.id);
    } else {
      url.delete("a");
      url.delete("b");
    }
    history.replaceState(null, "", location.pathname + (url.toString() ? "?" + url.toString() : ""));
    for (const card of [els.cardA, els.cardB]) {
      card.classList.remove("locked", "picked", "winner", "loser");
    }
    els.badgeA.classList.add("hidden");
    els.badgeB.classList.add("hidden");
    els.result.classList.add("hidden");
    for (const row of document.querySelectorAll(".stat-row")) row.classList.remove("lead");

    const [a, b] = pair;
    for (const [card, d] of [[els.cardA, a], [els.cardB, b]]) {
      card.style.setProperty("--team", U.color(d));
      card.setAttribute("data-number", d.number || "");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", "Select " + (card === els.cardA ? "Driver A" : "Driver B"));
    }
    const showSeason = state.year === "" || state.customMode;
    els.eraA.textContent = a.season;
    els.eraB.textContent = b.season;
    els.eraA.classList.toggle("hidden", !showSeason);
    els.eraB.classList.toggle("hidden", !showSeason);
    els.labelA.textContent = "Driver A";
    els.labelB.textContent = "Driver B";
    renderStats(els.statsA, a);
    renderStats(els.statsB, b);

    for (const card of [els.cardA, els.cardB]) {
      card.classList.remove("card-in");
      void card.offsetWidth;
      card.classList.add("card-in");
    }
  }

  function reveal(pickIndex) {
    if (state.revealed || !state.pair) return;
    state.revealed = true;
    const [a, b] = state.pair;
    const winnerIdx = Math.abs(a.rating - b.rating) < 0.05 ? -1 : (a.rating > b.rating ? 0 : 1);

    for (let i = 0; i < 2; i++) {
      const d = i === 0 ? a : b;
      const label = i === 0 ? els.labelA : els.labelB;
      const badge = i === 0 ? els.badgeA : els.badgeB;
      const card = i === 0 ? els.cardA : els.cardB;
      const team = U.teamFor(d);
      label.innerHTML =
        '<span class="real-name">' + U.esc(d.name) + "</span>" +
        '<span class="driver-meta">' + U.esc(team.name) + " · " + d.season + " · ℚ " + U.rating(d.rating) +
        " · Car " + U.int(d.car) + " · Yr#" + (rankOf.get(U.driverKey(d)) || "—") +
        ' <a class="player-link" href="' + U.driverUrl(d.id, d.season) + '" onclick="event.stopPropagation()">Profile →</a></span>';
      if (winnerIdx === -1) {
        badge.textContent = "TIE";
        badge.className = "badge tie";
      } else if (i === winnerIdx) {
        badge.textContent = "BETTER";
        badge.className = "badge good";
      } else {
        badge.textContent = i === pickIndex ? "✗ Pick" : "·";
        badge.className = i === pickIndex ? "badge miss" : "badge";
      }
      badge.classList.remove("hidden");
      card.classList.add("locked");
      card.removeAttribute("role");
      card.removeAttribute("tabindex");
      card.removeAttribute("aria-label");
    }

    for (const metric of MAIN_COLS) {
      const av = statValue(a, metric);
      const bv = statValue(b, metric);
      if (av === null || bv === null) continue;
      const aLead = metric.low ? av < bv : av > bv;
      const bLead = metric.low ? bv < av : bv > av;
      const aRow = els.statsA.querySelector('.stat-row[data-stat="' + metric.key + '"]');
      const bRow = els.statsB.querySelector('.stat-row[data-stat="' + metric.key + '"]');
      if (aRow) aRow.classList.toggle("lead", aLead);
      if (bRow) bRow.classList.toggle("lead", bLead);
    }

    if (winnerIdx === -1) {
      els.cardA.classList.add("winner");
      els.cardB.classList.add("winner");
      els.resultText.innerHTML = '<span class="tie">Dead heat.</span> Both seasons rate ' +
        U.rating(a.rating) + " on the car-adjusted scale.";
    } else {
      const winner = winnerIdx === 0 ? a : b;
      const loser = winnerIdx === 0 ? b : a;
      (winnerIdx === 0 ? els.cardA : els.cardB).classList.add("winner");
      if (pickIndex === winnerIdx) {
        state.correct += 1;
        state.streak += 1;
        if (state.streak > state.bestStreak) {
          state.bestStreak = state.streak;
          localStorage.setItem("f1_best_streak_d", String(state.bestStreak));
        }
        els.resultText.innerHTML = '<span class="correct">Correct!</span> ' +
          U.esc(winner.name) + " " + winner.season + " is the stronger season (ℚ " +
          U.rating(winner.rating) + " vs " + U.rating(loser.rating) + ").";
      } else {
        state.wrong += 1;
        state.streak = 0;
        (pickIndex === 0 ? els.cardA : els.cardB).classList.add("loser");
        els.resultText.innerHTML = '<span class="wrong">Wrong.</span> ' +
          U.esc(winner.name) + " " + winner.season + " rates higher (ℚ " +
          U.rating(winner.rating) + " vs " + U.rating(loser.rating) + ").";
      }
    }
    els.result.classList.remove("hidden");
    refreshScore();
  }

  for (const [card, idx] of [[els.cardA, 0], [els.cardB, 1]]) {
    card.addEventListener("click", () => { card.classList.add("picked"); reveal(idx); });
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      card.classList.add("picked");
      reveal(idx);
    });
  }
  els.again.addEventListener("click", () => newRound());
  els.customToggle.addEventListener("click", toggleCustom);

  els.seasonSelect.addEventListener("change", () => {
    state.year = els.seasonSelect.value;
    FILTERED_POOLS = {};
    rebuildRanks();
    fillTeams();
    newRound();
  });
  els.startsSelect.addEventListener("input", () => {
    els.startsValue.textContent = els.startsSelect.value;
    FILTERED_POOLS = {};
    newRound();
  });
  els.teamSelect.addEventListener("change", () => { FILTERED_POOLS = {}; newRound(); });
  els.ratingInput.addEventListener("input", () => { FILTERED_POOLS = {}; newRound(); });
  els.ratingMaxInput.addEventListener("input", () => { FILTERED_POOLS = {}; newRound(); });

  /* ---------- Custom matchup ---------- */
  function toggleCustom() {
    const opening = els.customPanel.classList.contains("hidden");
    els.customPanel.classList.toggle("hidden", !opening);
    els.customToggle.classList.toggle("active", opening);
    els.customToggle.setAttribute("aria-expanded", String(opening));
    if (opening) document.getElementById("match-a").focus();
  }

  const custom = { a: null, b: null };

  function candidates(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const ym = q.match(/((?:19|20)\d\d)/);
    const year = ym ? Number(ym[1]) : null;
    const text = q.replace(/(?:19|20)\d\d/g, "").trim();
    return U.all()
      .filter((d) => {
        if (year && d.season !== year) return false;
        if (!text) return true;
        return d.name.toLowerCase().includes(text) || d.code.toLowerCase() === text ||
          U.teamFor(d).name.toLowerCase().includes(text);
      })
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, 8);
  }

  function showSuggestions(side) {
    const box = document.getElementById("suggest-" + side);
    const input = document.getElementById("match-" + side);
    const list = candidates(input.value);
    box.innerHTML = "";
    if (!list.length) { box.classList.add("hidden"); return; }
    for (const d of list) {
      const item = document.createElement("div");
      item.className = "sug-item";
      item.textContent = d.name + " — " + d.season + " " + U.teamFor(d).name + " (ℚ " + U.rating(d.rating) + ")";
      item.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        custom[side] = d;
        input.value = d.name + " " + d.season;
        box.classList.add("hidden");
      });
      box.appendChild(item);
    }
    box.classList.remove("hidden");
  }

  function playCustom() {
    const a = custom.a || candidates(document.getElementById("match-a").value)[0];
    const b = custom.b || candidates(document.getElementById("match-b").value)[0];
    if (!a || !b) {
      els.resultText.textContent = "Couldn't find one of those driver-seasons. Try “Hamilton 2018”.";
      els.result.classList.remove("hidden");
      return;
    }
    if (U.driverKey(a) === U.driverKey(b)) {
      els.resultText.textContent = "Pick two different driver-seasons!";
      els.result.classList.remove("hidden");
      return;
    }
    newRound([a, b]);
  }

  for (const side of ["a", "b"]) {
    const input = document.getElementById("match-" + side);
    input.addEventListener("input", () => { custom[side] = null; showSuggestions(side); });
    input.addEventListener("blur", () => setTimeout(() => {
      document.getElementById("suggest-" + side).classList.add("hidden");
    }, 140));
    input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") playCustom(); });
  }
  document.getElementById("custom-btn").addEventListener("click", playCustom);

  function pairFromParam(value) {
    if (!value || !value.includes("|")) return null;
    const [season, id] = value.split("|");
    const d = U.driver(Number(season), id);
    return d && d.rating != null ? d : null;
  }

  function init() {
    const deepA = pairFromParam(U.query("a", ""));
    const deepB = pairFromParam(U.query("b", ""));
    els.seasonSelect.innerHTML = U.seasonOptions(state.year, true);
    els.seasonSelect.value = state.year;
    els.startsSelect.max = String(Math.max(1, ...U.all().map((d) => d.starts)));
    els.startsSelect.value = String(Math.min(5, Number(els.startsSelect.max)));
    els.startsValue.textContent = els.startsSelect.value;
    rebuildRanks();
    fillTeams();
    refreshScore();
    if (deepA && deepB && U.driverKey(deepA) !== U.driverKey(deepB)) {
      custom.a = deepA;
      custom.b = deepB;
      els.customPanel.classList.remove("hidden");
      els.customToggle.classList.add("active");
      els.customToggle.setAttribute("aria-expanded", "true");
      document.getElementById("match-a").value = deepA.name + " " + deepA.season;
      document.getElementById("match-b").value = deepB.name + " " + deepB.season;
      newRound([deepA, deepB]);
    } else {
      newRound();
    }
  }

  init();
})();
