/* Constructors — multi-season standings with car strength. */
(function () {
  "use strict";
  const U = window.F1U;
  if (!U) return;

  let year = Number(U.query("season", U.latestYear));
  if (!U.season(year)) year = U.latestYear;
  let season = U.season(year);
  const state = { expanded: null };

  function teamRoundPoints(teamId) {
    const per = [];
    let cum = 0;
    for (const race of season.races) {
      let p = 0;
      for (const r of race.results || []) if (r.team === teamId) p += (r.points || 0) + (r.sprintPoints || 0);
      cum += p;
      per.push({ round: race.round, points: p, cumulative: cum });
    }
    return per;
  }

  function statCards(teams) {
    const leader = teams[0];
    const mostWins = teams.slice().sort((a, b) => b.wins - a.wins)[0];
    const bestCar = teams.slice().sort((a, b) => (b.car || 0) - (a.car || 0))[0];
    const closest = teams.slice(1).sort((a, b) => (leader.points - a.points) - (leader.points - b.points))[0];
    const rows = [
      ["Championship leader", leader ? leader.name : "—", leader ? Math.round(leader.points) + " pts" : ""],
      ["Most wins", mostWins ? mostWins.name : "—", mostWins ? mostWins.wins + " victories" : ""],
      ["Best car", bestCar ? bestCar.name : "—", bestCar ? "Car " + U.int(bestCar.car) : ""],
      ["Closest chaser", closest ? closest.name : "—", leader && closest ? Math.round(leader.points - closest.points) + " pts behind" : ""],
      ["Teams", teams.length, String(year) + " grid"],
    ];
    document.getElementById("team-stats").innerHTML = rows.map(([l, v, s]) =>
      '<div class="stat-card" style="--team:var(--accent)"><div class="label">' + U.esc(l) +
      '</div><div class="value" style="font-size:1.15rem">' + U.esc(v) + '</div><div class="sub">' + U.esc(s) + "</div></div>"
    ).join("");
  }

  function sparkline(team) {
    const data = teamRoundPoints(team.id);
    if (!data.length) return "";
    const max = Math.max(...data.map((d) => d.cumulative), 1);
    const W = 780, H = 130, ml = 10, mr = 10, mt = 12, mb = 22;
    const x = (i) => data.length === 1 ? W / 2 : ml + (i / (data.length - 1)) * (W - ml - mr);
    const y = (v) => H - mb - (v / max) * (H - mt - mb);
    const pts = data.map((d, i) => x(i) + "," + y(d.cumulative)).join(" ");
    const area = pts + " " + x(data.length - 1) + "," + (H - mb) + " " + x(0) + "," + (H - mb);
    let svg = '<svg viewBox="0 0 ' + W + " " + H + '" style="width:100%;height:auto">';
    svg += '<polygon points="' + area + '" fill="' + team.color + '" opacity=".12"/>';
    svg += '<polyline points="' + pts + '" fill="none" stroke="' + team.color + '" stroke-width="2.5" stroke-linejoin="round"/>';
    data.forEach((d, i) => {
      svg += '<circle cx="' + x(i) + '" cy="' + y(d.cumulative) + '" r="2.8" fill="#0b0b0f" stroke="' + team.color + '" stroke-width="1.8"><title>R' + d.round + ": " + d.cumulative + ' pts</title></circle>';
      if (i % 2 === 0) svg += '<text x="' + x(i) + '" y="' + (H - 6) + '" fill="#8b93a1" font-size="9" text-anchor="middle">R' + d.round + "</text>";
    });
    svg += "</svg>";
    return svg;
  }

  function detail(team) {
    const tr = document.createElement("tr");
    tr.className = "team-detail-row";
    const td = document.createElement("td");
    td.colSpan = 11;
    const drivers = team.drivers.map((id) => U.driver(year, id)).filter(Boolean);
    const driverRows = drivers.map((d) =>
      "<tr><td class=\"name\"><span class=\"team-dot\" style=\"background:" + U.color(d) + "\"></span>" +
      '<a href="' + U.driverUrl(d.id, d.season) + '">' + U.esc(d.name) + "</a></td>" +
      "<td><b>" + U.rating(d.rating) + "</b></td>" +
      "<td class=\"muted\">" + U.int(d.car) + "</td>" +
      "<td class=\"points\">" + U.int(d.points) + "</td>" +
      "<td>" + d.wins + "</td><td>" + d.podiums + "</td><td>" + d.poles + "</td><td>" + d.fastestLaps + "</td>" +
      "<td>" + d.starts + "</td><td>" + U.fmt(d.avgFinish, 2) + "</td><td>" + U.fmt(d.avgGrid, 2) + "</td>" +
      "<td>" + U.pct(d.reliability, 0) + "</td></tr>"
    ).join("");
    td.innerHTML =
      '<div class="team-detail-head"><b style="color:' + team.color + '">' + U.esc(team.full || team.name) + "</b>" +
      '<span class="muted">Car ' + U.int(team.car) + " · " + Math.round(team.points) + " pts · " + team.wins +
      " wins · " + team.podiums + " podiums</span></div>" +
      '<div class="table-wrap" style="margin:6px 0 12px;background:transparent;box-shadow:none;border:none">' +
      '<table class="rank-table" style="min-width:800px"><thead><tr>' +
      ["Driver", "ℚ", "Car", "Pts", "Wins", "Podiums", "Poles", "FL", "Starts", "Avg fin", "Avg grid", "Finish %"].map((h) => "<th>" + h + "</th>").join("") +
      "</tr></thead><tbody>" + driverRows + "</tbody></table></div>" +
      '<div style="color:var(--muted);font-size:.74rem;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Cumulative points by round</div>' +
      sparkline(team) +
      '<p class="muted small" style="margin:8px 0 0">Line = cumulative points. Hover a point for the total after that round.</p>';
    tr.appendChild(td);
    return tr;
  }

  function render() {
    const body = document.getElementById("team-body");
    body.innerHTML = "";
    season.constructors.forEach((team, i) => {
      const tr = document.createElement("tr");
      tr.className = "team-row";
      tr.style.cursor = "pointer";
      tr.tabIndex = 0;
      tr.innerHTML =
        '<td class="rank">' + (i + 1) + "</td>" +
        '<td class="name"><span class="team-dot" style="background:' + team.color + ';color:' + team.color + '"></span>' +
        "<b>" + U.esc(team.name) + "</b></td>" +
        "<td><b>" + U.int(team.car) + "</b></td>" +
        '<td class="points">' + U.int(team.points) + "</td>" +
        "<td>" + team.wins + "</td><td>" + team.podiums + "</td><td>" + team.poles + "</td><td>" + team.fastestLaps + "</td>" +
        "<td>" + (team.bestFinish === 99 ? "—" : U.ordinal(team.bestFinish)) + "</td>" +
        '<td class="name">' + team.drivers.map((id) => U.esc(U.driver(year, id) ? U.driver(year, id).name : id)).join(" · ") + "</td>" +
        '<td style="color:var(--muted)">' + (state.expanded === team.id ? "▾" : "▸") + "</td>";
      const toggle = () => {
        state.expanded = state.expanded === team.id ? null : team.id;
        render();
        const open = document.querySelector("tr.team-detail-row");
        if (open) open.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      tr.addEventListener("click", toggle);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
      body.appendChild(tr);
      if (state.expanded === team.id) body.appendChild(detail(team));
    });
    document.getElementById("team-count").innerHTML = "<b>" + season.constructors.length + "</b> teams · <b>" + year + "</b> · " + season.completedRounds + " rounds";
  }

  const sel = document.getElementById("season-select");
  sel.innerHTML = U.seasonOptions(year, false);
  sel.value = String(year);
  sel.addEventListener("change", () => {
    year = Number(sel.value);
    season = U.season(year);
    state.expanded = null;
    const params = new URLSearchParams(location.search);
    params.set("season", String(year));
    history.replaceState(null, "", location.pathname + "?" + params.toString());
    statCards(season.constructors);
    render();
  });

  statCards(season.constructors);
  render();
})();
