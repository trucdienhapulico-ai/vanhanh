#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/ops-standard"
STORE_DIR="$ROOT_DIR/state/webapp-versions"
LABEL_RAW="${1:-manual}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LABEL="$(printf '%s' "$LABEL_RAW" | tr '[:space:]/' '--' | tr -cd '[:alnum:]_.-')"
[ -n "$LABEL" ] || LABEL="manual"
NAME="${STAMP}_${LABEL}"
ARCHIVE="$STORE_DIR/${NAME}.tar.gz"
META="$STORE_DIR/${NAME}.meta"
COMMIT="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"

mkdir -p "$STORE_DIR"

if [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: missing source dir $SRC_DIR" >&2
  exit 1
fi

tar -czf "$ARCHIVE" -C "$ROOT_DIR" \
  ops-standard/package.json \
  ops-standard/server.js \
  ops-standard/README.md \
  ops-standard/public

cat > "$META" <<EOF
name=$NAME
created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
label=$LABEL_RAW
git_commit=$COMMIT
archive=$(basename "$ARCHIVE")
contents=ops-standard/package.json,ops-standard/server.js,ops-standard/README.md,ops-standard/public/
EOF

echo "Backup created: $ARCHIVE"
echo "Metadata: $META"
