#!/usr/bin/env bash
set -euo pipefail

REPO="CyKrome-Nexus/Drift-Release"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"

case "$(uname -s)" in
  Darwin)
    if [ -n "${SCRIPT_DIR}" ] && [ -f "${SCRIPT_DIR}/install-mac.sh" ]; then
      exec bash "${SCRIPT_DIR}/install-mac.sh" "$@"
    fi
    exec curl -fsSL "https://github.com/${REPO}/releases/latest/download/install-mac.sh" | bash
    ;;
  Linux)
    if [ -n "${SCRIPT_DIR}" ] && [ -f "${SCRIPT_DIR}/install-linux.sh" ]; then
      exec bash "${SCRIPT_DIR}/install-linux.sh" "$@"
    fi
    exec curl -fsSL "https://github.com/${REPO}/releases/latest/download/install-linux.sh" | bash
    ;;
  *)
    echo "Error: unsupported OS. Windows installers are available at https://github.com/${REPO}/releases/latest" >&2
    exit 1
    ;;
esac
