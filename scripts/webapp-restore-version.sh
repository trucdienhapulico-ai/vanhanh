#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORE_DIR="$ROOT_DIR/state/webapp-versions"
BACKUP_SCRIPT="$ROOT_DIR/scripts/webapp-backup-version.sh"
TARGET="${1:-}"
MODE="${2:-restore}"

usage() {
  cat <<EOF
Usage:
  $(basename "$0") <snapshot-name-or-path> [restore|dry-run]

Examples:
  $(basename "$0") 20260430T230500Z_baseline
  $(basename "$0") /root/.openclaw/workspace/state/webapp-versions/20260430T230500Z_baseline.tar.gz dry-run
EOF
}

[ -n "$TARGET" ] || { usage; exit 1; }

if [[ "$TARGET" == *.tar.gz ]] || [[ "$TARGET" == /* ]]; then
  ARCHIVE="$TARGET"
else
  ARCHIVE="$STORE_DIR/${TARGET%.tar.gz}.tar.gz"
fi

if [ ! -f "$ARCHIVE" ]; then
  echo "ERROR: snapshot not found: $ARCHIVE" >&2
  exit 1
fi

if [ "$MODE" = "dry-run" ]; then
  echo "Would restore from: $ARCHIVE"
  tar -tzf "$ARCHIVE"
  exit 0
fi

if [ "$MODE" != "restore" ]; then
  echo "ERROR: unsupported mode '$MODE'" >&2
  usage
  exit 1
fi

"$BACKUP_SCRIPT" "pre-restore"
tar -xzf "$ARCHIVE" -C "$ROOT_DIR"
echo "Restored code from: $ARCHIVE"
echo "Note: current code before restore was snapshotted with label 'pre-restore'."
