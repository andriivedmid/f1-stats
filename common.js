/* Shared helpers for the F1 stats site (multi-season, car-adjusted). */
(function () {
  "use strict";
  const DATA = window.F1_DATA;
  if (!DATA) return;

  const seasons = DATA.seasons || {};
  const years = (DATA.years || Object.keys(seasons).map(Number)).slice();
  const byKey = new Map();

  function decorate(season) {
    return season.drivers.map((d) => {
      if (d.season === undefined) d.season = season.year;
      byKey.set(d.season + "|" + d.id, d);
      return d;
    });
  }
  for (const y of years) if (seasons[String(y)]) decorate(seasons[String(y)]);

  const U = {
    data: DATA,
    years,
    seasons,
    season(year) { return seasons[String(year)] || null; },
    latestYear: years[0],

    driverKey(d) { return d.season + "|" + d.id; },
    driver(year, id) {
      const s = U.season(year);
      if (!s) return null;
      return s.drivers.find((d) => d.id === id) || null;
    },
    driverFromKey(key) { return byKey.get(key) || null; },
    teamFor(d) {
      const s = U.season(d.season);
      const t = s && s.teams ? s.teams[d.team] : null;
      return t || { id: d.team, name: d.teamName || d.team, color: "#888" };
    },
    team(year, id) {
      const s = U.season(year);
      return s && s.teams ? s.teams[id] : null;
    },
    color(d) { return U.teamFor(d).color; },

    all() {
      const out = [];
      for (const y of years) for (const d of seasons[String(y)].drivers) out.push(d);
      return out;
    },
    ranking(year) {
      const rows = year ? U.season(year).drivers : U.all();
      return rows.filter((d) => d.rating != null).sort((a, b) => b.rating - a.rating);
    },
    standings(year) {
      return U.season(year).drivers.slice().sort((a, b) => b.points - a.points ||
        b.wins - a.wins || b.podiums - a.podiums);
    },
    allCars() {
      if (U._cars) return U._cars;
      const out = [];
      for (const y of years) {
        for (const c of seasons[String(y)].constructors) {
          out.push({ ...c, season: y });
        }
      }
      out.sort((a, b) => b.car - a.car);
      U._cars = out;
      return out;
    },
    career(id) {
      const out = [];
      for (const y of years.slice().sort((a, b) => a - b)) {
        const d = U.driver(y, id);
        if (d) out.push(d);
      }
      return out;
    },
    driverName(id) {
      for (const y of years) {
        const d = U.driver(y, id);
        if (d) return d.name;
      }
      return id;
    },

    esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    },
    fmt(v, n = 0) {
      if (v === null || v === undefined || v === "" || !Number.isFinite(Number(v))) return "—";
      return Number(v).toFixed(n);
    },
    int(v) {
      if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
      return Math.round(Number(v)).toLocaleString("en-US");
    },
    pct(v, n = 0) {
      if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
      return (Number(v) * 100).toFixed(n) + "%";
    },
    ordinal(n) {
      const v = Number(n);
      if (!Number.isFinite(v)) return "—";
      const s = ["th", "st", "nd", "rd"], m = v % 100;
      return v + (s[(m - 20) % 10] || s[m] || s[0]);
    },
    rating(v) {
      if (v === null || v === undefined || !Number.isFinite(Number(v))) return "—";
      return Number(v).toFixed(3);
    },
    ratingFull(v) {
      const x = v && typeof v === "object" ? (v.ratingExact ?? v.rating) : v;
      if (x === null || x === undefined || !Number.isFinite(Number(x))) return "—";
      return Number(x).toFixed(6);
    },
    ratingTier(v) {
      if (v == null) return { name: "Unrated", color: "#666" };
      if (v >= 95) return { name: "All-time great", color: "#ffd43b" };
      if (v >= 90) return { name: "Elite", color: "#ff9f43" };
      if (v >= 82) return { name: "Very good", color: "#ff6b6b" };
      if (v >= 70) return { name: "Good", color: "#c084fc" };
      if (v >= 55) return { name: "Average", color: "#60a5fa" };
      if (v >= 37) return { name: "Below average", color: "#34d399" };
      if (v >= 18) return { name: "Weak", color: "#9aa0ab" };
      return { name: "Tail", color: "#6b7280" };
    },
    carTier(v) {
      if (v == null) return { name: "—", color: "#666" };
      if (v >= 90) return { name: "Front-running car", color: "#ffd43b" };
      if (v >= 72) return { name: "Top car", color: "#ff9f43" };
      if (v >= 52) return { name: "Midfield car", color: "#60a5fa" };
      if (v >= 30) return { name: "Lower midfield", color: "#9aa0ab" };
      return { name: "Backmarker car", color: "#6b7280" };
    },
    flag(d) { return d && d.flag ? d.flag : "🏁"; },
    driverUrl(id, season) {
      return "profile.html?driver=" + encodeURIComponent(id) + (season ? "&season=" + season : "");
    },
    raceUrl(season, round) {
      return "races.html?season=" + season + "&race=" + round;
    },
    dateLabel(iso) {
      if (!iso) return "";
      const d = new Date(iso + "T12:00:00");
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    },
    raceResult(race, id) {
      return (race.results || []).find((r) => r.driver === id) || null;
    },
    cumulativePoints(season, id, throughRound) {
      const s = U.season(season);
      let total = 0;
      for (const race of s.races) {
        if (throughRound && race.round > throughRound) break;
        const r = U.raceResult(race, id);
        if (r) total += (r.points || 0) + (r.sprintPoints || 0);
      }
      return total;
    },
    positionClass(pos) {
      if (pos === 1) return "win";
      if (pos <= 3) return "podium";
      if (pos <= 10) return "points";
      return "";
    },
    statusLabel(r) {
      if (!r) return "—";
      if (r.pos != null) return "P" + r.pos;
      return r.posText || "—";
    },
    seasonOptions(selected, includeAll) {
      let html = includeAll ? '<option value="">All seasons</option>' : "";
      for (const y of years) {
        html += '<option value="' + y + '"' + (String(selected) === String(y) ? " selected" : "") + ">" + y + "</option>";
      }
      return html;
    },
    teamOptions(year) {
      if (!year) return '<option value="">All teams</option>';
      const s = U.season(year);
      const teams = Object.values(s.teams).sort((a, b) => a.name.localeCompare(b.name));
      return '<option value="">All teams</option>' + teams.map((t) =>
        '<option value="' + U.esc(t.id) + '">' + U.esc(t.name) + "</option>").join("");
    },
    query(name, fallback) {
      const v = new URLSearchParams(location.search).get(name);
      return v == null || v === "" ? fallback : v;
    },
  };


  /* Tier definitions shared by the Tiers page and the profile chart. */
  const TIER_META = [
    { name: "All-time great", color: "#ffd43b" },
    { name: "Elite", color: "#ff9f43" },
    { name: "Very good", color: "#ff6b6b" },
    { name: "Good", color: "#c084fc" },
    { name: "Average", color: "#60a5fa" },
    { name: "Below average", color: "#34d399" },
    { name: "Weak", color: "#9aa0ab" },
    { name: "Tail", color: "#6b7280" },
  ];
  const TIER_CUTS = [0, 0.05, 0.10, 0.18, 0.30, 0.45, 0.63, 0.82, 1];

  let _tierBands = null;
  U.tierBands = function () {
    if (_tierBands) return _tierBands;
    const rows = U.all().filter((d) => d.rating != null).sort((a, b) => b.rating - a.rating);
    if (!rows.length) return [];
    const bands = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.floor(TIER_CUTS[i] * rows.length);
      const b = i === 7 ? rows.length : Math.max(a + 1, Math.floor(TIER_CUTS[i + 1] * rows.length));
      const slice = rows.slice(a, b);
      if (!slice.length) continue;
      bands.push({
        ...TIER_META[i],
        no: i + 1,
        lo: slice[slice.length - 1].rating,
        hi: slice[0].rating,
      });
    }
    _tierBands = bands;
    return bands;
  };
  U.tierForQ = function (q, bands) {
    if (q == null) return null;
    const list = bands || U.tierBands();
    for (let i = 0; i < list.length; i++) {
      if (q >= list[i].lo) return list[i];
    }
    return list[list.length - 1] || null;
  };

  // Keep the footer's "Updated" date in sync with the generated dataset.
  (function () {
    const raw = DATA.updated;
    if (!raw) return;
    const parts = String(raw).split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return;
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const label = parts[2] + " " + months[parts[1] - 1] + " " + parts[0];
    document.querySelectorAll("[data-updated]").forEach((el) => { el.textContent = label; });
  })();

  window.F1U = U;

  window.SVGNS = "http://www.w3.org/2000/svg";
  window.svgEl = function (tag, attrs, parent) {
    const el = document.createElementNS(window.SVGNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  };
})();
