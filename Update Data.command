#!/bin/zsh
# Double-click this file in Finder to refresh the latest season's data.
#
# It re-downloads the newest season already present in data.js, rebuilds every
# rating, reports the biggest ℚ-score changes, and bumps the ?v= cache token on
# every page so browsers pick up the new files.
set -u

cd "$(dirname "$0")" || exit 1

pause() {
  echo
  printf "Press Return to close this window..."
  read -r _ || true
}

PYTHON="$(command -v python3 || true)"
if [ -z "$PYTHON" ]; then
  echo "python3 was not found. Install Python 3 and try again."
  pause
  exit 1
fi

NODE="$(command -v node || true)"
SNAPSHOT=""

if [ ! -f data.js ] || [ ! -f scripts/build_data.py ]; then
  echo "Run this from inside the f1-stats folder (data.js / scripts missing)."
  pause
  exit 1
fi

# The newest season already in data.js is the one to refresh.
SEASON="$("$PYTHON" - <<'PY'
import json, re
raw = open("data.js", encoding="utf-8").read()
m = re.search(r"window\.F1_DATA\s*=\s*(\{.*\});", raw, re.S)
data = json.loads(m.group(1))
print(data["years"][0])
PY
)"

if [ -z "$SEASON" ]; then
  echo "Could not work out the latest season from data.js."
  pause
  exit 1
fi

# Snapshot the current ℚ ratings before data.js is overwritten.
if [ -n "$NODE" ]; then
  mkdir -p scripts/api_cache
  SNAPSHOT="scripts/api_cache/d_${SEASON}_before.json"
  if ! "$NODE" scripts/d_snapshot.js save "$SEASON" "$SNAPSHOT"; then
    echo "Could not save the pre-update ℚ snapshot; the change report will be skipped."
    SNAPSHOT=""
  fi
else
  echo "node was not found; the rating-change report will be skipped."
fi

echo "Refreshing the $SEASON season from formula1.com..."
echo "(race results, grids, qualifying, fastest laps, sprints and standings)"
echo

if ! "$PYTHON" scripts/fetch_formula1.py --from "$SEASON" --to "$SEASON" --refresh; then
  echo
  echo "Update FAILED. data.js was not modified."
  pause
  exit 1
fi

echo
echo "Rebuilding ratings for every season..."
if ! "$PYTHON" scripts/build_data.py; then
  echo
  echo "Build FAILED. data.js may be incomplete."
  pause
  exit 1
fi

# Report the biggest ℚ-rating changes caused by this refresh.
if [ -n "$NODE" ] && [ -n "$SNAPSHOT" ]; then
  "$NODE" scripts/d_snapshot.js report "$SEASON" "$SNAPSHOT" || true
fi

# Bump only query-string versions (e.g. ?v=10) in the page files.
VERSION="$(date +%Y%m%d)z$(date +%H%M%S)"
VERSION="$VERSION" "$PYTHON" - <<'PY'
import glob, os, re
version = os.environ["VERSION"]
for name in glob.glob("*.html"):
    text = open(name, encoding="utf-8").read()
    text = re.sub(r"\?v=[0-9A-Za-z]+", "?v=" + version, text)
    open(name, "w", encoding="utf-8").write(text)
PY

echo
"$PYTHON" - "$SEASON" <<'PY'
import json, re, sys
season = sys.argv[1]
raw = open("data.js", encoding="utf-8").read()
m = re.search(r"window\.F1_DATA\s*=\s*(\{.*\});", raw, re.S)
data = json.loads(m.group(1))
s = data["seasons"][season]
print("%s: %d drivers, %d of %d rounds, %d teams" % (
    season, len(s["drivers"]), s["completedRounds"], s["totalRounds"], len(s["constructors"])
))
PY

echo "Fresh data.js saved. Browser cache version is now $VERSION."
echo "Reload the site (or press Cmd+Shift+R) to see it."
pause
