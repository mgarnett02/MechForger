#!/usr/bin/env bash
# Compare MechForger's BV and cost with MegaMek's own calculators over the canon units.
# Usage: tools/megamek-check/run.sh <megamek checkout> <mm-data checkout> [unit kind]
# The MegaMek checkout must be compiled first: (cd <megamek> && gradle :megamek:compileJava)
set -euo pipefail
MM="$1"; DATA="$2"; KIND="${3:-}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${TMPDIR:-/tmp}/mechforger-megamek-check"
mkdir -p "$OUT"
CP="$MM/megamek/build/classes/java/main:$MM/megamek/build/resources/main:$MM/megamek/resources:$(find ~/.gradle/caches -name '*.jar' | tr '\n' ':')"
javac -proc:none -cp "$CP" -d "$OUT" "$HERE/BV.java" "$HERE/Rep.java"
cd "$OUT"
ln -sfn "$DATA/data" data
M="$DATA/data/mekfiles"
find "$M/protomeks" "$M/handheld" "$M/ge" "$M/dropships" "$M/smallcraft" "$M/jumpships" "$M/warship" "$M/spacestation" -name '*.blk' > all.txt
find "$M/vehicles" -name '*.blk' > veh.txt
find "$M/meks" "$M/fighters" "$M/convfighter" \( -name '*.mtf' -o -name '*.blk' \) > mech.txt
java -cp ".:$CP" BV < all.txt 2>/dev/null > mm.tsv
java -cp ".:$CP" BV < veh.txt 2>/dev/null > mmveh.tsv
java -cp ".:$CP" BV < mech.txt 2>/dev/null > mmmech.tsv
cd "$HERE/../.."
npx vite-node tools/megamek-check/compare.ts "$OUT" $KIND
echo "Itemized MegaMek report for one unit: java -cp \"$OUT:$CP\" Rep <unit file>"
