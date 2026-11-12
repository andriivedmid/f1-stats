/* Multi-season driver rankings by car-adjusted score ℚ. */
(function () {
  "use strict";
  const U = window.F1U;
  if (!U) return;

  const COLS = {
    rating: { num: 1, sort: "num" },
    rawQ: { num: 3, sort: "num" },
    name: { sort: "str" },
    season: { num: 0, sort: "num" },
    team: { sort: "str" },
    car: { num: 0, sort: "num" },
    mateDelta: { num: 2, sort: "num" },
    champPos: { num: 0, sort: "num" },
    yrank: { num: 0, sort: "num" },
    points: { num: 0, sort: "num" },
    wins: { num: 0, sort: "num" },
    podiums: { num: 0, sort: "num" },
    poles: { num: 0, sort: "num" },
    fastestLaps: { num: 0, sort: "num" },
    starts: { num: 0, sort: "num" },
    avgFinish: { num: 2, sort: "num" },
    avgGrid: { num: 2, sort: "num" },
    avgQuali: { num: 2, sort: "num" },
    avgGained: { num: 2, sort: "num" },
    dnf: { num: 0, sort: "num" },
    reliability: { pct: true, sort: "num" },
    sprintPoints: { num: 0, sort: "num" },
  };

  const PAGE = 300;
  const state = {
    year: U.query("season", ""),
    sortCol: "rating",
    sortDir: "desc",
    shown: PAGE,
  };
  if (state.year === "all") state.year = "";
  if (state.year !== "" && !U.season(state.year)) state.year = String(U.latestYear);

  const yrank = new Map();
  for (const y of U.years) {
    U.ranking(y).forEach((d, i) => yrank.set(U.driverKey(d), i + 1));
  }

  const els = {
    body: document.getElementById("rank-body"),
    count: document.getElementById("rank-count"),
    season: document.getElementById("season-select"),
    starts: document.getElementById("starts-select"),
    rating: document.getElementById("rating-input"),
    ratingMax: document.getElementById("rating-max-input"),
    search: document.getElementById("search"),
    more: document.getElementById("more-btn"),
  };

  function rowsForYear() {
    return state.year === "" ? U.all() : U.season(state.year).drivers;
  }

  function allTimeMode() {
    return state.year === "";
  }

  function scoreOf(d) {
    return d.rating;
  }

  function scoreExactOf(d) {
    return d.ratingExact;
  }

  function numInput(el) {
    const v = el.value.trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function cellVal(d, col) {
    if (col === "yrank") return yrank.get(U.driverKey(d));
    if (col === "rating") return scoreOf(d);
    return d[col];
  }

  function fmt(v, col) {
    if (v === null || v === undefined) return "—";
    const c = COLS[col];
    if (c.pct) return U.pct(v, 0);
    if (c.num !== undefined) return Number(v).toFixed(c.num);
    return String(v);
  }

  function visible() {
    const minStarts = Number(els.starts.value) || 1;
    const minD = numInput(els.rating);
    const maxD = numInput(els.ratingMax);
    const q = els.search.value.trim().toLowerCase();
    let rows = rowsForYear().filter((d) => {
      const score = scoreOf(d);
      if (score == null) return false;
      if (d.starts < minStarts) return false;
      if (minD != null && score < minD) return false;
      if (maxD != null && score > maxD) return false;
      if (!q) return true;
      const team = U.teamFor(d);
      return d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q) ||
        String(d.season).includes(q) || (team.name || "").toLowerCase().includes(q) ||
        (d.country || "").toLowerCase().includes(q);
    });
    const dir = state.sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const va = cellVal(a, state.sortCol), vb = cellVal(b, state.sortCol);
      let cmp = COLS[state.sortCol].sort === "str"
        ? String(va || "").localeCompare(String(vb || ""))
        : (Number.isFinite(Number(va)) ? Number(va) : -Infinity) -
          (Number.isFinite(Number(vb)) ? Number(vb) : -Infinity);
      if (cmp === 0) cmp = (scoreOf(b) || 0) - (scoreOf(a) || 0) || b.points - a.points || b.season - a.season;
      return cmp * dir;
    });
    return rows;
  }

  function render() {
    const mem = state.year !== "" ? U.season(state.year)?.memorial : null;
    const rows = visible();
    const slice = rows.slice(0, state.shown);
    const frag = document.createDocumentFragment();
    slice.forEach((d, i) => {
      const tr = document.createElement("tr");
      const add = (text, cls) => {
        const td = document.createElement("td");
        if (cls) td.className = cls;
        td.textContent = text;
        tr.appendChild(td);
        return td;
      };
      add(String(i + 1), "rank");
      const ratingCell = add(U.rating(scoreOf(d)), "rating");
      ratingCell.title = "Exact ℚ " + scoreExactOf(d);
      const rawCell = add(d.rawQ == null ? "—" : U.rating(d.rawQ), "muted");
      rawCell.title = "Raw Q — no car adjustment";
      const name = document.createElement("td");
      name.className = "name";
      name.innerHTML = '<a href="' + U.driverUrl(d.id, d.season) + '">' + U.esc(d.name) + "</a>";
      tr.appendChild(name);
      add(String(d.season), "year");
      const team = document.createElement("td");
      team.className = "team";
      team.innerHTML = '<span class="team-dot" style="background:' + U.color(d) + ';color:' + U.color(d) + '"></span>' +
        U.esc(U.teamFor(d).name);
      tr.appendChild(team);
      const carCell = add(U.int(d.car), "muted");
      carCell.title = d.car == null ? "" : U.carTier(d.car).name;
      add((d.mateDelta > 0 ? "+" : "") + U.fmt(d.mateDelta, 2), "muted");
      add(d.champPos || "—", "muted");
      add(String(yrank.get(U.driverKey(d)) || "—"), "yr");
      add(U.int(d.points), "points");
      add(U.int(d.wins));
      add(U.int(d.podiums));
      add(U.int(d.poles));
      add(U.int(d.fastestLaps));
      add(U.int(d.starts));
      add(U.fmt(d.avgFinish, 2));
      add(U.fmt(d.avgGrid, 2));
      add(U.fmt(d.avgQuali, 2));
      add((d.avgGained > 0 ? "+" : "") + U.fmt(d.avgGained, 2));
      add(U.int(d.dnf));
      add(U.pct(d.reliability, 0));
      add(U.int(d.sprintPoints));
      frag.appendChild(tr);
    });
    els.body.innerHTML = "";
    els.body.appendChild(frag);
    els.count.innerHTML = "Showing <b>" + Math.min(state.shown, rows.length) + "</b> of <b>" +
      rows.length + "</b> rated driver-seasons" +
      (state.year === "" ? " · <b>1980–2026</b>" : " · <b>" + state.year + "</b>") +
      (mem ? " · In memory of <b>" + U.esc(mem) + "</b> (their rating is withheld)" : "");
    if (els.more) els.more.classList.toggle("hidden", state.shown >= rows.length);
  }

  function refresh() {
    state.shown = PAGE;
    const ratingLabel = document.querySelector('#rank-table th[data-col="rating"] span:first-child');
    if (ratingLabel) ratingLabel.textContent = "ℚ";
    const hint = document.querySelector(".rank-meta .hint");
    if (hint) {
      hint.textContent = "Click a column header to sort · ℚ is car-adjusted; Raw Q is the same driver-only fit with no car adjustment; the default filter shows 3+ starts";
    }
    for (const th of document.querySelectorAll("#rank-table th")) {
      const active = th.dataset.col === state.sortCol;
      th.classList.toggle("sort-asc", active && state.sortDir === "asc");
      th.classList.toggle("sort-desc", active && state.sortDir === "desc");
      if (th.dataset.col) th.setAttribute("aria-sort", active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none");
    }
    render();
  }

  function setYear(value) {
    state.year = value;
    const params = new URLSearchParams(location.search);
    if (value === "") params.delete("season"); else params.set("season", value);
    try { history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params.toString() : "")); } catch (e) {}
    refresh();
  }

  for (const th of document.querySelectorAll("#rank-table th")) {
    if (th.dataset.col) th.tabIndex = 0;
    th.addEventListener("click", () => {
      const col = th.dataset.col;
      if (!col) return;
      if (state.sortCol === col) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      else {
        state.sortCol = col;
        state.sortDir = COLS[col].sort === "str" ? "asc" : "desc";
      }
      refresh();
    });
    th.addEventListener("keydown", (e) => {
      if (!th.dataset.col || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      th.click();
    });
  }

  els.season.innerHTML = U.seasonOptions(state.year, true);
  els.season.value = state.year;
  els.season.addEventListener("change", () => setYear(els.season.value));
  els.starts.addEventListener("change", refresh);
  els.rating.addEventListener("input", refresh);
  els.ratingMax.addEventListener("input", refresh);
  els.search.addEventListener("input", refresh);
  if (els.more) els.more.addEventListener("click", () => { state.shown += PAGE; render(); });

  refresh();
})();
