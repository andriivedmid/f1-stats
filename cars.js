/* All-time car rankings. */
(function () {
  "use strict";
  const U = window.F1U;
  if (!U) return;

  const PAGE = 300;
  const COLS = {
    car: { num: 1, sort: "num" },
    name: { sort: "str" },
    season: { num: 0, sort: "num" },
    carBase: { num: 2, sort: "num" },
    bestCarRate: { num: 1, sort: "num" },
    points: { num: 0, sort: "num" },
    wins: { num: 0, sort: "num" },
    podiums: { num: 0, sort: "num" },
    poles: { num: 0, sort: "num" },
    fastestLaps: { num: 0, sort: "num" },
    bestFinish: { num: 0, sort: "num" },
  };
  const state = {
    year: U.query("season", ""),
    sortCol: "car",
    sortDir: "desc",
    shown: PAGE,
  };
  if (state.year !== "" && !U.season(state.year)) state.year = "";

  const els = {
    body: document.getElementById("car-body"),
    count: document.getElementById("car-count"),
    season: document.getElementById("season-select"),
    search: document.getElementById("search"),
    more: document.getElementById("more-btn"),
  };

  function rowsFor() {
    const all = U.allCars();
    return state.year === "" ? all : all.filter((c) => c.season === Number(state.year));
  }

  function cellVal(c, col) {
    if (col === "points") return c.pointsOnTrack ?? c.points;
    return c[col];
  }

  function visible() {
    const q = els.search.value.trim().toLowerCase();
    let rows = rowsFor().filter((c) => {
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || String(c.season).includes(q) ||
        c.drivers.map((id) => (U.driver(c.season, id) || {}).name || "").join(" ").toLowerCase().includes(q);
    });
    const dir = state.sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const va = cellVal(a, state.sortCol), vb = cellVal(b, state.sortCol);
      let cmp = COLS[state.sortCol].sort === "str"
        ? String(va || "").localeCompare(String(vb || ""))
        : (Number.isFinite(Number(va)) ? Number(va) : -Infinity) -
          (Number.isFinite(Number(vb)) ? Number(vb) : -Infinity);
      if (cmp === 0) cmp = b.car - a.car || b.points - a.points;
      return cmp * dir;
    });
    return rows;
  }

  function render() {
    const rows = visible();
    const slice = rows.slice(0, state.shown);
    const frag = document.createDocumentFragment();
    slice.forEach((c, i) => {
      const tr = document.createElement("tr");
      const add = (text, cls) => {
        const td = document.createElement("td");
        if (cls) td.className = cls;
        td.textContent = text;
        tr.appendChild(td);
        return td;
      };
      add(String(i + 1), "rank");
      add(Number(c.car).toFixed(1), "rating");
      const name = document.createElement("td");
      name.className = "name";
      name.innerHTML = '<span class="team-dot" style="background:' + c.color + '"></span>' +
        '<a href="teams.html?season=' + c.season + '">' + U.esc(c.name) + "</a>";
      tr.appendChild(name);
      add(String(c.season), "year");
      add(U.fmt(c.carBase, 2), "muted");
      add(U.fmt(c.bestCarRate, 1) + "%", "muted");
      const ptsCell = add(U.int(cellVal(c, "points")), "points");
      ptsCell.title = "On-track points (championship exclusions removed)";
      add(U.int(c.wins));
      add(U.int(c.podiums));
      add(U.int(c.poles));
      add(U.int(c.fastestLaps));
      add(c.bestFinish === 99 ? "—" : U.ordinal(c.bestFinish));
      const drivers = document.createElement("td");
      drivers.className = "name";
      drivers.innerHTML = c.drivers.map((id) => {
        const d = U.driver(c.season, id);
        return d ? '<a href="' + U.driverUrl(d.id, c.season) + '">' + U.esc(d.name) + "</a>" : U.esc(id);
      }).join(" · ");
      tr.appendChild(drivers);
      frag.appendChild(tr);
    });
    els.body.innerHTML = "";
    els.body.appendChild(frag);
    els.count.innerHTML = "Showing <b>" + Math.min(state.shown, rows.length) + "</b> of <b>" +
      rows.length + "</b> team-seasons" + (state.year === "" ? " · <b>1980–2026</b>" : " · <b>" + state.year + "</b>");
    if (els.more) els.more.classList.toggle("hidden", state.shown >= rows.length);
  }

  function refresh() {
    state.shown = PAGE;
    for (const th of document.querySelectorAll("#car-table th")) {
      const active = th.dataset.col === state.sortCol;
      th.classList.toggle("sort-asc", active && state.sortDir === "asc");
      th.classList.toggle("sort-desc", active && state.sortDir === "desc");
      if (th.dataset.col) th.setAttribute("aria-sort", active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none");
    }
    render();
  }

  function statCards() {
    const all = U.allCars();
    const best = all[0];
    const best2026 = all.filter((c) => c.season === 2026).sort((a, b) => b.car - a.car)[0];
    const mostWins = all.slice().sort((a, b) => b.wins - a.wins || b.car - a.car)[0];
    const closest = (() => {
      let bestGap = Infinity, pair = null;
      const bySeason = {};
      for (const c of all) (bySeason[c.season] = bySeason[c.season] || []).push(c);
      for (const list of Object.values(bySeason)) {
        list.sort((a, b) => b.car - a.car);
        if (list.length > 1) {
          const gap = list[0].car - list[1].car;
          if (gap < bestGap) { bestGap = gap; pair = [list[0], list[1]]; }
        }
      }
      return pair;
    })();
    const cards = [
      ["Best car ever", best.name + " " + best.season, Number(best.car).toFixed(1)],
      ["Best 2026 car", best2026 ? best2026.name : "—", best2026 ? Number(best2026.car).toFixed(1) : ""],
      ["Most wins", mostWins.name + " " + mostWins.season, mostWins.wins + " wins"],
      ["Tightest top two", closest ? closest[0].season + ": " + closest[0].name + " / " + closest[1].name : "—",
        closest ? (closest[0].car - closest[1].car).toFixed(2) + " pts" : ""],
      ["Team-seasons", String(all.length), "1980–2026"],
    ];
    document.getElementById("car-stats").innerHTML = cards.map(([l, v, s]) =>
      '<div class="stat-card" style="--team:var(--accent)"><div class="label">' + U.esc(l) +
      '</div><div class="value" style="font-size:1.1rem">' + U.esc(v) + '</div><div class="sub">' + U.esc(s) + "</div></div>"
    ).join("");
  }

  for (const th of document.querySelectorAll("#car-table th")) {
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
  els.season.addEventListener("change", () => {
    state.year = els.season.value;
    const params = new URLSearchParams(location.search);
    if (state.year === "") params.delete("season"); else params.set("season", state.year);
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params.toString() : ""));
    refresh();
  });
  els.search.addEventListener("input", refresh);
  if (els.more) els.more.addEventListener("click", () => { state.shown += PAGE; render(); });

  statCards();
  refresh();
})();
