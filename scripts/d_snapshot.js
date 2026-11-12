#!/usr/bin/env node
/* Snapshot / compare car-adjusted ℚ ratings for one season.

   Used by Update Data.command:
     node scripts/d_snapshot.js save 2026 scripts/api_cache/d_2026_before.json
     node scripts/d_snapshot.js report 2026 scripts/api_cache/d_2026_before.json
*/
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function loadData() {
  global.window = global;
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, "data.js"), "utf8"), { filename: "data.js" });
}

function seasonData(year) {
  const data = window.F1_DATA;
  if (!data || !data.seasons) return null;
  return data.seasons[String(year)] || null;
}

function snapshot(year) {
  const out = {};
  const season = seasonData(year);
  if (!season) return out;
  for (const d of season.drivers) {
    if (d.rating == null) continue;
    out[d.id] = {
      name: d.name,
      rating: Number(d.rating),
      starts: Number(d.starts) || 0,
      team: d.teamName || d.team || "",
      car: d.car == null ? null : Number(d.car),
      champPos: d.champPos || null,
    };
  }
  return out;
}

function save(year, dest) {
  loadData();
  const drivers = snapshot(year);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify({ year, savedAt: new Date().toISOString(), drivers }));
  console.log("Saved " + Object.keys(drivers).length + " " + year + " ℚ ratings for comparison.");
}

function report(year, src) {
  if (!fs.existsSync(src)) {
    console.log("No previous " + year + " ℚ snapshot found; skipping rating-change report.");
    return;
  }
  loadData();
  const before = JSON.parse(fs.readFileSync(src, "utf8")).drivers || {};
  const after = snapshot(year);
  const ids = new Set([...Object.keys(before), ...Object.keys(after)]);
  const rows = [];
  const added = [];
  const removed = [];

  for (const id of ids) {
    const a = before[id];
    const b = after[id];
    if (!a && b) { added.push(b.name); continue; }
    if (a && !b) { removed.push(a.name); continue; }
    if (!a || !b) continue;
    const delta = b.rating - a.rating;
    if (!Number.isFinite(delta)) continue;
    rows.push({
      name: b.name || a.name,
      oldRating: a.rating,
      newRating: b.rating,
      delta,
      oldStarts: a.starts,
      newStarts: b.starts,
    });
  }

  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  const changed = rows.filter((r) => Math.abs(r.delta) >= 0.05);

  console.log("");
  console.log("Biggest " + year + " ℚ-rating changes:");
  if (!changed.length) {
    console.log("  No ℚ changes (no new races or ratings unchanged).");
  } else {
    changed.slice(0, 10).forEach((r, i) => {
      const sign = r.delta >= 0 ? "+" : "";
      console.log(
        "  " + String(i + 1).padStart(2) + ". " + r.name.padEnd(24) +
        r.oldRating.toFixed(3).padStart(8) + " → " + r.newRating.toFixed(3).padStart(8) +
        "   Δ " + (sign + r.delta.toFixed(3)).padStart(8) +
        "   (" + r.oldStarts + " → " + r.newStarts + " starts)"
      );
    });
    if (changed.length > 10) console.log("  … and " + (changed.length - 10) + " more.");
  }
  if (added.length) console.log("  Newly rated: " + added.slice(0, 8).join(", ") + (added.length > 8 ? " …" : ""));
  if (removed.length) console.log("  No longer rated: " + removed.slice(0, 8).join(", ") + (removed.length > 8 ? " …" : ""));
}

const cmd = process.argv[2];
const year = Number(process.argv[3]);
const file = process.argv[4];
if (!["save", "report"].includes(cmd) || !Number.isFinite(year) || !file) {
  console.error("Usage: node scripts/d_snapshot.js save|report YEAR FILE");
  process.exit(2);
}
try {
  if (cmd === "save") save(year, file);
  else report(year, file);
} catch (e) {
  console.error("ℚ snapshot " + cmd + " failed: " + e.message);
  process.exit(0);
}
