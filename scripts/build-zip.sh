#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

VERSION="$(
  python3 - <<'PY' "$ROOT_DIR/manifest.json"
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
with manifest_path.open("r", encoding="utf-8") as fh:
    data = json.load(fh)

print(data["version"])
PY
)"

DATE_STAMP="${CHATSWEEP_BUILD_DATE:-$(date +%F)}"
OUTPUT_NAME="chatsweep-v${VERSION}-${DATE_STAMP}.zip"
OUTPUT_PATH="$DIST_DIR/$OUTPUT_NAME"

mkdir -p "$DIST_DIR"

python3 - <<'PY' "$OUTPUT_PATH"
import sys
from pathlib import Path

output = Path(sys.argv[1])
if output.exists():
    output.unlink()
PY

(
  cd "$ROOT_DIR"
  zip -r "$OUTPUT_PATH" manifest.json src assets/icons \
    -x 'assets/icons/png/*' \
    -x '*/.DS_Store' \
    -x '__MACOSX/*'
)

printf 'Built %s\n' "$OUTPUT_PATH"
