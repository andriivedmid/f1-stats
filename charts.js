/* Season charts — vanilla SVG, multi-season. */
(function () {
  "use strict";
  const U = window.F1U;
  if (!U) return;
  const tooltip = document.getElementById("tooltip");
  const hidden = new Set();
  let topN = 10;
  let minStarts = 10;
  let yearParam = U.query("season", String(U.latestYear));
  let allTime = yearParam === "all";
  let year = allTime ? U.latestYear : Number(yearParam);
  if (!U.season(year)) year = U.latestYear;
  let season = U.season(year);
  document.body.classList.toggle("all-time-mode", allTime);
  if (allTime) topN = "200";
  const topSelect = document.getElementById("top-select");
  if (topSelect) topSelect.value = String(topN);

  function showTip(evt, html) {
    tooltip.innerHTML = html;
    tooltip.style.left = evt.clientX + 14 + "px";
    tooltip.style.top = evt.clientY + 14 + "px";
    tooltip.classList.add("show");
  }
  function hideTip() { tooltip.classList.remove("show"); }

  function lighten(hex, amt) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = Math.min(255, ((n >> 16) & 255) + Math.round(255 * amt));
    const g = Math.min(255, ((n >> 8) & 255) + Math.round(255 * amt));
    const b = Math.min(255, (n & 255) + Math.round(255 * amt));
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function driverColorMap(drivers) {
    const byTeam = {};
    for (const d of drivers) (byTeam[d.team] = byTeam[d.team] || []).push(d);
    const map = new Map();
    for (const list of Object.values(byTeam)) {
      list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      list.forEach((d, i) => {
        const base = U.color(d);
        map.set(d.id, i === 0 ? base : i === 1 ? lighten(base, 0.42) : lighten(base, 0.68));
      });
    }
    return map;
  }

  function selectedDrivers() {
    const all = U.ranking(year);
    return topN === "all" ? all : all.slice(0, Number(topN));
  }

  function renderPoints() {
    const svg = document.getElementById("points-chart");
    const drivers = selectedDrivers();
    const colors = driverColorMap(drivers);
    const rounds = season.races;
    const N = rounds.length;
    const series = drivers.map((d) => {
      const vals = [0];
      let total = 0;
      for (const race of rounds) {
        const r = U.raceResult(race, d.id);
        total += r ? (r.points || 0) + (r.sprintPoints || 0) : 0;
        vals.push(total);
      }
      return { d, vals };
    });
    const W = 1000, H = 430, ml = 54, mr = 28, mt = 18, mb = 40;
    const maxVal = Math.max(10, ...series.flatMap((s) => s.vals));
    const maxY = Math.ceil(maxVal / 50) * 50;
    const x = (i) => ml + (i * (W - ml - mr)) / Math.max(1, N);
    const y = (v) => H - mb - (v / maxY) * (H - mt - mb);
    const frag = document.createDocumentFragment();
    for (let t = 0; t <= maxY; t += 50) {
      frag.appendChild(svgEl("line", { x1: ml, x2: W - mr, y1: y(t), y2: y(t), stroke: "rgba(255,255,255,.07)" }));
      const label = svgEl("text", { x: ml - 9, y: y(t) + 4, fill: "#8b93a1", "font-size": 11, "text-anchor": "end" });
      label.textContent = t;
      frag.appendChild(label);
    }
    rounds.forEach((race, i) => {
      const label = svgEl("text", { x: x(i + 1), y: H - 15, fill: "#8b93a1", "font-size": 10, "text-anchor": "middle" });
      label.textContent = "R" + race.round;
      frag.appendChild(label);
    });
    for (const { d, vals } of series) {
      if (hidden.has(d.id)) continue;
      const color = colors.get(d.id) || U.color(d);
      frag.appendChild(svgEl("polyline", {
        points: vals.map((v, i) => x(i) + "," + y(v)).join(" "),
        fill: "none", stroke: color, "stroke-width": 2.2, "stroke-linejoin": "round", "stroke-linecap": "round",
      }));
      for (let i = 0; i < vals.length; i++) {
        const c = svgEl("circle", { cx: x(i), cy: y(vals[i]), r: 3.4, fill: "#0b0b0f", stroke: color, "stroke-width": 2 });
        c.style.cursor = "pointer";
        const tip = () => "<b>" + U.esc(d.name) + "</b><br>" + (i === 0 ? "Season start" : rounds[i - 1].name) + ": <b>" + vals[i] + " pts</b>";
        c.addEventListener("mouseenter", (ev) => showTip(ev, tip()));
        c.addEventListener("mousemove", (ev) => showTip(ev, tip()));
        c.addEventListener("mouseleave", hideTip);
        frag.appendChild(c);
      }
    }
    svg.innerHTML = "";
    svg.appendChild(frag);

    const legend = document.getElementById("points-legend");
    legend.innerHTML = "";
    for (const d of drivers) {
      const item = document.createElement("span");
      item.className = "item" + (hidden.has(d.id) ? " off" : "");
      item.innerHTML = '<span class="swatch" style="background:' + (colors.get(d.id) || U.color(d)) + '"></span>' + U.esc(d.name);
      item.addEventListener("click", () => {
        if (hidden.has(d.id)) hidden.delete(d.id); else hidden.add(d.id);
        renderPoints();
      });
      legend.appendChild(item);
    }
  }

  function setupListToggle(listId, buttonId) {
    const list = document.getElementById(listId);
    const btn = document.getElementById(buttonId);
    if (!list || !btn) return;
    const total = list.querySelectorAll(".scatter-row").length;
    list.classList.add("collapsed");
    btn.classList.toggle("hidden", total <= 10);
    btn.textContent = "Show all " + total;
    btn.onclick = () => {
      const collapsed = list.classList.toggle("collapsed");
      btn.textContent = collapsed ? "Show all " + total : "Show fewer";
    };
  }

  function renderScatter() {
    const svg = document.getElementById("scatter-chart");
    let drivers = allTime
      ? U.all().filter((d) => d.rating != null && d.car != null && (d.starts || 0) >= minStarts)
      : U.ranking(year);
    if (allTime) {
      drivers = drivers.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
      const limit = topN === "all" ? drivers.length : Number(topN) || 200;
      drivers = drivers.slice(0, limit);
    }
    const titleEl = document.getElementById("scatter-title");
    if (titleEl) titleEl.textContent = allTime ? "Car-adjusted score vs car — all time" : "Car-adjusted score vs car";
    const dotR = allTime ? 3.2 : 6;
    const W = 720, H = 430, ml = 48, mr = 26, mt = 20, mb = 46;
    const x = (v) => ml + (v / 100) * (W - ml - mr);
    const y = (v) => H - mb - (v / 100) * (H - mt - mb);
    const frag = document.createDocumentFragment();

    for (let t = 0; t <= 100; t += 20) {
      frag.appendChild(svgEl("line", { x1: ml, x2: W - mr, y1: y(t), y2: y(t), stroke: "rgba(255,255,255,.06)" }));
      const ly = svgEl("text", { x: ml - 8, y: y(t) + 4, fill: "#8b93a1", "font-size": 10, "text-anchor": "end" });
      ly.textContent = t;
      frag.appendChild(ly);
      const lx = svgEl("text", { x: x(t), y: H - 24, fill: "#8b93a1", "font-size": 10, "text-anchor": "middle" });
      lx.textContent = t;
      frag.appendChild(lx);
    }
    frag.appendChild(svgEl("line", { x1: x(0), y1: y(0), x2: x(100), y2: y(100), stroke: "rgba(255,255,255,.16)", "stroke-dasharray": "5 5" }));
    const xl = svgEl("text", { x: (ml + W - mr) / 2, y: H - 6, fill: "#8b93a1", "font-size": 11, "text-anchor": "middle" });
    xl.textContent = "Car strength";
    frag.appendChild(xl);
    const yl = svgEl("text", { x: 13, y: (mt + H - mb) / 2, fill: "#8b93a1", "font-size": 11, "text-anchor": "middle", transform: "rotate(-90 13 " + ((mt + H - mb) / 2) + ")" });
    yl.textContent = "Car-adjusted ℚ";
    frag.appendChild(yl);

    const tipHtml = (d) => "<b>" + U.esc(d.name) +
      (allTime ? " · " + d.season : "") + "</b><br>" + U.esc(U.teamFor(d).name) +
      "<br>ℚ <b>" + U.rating(d.rating) + "</b> · Car " + U.int(d.car) +
      "<br>" + U.int(d.points) + " pts · " + d.wins + " wins";

    const dotBoxes = drivers.map((d) => {
      const cx = x(d.car || 0), cy = y(d.rating || 0);
      const pad = dotR + 2.5;
      return { id: U.driverKey(d), x1: cx - pad, x2: cx + pad, y1: cy - pad, y2: cy + pad };
    });
    const driverDots = new Map();
    const driverLabels = new Map();
    const driverRows = new Map();
    const allDots = new Set();
    const allLabels = new Set();
    const allRows = new Set();
    const addTo = (map, id, item) => {
      if (!map.has(id)) map.set(id, new Set());
      map.get(id).add(item);
    };
    const dotFrag = document.createDocumentFragment();
    const labelFrag = document.createDocumentFragment();

    for (const d of drivers) {
      const cx = x(d.car || 0), cy = y(d.rating || 0);
      const dot = svgEl("circle", { cx, cy, r: dotR, fill: U.color(d), stroke: "#0b0b0f", "stroke-width": 1.2 });
      dot.style.cursor = "pointer";
      dot.addEventListener("mouseenter", (ev) => { highlight(d.id, true); showTip(ev, tipHtml(d)); });
      dot.addEventListener("mousemove", (ev) => showTip(ev, tipHtml(d)));
      dot.addEventListener("mouseleave", () => { highlight(d.id, false); hideTip(); });
      dotFrag.appendChild(dot);
      addTo(driverDots, d.id, dot);
      allDots.add(dot);
    }

    // Place code labels only where they do not collide with another label or
    // dot. Dense clusters are covered by the driver list below the chart.
    const candidates = [
      { dx: 8, dy: 3.5, anchor: "start" },
      { dx: -8, dy: 3.5, anchor: "end" },
      { dx: 8, dy: -6, anchor: "start" },
      { dx: -8, dy: -6, anchor: "end" },
      { dx: 8, dy: 11, anchor: "start" },
      { dx: -8, dy: 11, anchor: "end" },
      { dx: 0, dy: -8, anchor: "middle" },
      { dx: 0, dy: 14, anchor: "middle" },
    ];
    const labelBoxes = [];
    const labelBox = (cx, cy, w, h, cand) => {
      const lx = cx + cand.dx, ly = cy + cand.dy;
      const x1 = cand.anchor === "start" ? lx : cand.anchor === "end" ? lx - w : lx - w / 2;
      return { x1, x2: x1 + w, y1: ly - h / 2, y2: ly + h / 2 };
    };
    const overlap = (a, b) => a.x1 < b.x2 + 2 && a.x2 > b.x1 - 2 && a.y1 < b.y2 + 2 && a.y2 > b.y1 - 2;
    const ordered = drivers.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0));
    for (const d of ordered) {
      const code = d.code || d.name.slice(0, 3).toUpperCase();
      const cx = x(d.car || 0), cy = y(d.rating || 0);
      const w = Math.max(18, code.length * 6.2 + 2), h = 11;
      let chosen = null, box = null;
      for (const cand of candidates) {
        const candidate = labelBox(cx, cy, w, h, cand);
        if (candidate.x1 < ml - 2 || candidate.x2 > W - mr + 2 ||
            candidate.y1 < mt - 2 || candidate.y2 > H - mb + 2) continue;
        if (labelBoxes.some((other) => overlap(candidate, other))) continue;
        if (dotBoxes.some((other) => other.id !== U.driverKey(d) && overlap(candidate, other))) continue;
        chosen = cand;
        box = candidate;
        break;
      }
      if (!chosen) continue;
      const label = svgEl("text", {
        x: cx + chosen.dx,
        y: cy + chosen.dy + 3.5,
        fill: "#d9dde3",
        "font-size": 10,
        "font-weight": 700,
        "text-anchor": chosen.anchor,
      });
      label.textContent = code;
      labelFrag.appendChild(label);
      addTo(driverLabels, d.id, label);
      allLabels.add(label);
      labelBoxes.push(box);
    }

    svg.innerHTML = "";
    svg.appendChild(frag);
    svg.appendChild(dotFrag);
    svg.appendChild(labelFrag);

    const list = document.getElementById("scatter-list");
    list.innerHTML = "";
    const rowMap = new Map();
    for (const d of drivers) {
      const code = d.code || d.name.slice(0, 3).toUpperCase();
      const row = document.createElement("div");
      row.className = "scatter-row";
      row.tabIndex = 0;
      row.setAttribute("aria-label", d.name + ", " + U.teamFor(d).name + ", Car " + U.int(d.car) + ", Q " + U.rating(d.rating));
      row.title = d.name + " — Car " + U.int(d.car) + " · ℚ " + U.rating(d.rating);
      row.innerHTML = '<span class="sdot" style="background:' + U.color(d) + '"></span>' +
        '<span class="scode">' + U.esc(code) + "</span>" +
        '<span class="sname">' + U.esc(d.name) +
        (allTime ? ' <span class="muted">' + d.season + "</span>" : "") + "</span>" +
        '<span class="sval"><b>' + U.rating(d.rating) + "</b> · C" + U.int(d.car) + "</span>";
      row.addEventListener("mouseenter", (ev) => { highlight(d.id, true); showTip(ev, tipHtml(d)); });
      row.addEventListener("mousemove", (ev) => showTip(ev, tipHtml(d)));
      row.addEventListener("mouseleave", () => { highlight(d.id, false); hideTip(); });
      row.addEventListener("focus", () => highlight(d.id, true));
      row.addEventListener("blur", () => highlight(d.id, false));
      list.appendChild(row);
      addTo(driverRows, d.id, row);
      allRows.add(row);
    }

    setupListToggle("scatter-list", "scatter-more-btn");

    function highlight(id, on) {
      const activeDots = on ? (driverDots.get(id) || new Set()) : new Set();
      const activeLabels = on ? (driverLabels.get(id) || new Set()) : new Set();
      const activeRows = on ? (driverRows.get(id) || new Set()) : new Set();
      for (const dot of allDots) {
        const active = activeDots.has(dot);
        dot.setAttribute("r", active ? dotR + 3 : dotR);
        dot.setAttribute("opacity", on && !active ? "0.22" : "1");
        dot.setAttribute("stroke-width", active ? 2.5 : 1.2);
      }
      for (const label of allLabels) {
        label.setAttribute("opacity", on && !activeLabels.has(label) ? "0.18" : "1");
      }
      for (const row of allRows) {
        row.classList.toggle("active", activeRows.has(row));
      }
    }
  }

  function renderTeams() {
    const svg = document.getElementById("teams-chart");
    const teams = season.constructors.slice().sort((a, b) => b.points - a.points);
    const W = 560, H = 430, ml = 106, mr = 50, mt = 18, mb = 18;
    const row = (H - mt - mb) / teams.length;
    const max = Math.max(...teams.map((t) => t.points), 1);
    const bw = W - ml - mr;
    const frag = document.createDocumentFragment();
    teams.forEach((t, i) => {
      const yy = mt + i * row;
      const name = svgEl("text", { x: ml - 10, y: yy + row / 2 + 4, fill: "#c9ced7", "font-size": 11.5, "text-anchor": "end", "font-weight": 600 });
      name.textContent = t.name;
      frag.appendChild(name);
      frag.appendChild(svgEl("rect", { x: ml, y: yy + 5, width: bw, height: row - 10, rx: 4, fill: "rgba(255,255,255,.035)" }));
      const w = Math.max(2, (t.points / max) * bw);
      frag.appendChild(svgEl("rect", { x: ml, y: yy + 5, width: w, height: row - 10, rx: 4, fill: t.color, opacity: 0.9 }));
      const val = svgEl("text", { x: ml + w + 7, y: yy + row / 2 + 4, fill: "#f4f1ec", "font-size": 11, "font-weight": 700 });
      val.textContent = Math.round(t.points);
      frag.appendChild(val);
      const hit = svgEl("rect", { x: ml, y: yy + 2, width: bw, height: row - 4, fill: "transparent" });
      hit.style.cursor = "pointer";
      hit.addEventListener("mousemove", (ev) => showTip(ev,
        "<b>" + U.esc(t.name) + "</b><br>" + Math.round(t.points) + " pts · Car " + U.int(t.car) + " · " + t.wins + " wins"));
      hit.addEventListener("mouseleave", hideTip);
      frag.appendChild(hit);
    });
    svg.innerHTML = "";
    svg.appendChild(frag);
  }

  function pointsForFinish(season, pos) {
    let table;
    if (season <= 1990) table = [9, 6, 4, 3, 2, 1];
    else if (season <= 2002) table = [10, 6, 4, 3, 2, 1];
    else if (season <= 2009) table = [10, 8, 6, 5, 4, 3, 2, 1];
    else table = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    if (!pos || pos < 1 || pos >= table.length) return 0;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return table[lo - 1] || 0;
    return (table[lo - 1] || 0) * (1 - (pos - lo)) + (table[hi - 1] || 0) * (pos - lo);
  }

  function fmtExpected(v) {
    if (v > 0 && v < 0.001) return v.toFixed(4);
    if (v > 0 && v < 0.01) return v.toFixed(3);
    return v.toFixed(2);
  }

  function fmtDelta(v) {
    const abs = Math.abs(v);
    return (v >= 0 ? "+" : "") + (abs > 0 && abs < 0.01 ? v.toFixed(3) : v.toFixed(2));
  }

  function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z >= 0 ? p : 1 - p;
  }

  function expectedPointsForTeam(team, season, fieldSize, reliability, sigma) {
    if (!team || team.carBase == null) return 0;
    // Probability-weighted expected points, not points-for-expected-finish.
    // A backmarker keeps a small tail probability of a top-10 finish, so the
    // expected value is positive rather than hard-zeroed.
    const mean = team.carBase + 0.5;
    let total = 0, ev = 0;
    for (let pos = 1; pos <= fieldSize; pos++) {
      const p = normCdf((pos + 0.5 - mean) / sigma) - normCdf((pos - 0.5 - mean) / sigma);
      total += p;
      ev += p * pointsForFinish(season, pos);
    }
    return total ? (ev / total) * reliability : 0;
  }

  function rawQColor(q) {
    if (q == null || !Number.isFinite(Number(q))) return "#666";
    const t = Math.max(0, Math.min(1, Number(q) / 100));
    return "hsl(" + (220 - 175 * t).toFixed(0) + ", 85%, 60%)";
  }

  function renderExpectation() {
    const svg = document.getElementById("expect-chart");
    const source = allTime ? U.all() : U.ranking(year);
    let rows = [];
    const minStartRows = allTime ? minStarts : 3;
    for (const d of source) {
      if (d.rawQ == null || d.car == null || (d.starts || 0) < minStartRows) continue;
      rows.push({ d, rawQ: Number(d.rawQ), car: Number(d.car), q: d.rating });
    }
    if (allTime) {
      rows.sort((a, b) => (b.q || 0) - (a.q || 0));
      const limit = topN === "all" ? rows.length : Number(topN) || 200;
      rows = rows.slice(0, limit);
    }
    const list = document.getElementById("expect-list");
    if (!rows.length) {
      svg.innerHTML = "";
      list.innerHTML = "";
      return;
    }

    const clamp = (v) => Math.max(0.001, Math.min(0.999, v));
    const logit = (q) => {
      const p = clamp(q / 100);
      return Math.log(p / (1 - p));
    };
    const fixed = U.data && U.data.rawQCurve;
    let intercept, slope;
    if (fixed && Number.isFinite(fixed.a) && Number.isFinite(fixed.b)) {
      intercept = fixed.a;
      slope = fixed.b;
    } else {
      const meanCar = rows.reduce((sum, r) => sum + r.car, 0) / rows.length;
      const meanLogit = rows.reduce((sum, r) => sum + logit(r.rawQ), 0) / rows.length;
      let num = 0, den = 0;
      for (const r of rows) {
        num += (r.car - meanCar) * (logit(r.rawQ) - meanLogit);
        den += (r.car - meanCar) ** 2;
      }
      slope = den ? num / den : 0;
      intercept = meanLogit - slope * meanCar;
    }
    const predict = (car) => 100 / (1 + Math.exp(-(intercept + slope * car)));
    for (const r of rows) {
      r.expectedRaw = predict(r.car);
      r.delta = r.rawQ - r.expectedRaw;
    }
    const titleEl = document.getElementById("expect-title");
    if (titleEl) titleEl.textContent = allTime ? "Raw Q vs car performance — all time" : "Raw Q vs car performance";
    const noteEl = document.getElementById("expect-note");
    if (noteEl && fixed) {
      noteEl.innerHTML = "<b>Raw Q</b> is a no-car score combining race skill, wins, podiums, average finish and teammate head-to-head. " +
        "<b>Car</b> is the data-fit team performance score. The dashed curve is the fixed all-time logistic fit " +
        "(n=" + fixed.n + ", R²=" + fixed.r2 + "), used in every season. Lists are sorted by car-adjusted ℚ; Δ is versus that curve. " +
        "Drivers with " + (allTime ? minStarts : 3) + "+ starts are shown; All time uses the Drivers shown and Min starts selectors above, selected by car-adjusted ℚ while the y-axis remains Raw Q.";
    }

    const W = 1000, H = 430, ml = 58, mr = 30, mt = 20, mb = 46;
    const x = (v) => ml + (v / 100) * (W - ml - mr);
    const y = (v) => H - mb - (v / 100) * (H - mt - mb);
    const ticks = [0, 20, 40, 60, 80, 100];

    const frag = document.createDocumentFragment();
    for (const v of ticks) {
      frag.appendChild(svgEl("line", { x1: ml, x2: W - mr, y1: y(v), y2: y(v), stroke: "rgba(255,255,255,.06)" }));
      const ly = svgEl("text", { x: ml - 9, y: y(v) + 4, fill: "#8b93a1", "font-size": 10, "text-anchor": "end" });
      ly.textContent = v;
      frag.appendChild(ly);
      const lx = svgEl("text", { x: x(v), y: H - 24, fill: "#8b93a1", "font-size": 10, "text-anchor": "middle" });
      lx.textContent = v;
      frag.appendChild(lx);
    }
    const trendPoints = [];
    for (let v = 0; v <= 100; v += 2) {
      trendPoints.push((trendPoints.length ? "L" : "M") + x(v).toFixed(2) + " " + y(predict(v)).toFixed(2));
    }
    frag.appendChild(svgEl("path", {
      d: trendPoints.join(" "), fill: "none", stroke: "rgba(255,255,255,.28)",
      "stroke-width": 2, "stroke-dasharray": "6 5",
    }));
    const xl = svgEl("text", { x: (ml + W - mr) / 2, y: H - 6, fill: "#8b93a1", "font-size": 11, "text-anchor": "middle" });
    xl.textContent = "Car performance (0–100)";
    frag.appendChild(xl);
    const yl = svgEl("text", { x: 13, y: (mt + H - mb) / 2, fill: "#8b93a1", "font-size": 11, "text-anchor": "middle", transform: "rotate(-90 13 " + ((mt + H - mb) / 2) + ")" });
    yl.textContent = "Raw Q (not car-adjusted)";
    frag.appendChild(yl);

    const clusters = new Map();
    for (const row of rows) {
      row.cx = x(row.car);
      row.cy = y(row.rawQ);
      const key = row.car.toFixed(2) + "|" + row.rawQ.toFixed(2);
      if (!clusters.has(key)) clusters.set(key, []);
      clusters.get(key).push(row);
    }

    const deltaText = (row) => fmtDelta(row.delta);
    const rowTip = (row) => "<b>" + U.esc(row.d.name) +
      (allTime ? " · " + row.d.season : "") + "</b><br>" + U.esc(U.teamFor(row.d).name) +
      "<br>Raw Q <b>" + U.rating(row.rawQ) + "</b> · Car <b>" + U.int(row.car) + "</b>" +
      "<br>Car-adjusted ℚ <b>" + U.rating(row.q) + "</b>" +
      "<br>Δ vs car trend <b>" + deltaText(row) + "</b>";
    const clusterTip = (group) => {
      const sample = group[0];
      const names = group.map((r) => U.esc(r.d.name) + (allTime ? " (" + r.d.season + ")" : "")).join(", ");
      return "<b>" + group.length + " drivers at this point</b><br>" +
        "Raw Q <b>" + U.rating(sample.rawQ) + "</b> · Car <b>" + U.int(sample.car) + "</b>" +
        "<br>Δ vs car trend " + deltaText(sample) + "<br>" + names;
    };

    const driverDots = new Map();
    const driverLabels = new Map();
    const driverRows = new Map();
    const allDots = new Set();
    const allLabels = new Set();
    const allRows = new Set();
    const rowDriverIds = new Map();
    const addTo = (map, id, item) => {
      if (!map.has(id)) map.set(id, new Set());
      map.get(id).add(item);
    };
    const dotBoxes = rows.map((row) => ({ id: row.d.id + "|" + row.d.season, x1: row.cx - 8, x2: row.cx + 8, y1: row.cy - 8, y2: row.cy + 8 }));
    const dotFrag = document.createDocumentFragment();
    const labelFrag = document.createDocumentFragment();
    for (const group of clusters.values()) {
      const row = group[0];
      const baseR = group.length > 1 ? 7 : 6;
      const dot = svgEl("circle", { cx: row.cx, cy: row.cy, r: baseR, fill: U.color(row.d), stroke: "#0b0b0f", "stroke-width": 1.5 });
      dot.dataset.baseR = String(baseR);
      dot.style.cursor = "pointer";
      const tip = group.length > 1 ? clusterTip(group) : rowTip(row);
      const ids = new Set(group.map((r) => r.d.id));
      dot.addEventListener("mouseenter", (ev) => { highlightIds(ids, true); showTip(ev, tip); });
      dot.addEventListener("mousemove", (ev) => showTip(ev, tip));
      dot.addEventListener("mouseleave", () => { highlightIds(ids, false); hideTip(); });
      dotFrag.appendChild(dot);
      allDots.add(dot);
      if (group.length > 1) {
        const count = svgEl("text", {
          x: row.cx + 9, y: row.cy - 7, fill: "#fff", "font-size": 9, "font-weight": 800,
          "paint-order": "stroke", stroke: "#0b0b0f", "stroke-width": 2.5,
        });
        count.textContent = "×" + group.length;
        dotFrag.appendChild(count);
      }
      for (const member of group) {
        addTo(driverDots, member.d.id, dot);
        rowDriverIds.set(member, ids);
      }
    }

    const candidates = [
      { dx: 8, dy: 3.5, anchor: "start" }, { dx: -8, dy: 3.5, anchor: "end" },
      { dx: 8, dy: -6, anchor: "start" }, { dx: -8, dy: -6, anchor: "end" },
      { dx: 8, dy: 11, anchor: "start" }, { dx: -8, dy: 11, anchor: "end" },
      { dx: 0, dy: -8, anchor: "middle" }, { dx: 0, dy: 14, anchor: "middle" },
    ];
    const labelBoxes = [];
    const labelBox = (cx, cy, w, h, cand) => {
      const lx = cx + cand.dx, ly = cy + cand.dy;
      const x1 = cand.anchor === "start" ? lx : cand.anchor === "end" ? lx - w : lx - w / 2;
      return { x1, x2: x1 + w, y1: ly - h / 2, y2: ly + h / 2 };
    };
    const overlap = (a, b) => a.x1 < b.x2 + 2 && a.x2 > b.x1 - 2 && a.y1 < b.y2 + 2 && a.y2 > b.y1 - 2;
    for (const row of rows.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12)) {
      const code = row.d.code || row.d.name.slice(0, 3).toUpperCase();
      const w = Math.max(18, code.length * 6.2 + 2), h = 11;
      let chosen = null, box = null;
      for (const cand of candidates) {
        const candidate = labelBox(row.cx, row.cy, w, h, cand);
        if (candidate.x1 < ml - 2 || candidate.x2 > W - mr + 2 || candidate.y1 < mt - 2 || candidate.y2 > H - mb + 2) continue;
        if (labelBoxes.some((other) => overlap(candidate, other))) continue;
        if (dotBoxes.some((other) => other.id !== (row.d.id + "|" + row.d.season) && overlap(candidate, other))) continue;
        chosen = cand;
        box = candidate;
        break;
      }
      if (!chosen) continue;
      const label = svgEl("text", {
        x: row.cx + chosen.dx, y: row.cy + chosen.dy + 3.5,
        fill: "#d9dde3", "font-size": 10, "font-weight": 700, "text-anchor": chosen.anchor,
      });
      label.textContent = code;
      labelFrag.appendChild(label);
      allLabels.add(label);
      for (const id of (rowDriverIds.get(row) || new Set([row.d.id]))) {
        addTo(driverLabels, id, label);
      }
      labelBoxes.push(box);
    }

    svg.innerHTML = "";
    svg.appendChild(frag);
    svg.appendChild(dotFrag);
    svg.appendChild(labelFrag);

    list.innerHTML = "";
    const ordered = rows.slice().sort((a, b) => (b.q || 0) - (a.q || 0));
    for (const row of ordered) {
      const code = row.d.code || row.d.name.slice(0, 3).toUpperCase();
      const item = document.createElement("div");
      item.className = "scatter-row";
      item.tabIndex = 0;
      const title = "Raw Q " + U.rating(row.rawQ) + " · Car " + U.int(row.car) +
        " · ℚ " + U.rating(row.q) + " · Δ " + deltaText(row);
      const seasonText = allTime ? " · " + row.d.season : "";
      item.title = row.d.name + seasonText + " — " + title;
      item.setAttribute("aria-label", row.d.name + seasonText + ", " + title);
      item.innerHTML = '<span class="sdot" style="background:' + U.color(row.d) + '"></span>' +
        '<span class="scode">' + U.esc(code) + "</span>" +
        '<span class="sname">' + U.esc(row.d.name) +
        (allTime ? ' <span class="muted">' + row.d.season + "</span>" : "") + "</span>" +
        '<span class="sval">R <b>' + U.rating(row.rawQ) + "</b> · C " + U.int(row.car) +
        " · Q " + U.rating(row.q) +
        ' <span class="expect-delta ' + (row.delta >= 0 ? "pos" : "neg") + '">' + deltaText(row) + "</span></span>";
      item.addEventListener("mouseenter", (ev) => { highlightIds(new Set([row.d.id]), true); showTip(ev, rowTip(row)); });
      item.addEventListener("mousemove", (ev) => showTip(ev, rowTip(row)));
      item.addEventListener("mouseleave", () => { highlightIds(new Set([row.d.id]), false); hideTip(); });
      item.addEventListener("focus", () => highlightIds(new Set([row.d.id]), true));
      item.addEventListener("blur", () => highlightIds(new Set([row.d.id]), false));
      list.appendChild(item);
      addTo(driverRows, row.d.id, item);
      allRows.add(item);
    }

    setupListToggle("expect-list", "expect-more-btn");

    function highlightIds(ids, on) {
      const hovered = new Set(ids);
      const activeDots = new Set();
      const activeLabels = new Set();
      const activeRows = new Set();
      if (on) {
        for (const id of hovered) {
          for (const dot of driverDots.get(id) || []) activeDots.add(dot);
          for (const label of driverLabels.get(id) || []) activeLabels.add(label);
          for (const row of driverRows.get(id) || []) activeRows.add(row);
        }
      }
      for (const dot of allDots) {
        const active = activeDots.has(dot);
        dot.setAttribute("r", active ? 10 : (dot.dataset.baseR || 6));
        dot.setAttribute("opacity", on && !active ? "0.22" : "1");
        dot.setAttribute("stroke-width", active ? 3 : 1.5);
      }
      for (const label of allLabels) {
        label.setAttribute("opacity", on && !activeLabels.has(label) ? "0.2" : "1");
      }
      for (const row of allRows) {
        row.classList.toggle("active", activeRows.has(row));
      }
    }
  }

  function renderBestSeasons() {
    const section = document.getElementById("best-season-section");
    const svg = document.getElementById("best-season-chart");
    const noteEl = document.getElementById("best-season-note");
    if (!section || !svg) return;
    section.hidden = !allTime;
    if (!allTime) {
      svg.innerHTML = "";
      return;
    }

    const MIN_STARTS = 3;
    const byYear = new Map();
    for (const d of U.all()) {
      if (d.rating == null || (d.starts || 0) < MIN_STARTS) continue;
      const current = byYear.get(d.season);
      if (!current || d.rating > current.rating) byYear.set(d.season, d);
    }
    const rows = U.years.map((y) => {
      const driver = byYear.get(y);
      if (driver) return { type: "rated", year: y, driver };
      const s = U.season(y);
      return s && s.memorial ? { type: "withheld", year: y, memorial: s.memorial } : null;
    }).filter(Boolean);
    const ratedCount = rows.filter((r) => r.type === "rated").length;
    const withheldCount = rows.length - ratedCount;

    if (noteEl) {
      noteEl.innerHTML = "<b>" + ratedCount + "</b> seasons rated" +
        (withheldCount ? " and <b>" + withheldCount + "</b> withheld in memory" : "") +
        ". Each bar is the highest car-adjusted ℚ in that season, minimum 3 starts, " +
        "in season order, newest first. Bar colour is the driver's team.";
    }
    if (!rows.length) {
      svg.innerHTML = "";
      return;
    }

    const W = 1000, ml = 56, mr = 74, mt = 16, mb = 46;
    const total = rows.length;
    const rowH = 14;
    const H = mt + mb + Math.max(1, total) * rowH;
    const barH = Math.min(10.5, rowH - 3);
    const bw = W - ml - mr;
    const x = (v) => ml + (v / 100) * bw;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    const frag = document.createDocumentFragment();

    for (let t = 0; t <= 100; t += 20) {
      frag.appendChild(svgEl("line", {
        x1: x(t), x2: x(t), y1: mt - 4, y2: H - mb,
        stroke: t === 0 ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.06)",
      }));
      const lx = svgEl("text", { x: x(t), y: H - mb + 16, fill: "#8b93a1", "font-size": 10, "text-anchor": "middle" });
      lx.textContent = t;
      frag.appendChild(lx);
    }
    const xl = svgEl("text", { x: ml + bw / 2, y: H - 6, fill: "#8b93a1", "font-size": 11, "text-anchor": "middle" });
    xl.textContent = "Car-adjusted ℚ";
    frag.appendChild(xl);

    const barsByDriver = new Map();
    const labelsByDriver = new Map();
    const allBars = new Set();
    const allLabels = new Set();
    const addTo = (map, id, item) => {
      if (!map.has(id)) map.set(id, new Set());
      map.get(id).add(item);
    };

    rows.forEach((row, i) => {
      const yTop = mt + i * rowH;
      const cy = yTop + rowH / 2;

      const yearLabel = svgEl("text", {
        x: ml - 10, y: cy + 3.4, fill: "#8b93a1", "font-size": 10, "font-weight": 600, "text-anchor": "end",
      });
      yearLabel.textContent = row.year;
      frag.appendChild(yearLabel);

      if (row.type === "withheld") {
        frag.appendChild(svgEl("rect", {
          x: ml, y: yTop + (rowH - barH) / 2, width: bw, height: barH, rx: 2,
          fill: "rgba(255,255,255,.03)", stroke: "rgba(255,255,255,.16)", "stroke-dasharray": "4 3",
        }));

        const label = svgEl("text", {
          x: ml + 8, y: cy + 3.2, fill: "#8b93a1", "font-size": 8.6, "font-weight": 600,
        });
        label.textContent = "Q withheld — in memory of " + row.memorial;
        frag.appendChild(label);

        const tip = "<b>" + row.year + "</b><br>Q withheld in memory of " + U.esc(row.memorial) + ".";
        const hit = svgEl("rect", { x: ml - 4, y: yTop, width: bw + 8, height: rowH, fill: "transparent" });
        hit.addEventListener("mousemove", (ev) => showTip(ev, tip));
        hit.addEventListener("mouseleave", hideTip);
        frag.appendChild(hit);
        return;
      }

      const d = row.driver;
      const width = Math.max(2, x(d.rating) - ml);
      const bar = svgEl("rect", {
        x: ml, y: yTop + (rowH - barH) / 2, width, height: barH, rx: 2,
        fill: U.color(d), opacity: 0.9,
      });
      frag.appendChild(bar);

      const name = svgEl("text", {
        x: ml + 7, y: cy + 3.2, fill: "#fff", "font-size": 9.2, "font-weight": 700,
        "paint-order": "stroke", stroke: "#0b0b0f", "stroke-width": 2.4,
      });
      name.textContent = d.name;
      frag.appendChild(name);

      const value = svgEl("text", {
        x: x(d.rating) + 7, y: cy + 3.2, fill: "#f4f1ec", "font-size": 9.2, "font-weight": 700,
      });
      value.textContent = U.rating(d.rating);
      frag.appendChild(value);

      const tip = () => "<b>" + U.esc(d.name) + "</b> · " + d.season +
        "<br>" + U.esc(U.teamFor(d).name) +
        "<br>ℚ <b>" + U.rating(d.rating) + "</b> · Car " + U.int(d.car) +
        "<br>Raw Q " + U.rating(d.rawQ) + " · " + d.wins + " wins · " + (d.starts || 0) + " starts";
      const hit = svgEl("rect", { x: ml - 4, y: yTop, width: bw + 8, height: rowH, fill: "transparent" });
      hit.style.cursor = "pointer";
      hit.addEventListener("mouseenter", (ev) => { highlight(d.id, true); showTip(ev, tip()); });
      hit.addEventListener("mousemove", (ev) => showTip(ev, tip()));
      hit.addEventListener("mouseleave", () => { highlight(d.id, false); hideTip(); });
      frag.appendChild(hit);

      addTo(barsByDriver, d.id, bar);
      allBars.add(bar);
      for (const label of [name, value, yearLabel]) {
        addTo(labelsByDriver, d.id, label);
        allLabels.add(label);
      }
    });

    svg.innerHTML = "";
    svg.appendChild(frag);

    function highlight(id, on) {
      const activeBars = on ? (barsByDriver.get(id) || new Set()) : new Set();
      const activeLabels = on ? (labelsByDriver.get(id) || new Set()) : new Set();
      for (const bar of allBars) {
        const active = activeBars.has(bar);
        bar.setAttribute("opacity", on && !active ? "0.16" : "0.9");
        bar.setAttribute("stroke", active ? "#fff" : "none");
        bar.setAttribute("stroke-width", active ? "1.2" : "0");
      }
      for (const label of allLabels) {
        label.setAttribute("opacity", on && !activeLabels.has(label) ? "0.2" : "1");
      }
    }
  }

  function renderForm() {
    const table = document.getElementById("form-table");
    const drivers = U.ranking(year);
    const races = season.races;
    const head = "<thead><tr><th class=\"driver-col\">Driver</th>" +
      races.map((r) => "<th title=\"" + U.esc(r.name) + (r.sprint ? " · sprint weekend" : "") + "\">R" + r.round + (r.sprint ? "•" : "") + "</th>").join("") +
      "<th>ℚ</th></tr></thead>";
    const body = "<tbody>" + drivers.map((d) => {
      const cells = races.map((race) => {
        const r = U.raceResult(race, d.id);
        if (!r) return '<td class="blank">–</td>';
        if (r.pos == null) return '<td class="dnf" title="' + U.esc(r.status || r.posText) + '">×</td>';
        return '<td class="' + U.positionClass(r.pos) + '">' + r.pos + "</td>";
      }).join("");
      return "<tr><td class=\"driver-cell\"><span class=\"team-dot\" style=\"background:" + U.color(d) + "\"></span>" +
        '<a href="' + U.driverUrl(d.id, year) + '" style="color:inherit;text-decoration:none">' + U.esc(d.name) + "</a></td>" +
        cells + "<td><b>" + U.rating(d.rating) + "</b></td></tr>";
    }).join("") + "</tbody>";
    table.innerHTML = head + body;
  }

  function arrangeCharts() {
    const rawq = document.getElementById("rawq-section");
    const scatter = document.getElementById("scatter-section");
    const grid = document.querySelector(".charts-grid");
    if (!rawq || !scatter || !grid) return;
    if (allTime) {
      if (scatter.previousElementSibling !== rawq) rawq.after(scatter);
    } else if (scatter.parentElement !== grid || grid.firstElementChild !== scatter) {
      grid.prepend(scatter);
    }
  }

  function renderAll() {
    arrangeCharts();
    const minWrap = document.getElementById("min-starts-wrap");
    if (minWrap) minWrap.style.display = allTime ? "" : "none";
    const mem = !allTime && season.memorial;
    let note = document.getElementById("memorial-note");
    if (!note) {
      note = document.createElement("div");
      note.id = "memorial-note";
      note.className = "section";
      const main = document.querySelector("main");
      if (main) main.prepend(note);
    }
    note.hidden = !mem;
    document.body.classList.remove("memorial-mode");
    const bestSection = document.getElementById("best-season-section");
    if (bestSection) bestSection.hidden = !allTime;
    if (mem) {
      note.innerHTML = '<div class="section-head"><h2>In memory</h2><p>In memory of ' +
        U.esc(mem) + '. Their rating for ' + U.esc(year) + ' is withheld; the rest of the season is rated normally.</p></div>';
    }
    renderPoints();
    renderScatter();
    renderTeams();
    renderExpectation();
    renderBestSeasons();
    renderForm();
  }

  const sel = document.getElementById("season-select");
  sel.innerHTML = '<option value="all">All time</option>' + U.seasonOptions(allTime ? "" : year, false);
  sel.value = allTime ? "all" : String(year);
  sel.addEventListener("change", () => {
    const wasAllTime = allTime;
    allTime = sel.value === "all";
    year = allTime ? U.latestYear : Number(sel.value);
    season = U.season(year);
    hidden.clear();
    if (allTime && !wasAllTime && topN === "10") topN = "200";
    if (!allTime && wasAllTime && topN === "200") topN = "10";
    if (topSelect) topSelect.value = String(topN);
    document.body.classList.toggle("all-time-mode", allTime);
    const params = new URLSearchParams(location.search);
    params.set("season", allTime ? "all" : String(year));
    history.replaceState(null, "", location.pathname + "?" + params.toString());
    renderAll();
  });

  document.getElementById("top-select").addEventListener("change", (e) => {
    topN = e.target.value;
    hidden.clear();
    renderPoints();
    renderScatter();
    renderExpectation();
  });

  const minStartsSelect = document.getElementById("min-starts-select");
  if (minStartsSelect) {
    minStartsSelect.value = String(minStarts);
    minStartsSelect.addEventListener("change", (e) => {
      minStarts = Number(e.target.value) || 10;
      renderScatter();
      renderExpectation();
    });
  }

  renderAll();
})();
