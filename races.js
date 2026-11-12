/* Race calendar + results, multi-season. */
(function () {
  "use strict";
  const U = window.F1U;
  if (!U) return;

  let year = Number(U.query("season", U.latestYear));
  if (!U.season(year)) year = U.latestYear;
  let season = U.season(year);
  let filter = "all";
  let selectedRound = Number(U.query("race", 0)) || null;

  const FLAGS = {
    Australia: "🇦🇺", China: "🇨🇳", Japan: "🇯🇵", "United States": "🇺🇸",
    Canada: "🇨🇦", Monaco: "🇲🇨", Spain: "🇪🇸", Austria: "🇦🇹",
    "United Kingdom": "🇬🇧", Belgium: "🇧🇪", Hungary: "🇭🇺", Netherlands: "🇳🇱",
    Italy: "🇮🇹", Azerbaijan: "🇦🇿", Bahrain: "🇧🇭", Singapore: "🇸🇬",
    Mexico: "🇲🇽", Brazil: "🇧🇷", Qatar: "🇶🇦", "United Arab Emirates": "🇦🇪",
    Germany: "🇩🇪", France: "🇫🇷", Turkey: "🇹🇷", Russia: "🇷🇺",
    Malaysia: "🇲🇾", Korea: "🇰🇷", India: "🇮🇳", Vietnam: "🇻🇳",
    Portugal: "🇵🇹", Switzerland: "🇨🇭", Sweden: "🇸🇪", "South Africa": "🇿🇦",
    Argentina: "🇦🇷", "San Marino": "🇸🇲", Luxembourg: "🇱🇺", Europe: "🇪🇺",
    Pacific: "🌏", UAE: "🇦🇪", "United States": "🇺🇸",
  };
  const flag = (race) => FLAGS[race.country] || "🏁";
  const byRound = new Map(season.races.map((r) => [r.round, r]));

  function statCards() {
    const done = season.races;
    const winners = new Set(done.map((r) => r.winner).filter(Boolean));
    const poles = new Set(done.map((r) => r.pole).filter(Boolean));
    const fls = new Set(done.map((r) => r.fastestLap).filter(Boolean));
    const sprints = done.filter((r) => r.sprint).length;
    const next = season.calendar.find((r) => r.status === "upcoming");
    const rows = [
      ["Rounds complete", done.length + " / " + season.totalRounds, next ? "Next: " + next.name : "Season complete"],
      ["Different winners", winners.size, "Across " + done.length + " Grands Prix"],
      ["Different poles", poles.size, "Qualifying P1"],
      ["Fastest-lap takers", fls.size, "One per race"],
      ["Sprint weekends", sprints, String(year)],
    ];
    document.getElementById("race-stats").innerHTML = rows.map(([label, value, sub]) =>
      '<div class="stat-card" style="--team:var(--accent)"><div class="label">' + U.esc(label) +
      '</div><div class="value">' + U.esc(value) + '</div><div class="sub">' + U.esc(sub) + "</div></div>"
    ).join("");
  }

  function card(race) {
    const done = byRound.get(race.round);
    const win = done && done.winner ? U.driver(year, done.winner) : null;
    const pole = done && done.pole ? U.driver(year, done.pole) : null;
    const fl = done && done.fastestLap ? U.driver(year, done.fastestLap) : null;
    const sw = done && done.sprintWinner ? U.driver(year, done.sprintWinner) : null;
    const color = win ? U.color(win) : "var(--accent)";
    const el = document.createElement("div");
    el.className = "race-card" + (done ? "" : " upcoming");
    el.style.setProperty("--team", color);
    el.dataset.round = race.round;
    const tags = [];
    if (done) tags.push('<span class="tag done">Completed</span>');
    if (race.sprint) tags.push('<span class="tag sprint">Sprint</span>');
    if (!done) tags.push('<span class="tag">Upcoming</span>');
    el.innerHTML =
      '<div class="race-top"><span class="race-round">Round ' + race.round + '</span><span class="race-flag">' + flag(race) + "</span></div>" +
      '<div class="race-name">' + U.esc(race.name) + "</div>" +
      '<div class="race-circuit">' + U.esc(race.circuit || "") + '</div>' +
      '<div class="race-date">' + U.esc(U.dateLabel(race.date)) + " " + year + "</div>" +
      '<div class="race-tags">' + tags.join("") + "</div>" +
      (done
        ? '<div class="race-podium">' +
          '<div class="race-line"><span>Winner</span><b>' + U.esc(win ? win.name : "—") + "</b></div>" +
          '<div class="race-line"><span>Pole</span><b>' + U.esc(pole ? pole.name : "—") + "</b></div>" +
          '<div class="race-line"><span>Fastest lap</span><b>' + U.esc(fl ? fl.name : "—") + "</b></div>" +
          (race.sprint ? '<div class="race-line"><span>Sprint</span><b>' + U.esc(sw ? sw.name : "—") + "</b></div>" : "") +
          "</div>"
        : "");
    if (done) el.addEventListener("click", () => showRace(race.round));
    return el;
  }

  function renderGrid() {
    let rows = season.calendar.slice();
    if (filter === "done") rows = rows.filter((r) => r.status === "done");
    if (filter === "upcoming") rows = rows.filter((r) => r.status !== "done");
    if (filter === "sprint") rows = rows.filter((r) => r.sprint);
    const grid = document.getElementById("race-grid");
    grid.innerHTML = "";
    rows.forEach((r) => grid.appendChild(card(r)));
    document.getElementById("race-count").textContent = rows.length + " rounds shown · " + year;
  }

  function resultRow(r, isSprint) {
    const d = U.driver(year, r.driver);
    const pos = isSprint ? r.sprintPos : r.pos;
    const pts = isSprint ? r.sprintPoints : r.points;
    const status = isSprint ? (r.sprintStatus || "") : r.status;
    const cls = (isSprint || r.finished) ? (pos === 1 ? "win" : pos && pos <= 3 ? "podium" : pos && pos <= 10 ? "points" : "") : "";
    const grid = isSprint ? r.sprintGrid : r.grid;
    const gained = grid > 0 && pos && (isSprint || r.finished) ? grid - pos : null;
    const gainTxt = gained == null ? "—" : (gained > 0 ? "+" + gained : String(gained));
    const gainCls = gained > 0 ? "delta-pos" : gained < 0 ? "delta-neg" : "";
    return '<tr>' +
      '<td class="' + cls + '">' + (pos || (isSprint ? (status || "—") : (r.posText || "—"))) + "</td>" +
      '<td class="name"><span class="team-dot" style="background:' + U.color(d) + '"></span>' +
      '<a href="' + U.driverUrl(d.id, year) + '">' + U.esc(d.name) + "</a></td>" +
      "<td>" + U.esc(U.teamFor(d).name) + "</td>" +
      "<td>" + (grid || "PL") + "</td>" +
      '<td class="' + gainCls + '">' + gainTxt + "</td>" +
      "<td>" + ((isSprint ? r.sprintLaps : r.laps) || "—") + "</td>" +
      '<td class="points">' + U.fmt(pts, 0) + "</td>" +
      "<td>" + (r.fastestRank === 1 ? "FL" : "") + "</td>" +
      "</tr>";
  }

  function showRace(round) {
    const race = byRound.get(round);
    if (!race) return;
    selectedRound = round;
    const box = document.getElementById("race-detail");
    const results = race.results.slice().sort((a, b) => {
      const pa = a.pos == null ? 999 : a.pos, pb = b.pos == null ? 999 : b.pos;
      return pa - pb;
    });
    const podium = [1, 2, 3].map((p) => results.find((r) => r.pos === p)).filter(Boolean);
    const pole = race.pole ? U.driver(year, race.pole) : null;
    const fl = race.fastestLap ? U.driver(year, race.fastestLap) : null;
    const sw = race.sprintWinner ? U.driver(year, race.sprintWinner) : null;
    box.innerHTML =
      '<div class="race-detail">' +
      '<div class="section-head"><div><h2>' + flag(race) + " " + U.esc(race.name) + "</h2>" +
      '<div class="meta">Round ' + race.round + " · " + U.esc(race.circuit) + " · " + U.esc(U.dateLabel(race.date)) + " " + year +
      (race.sprint ? " · Sprint weekend" : "") + "</div></div>" +
      '<button class="ghost" id="close-race">Close</button></div>' +
      '<div class="podium-strip">' + podium.map((r) => {
        const d = U.driver(year, r.driver);
        return '<div class="podium-card" style="--team:' + U.color(d) + '"><div class="p">P' + r.pos + "</div>" +
          '<div class="n">' + U.esc(d.name) + '</div><div class="t">' + U.esc(U.teamFor(d).name) + " · " + U.fmt(r.points, 0) + " pts</div></div>";
      }).join("") + "</div>" +
      '<div class="rank-meta"><span>Pole: <b>' + U.esc(pole ? pole.name : "—") + "</b> · Fastest lap: <b>" +
      U.esc(fl ? fl.name : "—") + "</b>" + (sw ? " · Sprint winner: <b>" + U.esc(sw.name) + "</b>" : "") +
      '</span><span class="hint">Grid = actual starting position</span></div>' +
      '<div class="table-wrap"><table class="rank-table" style="min-width:820px"><thead><tr>' +
      ["Pos", "Driver", "Team", "Grid", "+/−", "Laps", "Pts", "FL"].map((h) => "<th>" + h + "</th>").join("") +
      "</tr></thead><tbody>" + results.map((r) => resultRow(r, false)).join("") + "</tbody></table></div>" +
      (race.sprint
        ? '<div class="section-head" style="margin-top:18px"><h2>Sprint result</h2><p>Top eight score</p></div>' +
          '<div class="table-wrap"><table class="rank-table" style="min-width:820px"><thead><tr>' +
          ["Pos", "Driver", "Team", "Grid", "+/−", "Laps", "Pts", "FL"].map((h) => "<th>" + h + "</th>").join("") +
          "</tr></thead><tbody>" +
          race.results.filter((r) => r.sprintPos != null).sort((a, b) => a.sprintPos - b.sprintPos).map((r) => resultRow(r, true)).join("") +
          "</tbody></table></div>"
        : "") +
      "</div>";
    box.classList.remove("hidden");
    document.getElementById("close-race").addEventListener("click", () => {
      box.classList.add("hidden");
      selectedRound = null;
      updateUrl();
    });
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    updateUrl();
  }

  function updateUrl() {
    const params = new URLSearchParams();
    params.set("season", String(year));
    if (selectedRound) params.set("race", String(selectedRound));
    try { history.replaceState(null, "", location.pathname + "?" + params.toString()); } catch (e) {}
  }

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filter = btn.dataset.filter;
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
      renderGrid();
    });
  });

  const sel = document.getElementById("season-select");
  sel.innerHTML = U.seasonOptions(year, false);
  sel.value = String(year);
  sel.addEventListener("change", () => {
    year = Number(sel.value);
    season = U.season(year);
    selectedRound = null;
    byRound.clear();
    for (const r of season.races) byRound.set(r.round, r);
    document.getElementById("race-detail").classList.add("hidden");
    updateUrl();
    statCards();
    renderGrid();
  });

  statCards();
  renderGrid();
  if (selectedRound && byRound.has(selectedRound)) showRace(selectedRound);
})();
