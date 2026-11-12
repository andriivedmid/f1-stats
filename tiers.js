/* Driver tiers — car-adjusted rank bands, all seasons or one season. */
(function () {
  "use strict";
  const U = window.F1U;
  if (!U) return;

  const TIERS = [
    { name: "All-time great", color: "#ffd43b", blurb: "The very top of the car-adjusted scale. Dominating a teammate and outperforming the car at a rate almost nobody matches." },
    { name: "Elite", color: "#ff9f43", blurb: "Elite car-adjusted performance. Consistent, fast, and clearly ahead of the machinery." },
    { name: "Very good", color: "#ff6b6b", blurb: "A very strong car-adjusted season. Clearly better than the field average, with occasional standout weekends." },
    { name: "Good", color: "#c084fc", blurb: "A good car-adjusted season. Consistently above the field average and usually ahead of the teammate." },
    { name: "Average", color: "#60a5fa", blurb: "Average car-adjusted performance — roughly the middle of the field once the car is accounted for." },
    { name: "Below average", color: "#34d399", blurb: "Below the field average once the car is accounted for. Clean weekends and teammate wins are the bright spots." },
    { name: "Weak", color: "#9aa0ab", blurb: "Well below the field average. The score is close to the bottom of the car-adjusted scale." },
    { name: "Tail", color: "#6b7280", blurb: "The bottom of the car-adjusted scale. Small samples and difficult seasons live here." },
  ];

  let year = U.query("season", "");
  if (year !== "" && !U.season(year)) year = "";
  let expanded = 0;

  function ratedRows() {
    const rows = year === "" ? U.all().filter((d) => d.rating != null) : U.ranking(year);
    return rows.slice().sort((a, b) => b.rating - a.rating);
  }

  function split(rows) {
    if (!rows.length) return [];
    const n = rows.length;
    if (year !== "") {
      const sizes = [1, 2, 3, 3, 3, 3, 3, 3];
      const groups = [];
      let cursor = 0;
      for (let i = 0; i < sizes.length; i++) {
        const take = i === sizes.length - 1 ? n - cursor : sizes[i];
        groups.push(rows.slice(cursor, cursor + Math.max(0, take)));
        cursor += Math.max(0, take);
        if (cursor >= n) break;
      }
      return groups.filter((g) => g.length);
    }
    const cuts = [0, 0.05, 0.10, 0.18, 0.30, 0.45, 0.63, 0.82, 1];
    const groups = [];
    for (let i = 0; i < 8; i++) {
      const a = Math.floor(cuts[i] * n);
      const b = i === 7 ? n : Math.max(a + 1, Math.floor(cuts[i + 1] * n));
      const g = rows.slice(a, b);
      if (g.length) groups.push(g);
    }
    return groups;
  }

  function bandText(list) {
    const vals = list.map((d) => d.rating).filter((v) => v != null);
    if (!vals.length) return "—";
    const hi = Math.max(...vals), lo = Math.min(...vals);
    return hi === lo ? "ℚ " + U.fmt(hi, 2) : "ℚ " + U.fmt(lo, 2) + "–" + U.fmt(hi, 2);
  }

  function detail(list, tier) {
    const seen = new Set();
    const examples = [];
    for (const d of list) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      examples.push(d);
      if (examples.length === 3) break;
    }
    const chips = examples.map((d) =>
      '<a class="tier-driver" href="' + U.driverUrl(d.id, d.season) + '">' +
      '<span class="team-dot" style="background:' + U.color(d) + '"></span>' +
      "<span>" + U.esc(d.name) + '</span><span class="yr">' + d.season + "</span>" +
      '<span class="r" title="Exact ℚ ' + U.ratingFull(d) + '">' + U.rating(d.rating) + "</span></a>"
    ).join("");
    return '<div class="tier-detail"><p class="blurb">' + U.esc(tier.blurb) + "</p>" +
      '<div class="tier-drivers">' + chips + "</div>" +
      '<p class="muted small" style="margin:10px 0 0">Showing ' + examples.length + ' of ' + list.length + ' driver-seasons in this tier.</p></div>';
  }

  function render() {
    const list = document.getElementById("tier-list");
    const current = year !== "" ? U.season(year) : null;
    const rows = ratedRows();
    const groups = split(rows);
    list.innerHTML = "";
    groups.forEach((group, i) => {
      const tier = TIERS[Math.min(i, TIERS.length - 1)];
      const li = document.createElement("li");
      li.className = "tier-row" + (expanded === i ? " pinned" : "");
      li.style.setProperty("--tier", tier.color);
      li.innerHTML =
        '<div class="tier-head"><span class="tier-badge">' + (i + 1) + "</span>" +
        "<div><h2>" + U.esc(tier.name) + '</h2><div class="tier-band">' + bandText(group) + "</div></div>" +
        '<div class="tier-meta"><b>' + group.length + "</b> driver-season" + (group.length === 1 ? "" : "s") + "</div></div>" +
        (expanded === i ? detail(group, tier) : "");
      li.tabIndex = 0;
      li.setAttribute("aria-expanded", String(expanded === i));
      const toggle = (e) => {
        if (e.target.closest("a")) return;
        expanded = expanded === i ? null : i;
        render();
      };
      li.addEventListener("click", toggle);
      li.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggle(e);
      });
      list.appendChild(li);
    });
    document.getElementById("tier-count").innerHTML =
      "<b>" + rows.length + "</b> rated driver-seasons across <b>" + groups.length + "</b> tiers · " +
      (year === "" ? "<b>1980–2026</b>" : "<b>" + year + "</b>") +
      (current && current.memorial ? " · In memory of <b>" + U.esc(current.memorial) + "</b> (their rating is withheld)" : "");
  }

  const sel = document.getElementById("season-select");
  sel.innerHTML = U.seasonOptions(year, true);
  sel.value = year;
  sel.addEventListener("change", () => {
    year = sel.value;
    expanded = 0;
    const params = new URLSearchParams(location.search);
    if (year === "") params.delete("season"); else params.set("season", year);
    history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params.toString() : ""));
    render();
  });

  render();
})();
