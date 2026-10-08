#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Drift"
APP_TARGET="/Applications/${APP_NAME}.app"
REPO="CyKrome-Nexus/Drift-Release"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "Error: this installer is for macOS only." >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) RELEASE_ARCH="aarch64" ;;
  # Matches the staged updater bundle, Drift_x86_64.app.tar.gz (see collect-artifacts.mjs).
  x86_64) RELEASE_ARCH="x86_64" ;;
  *)
    echo "Error: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "${TMP_DIR}"; }
trap cleanup EXIT

echo "Installing ${APP_NAME} for macOS (${RELEASE_ARCH})"
echo "Fetching latest release information..."
RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)"
DOWNLOAD_URL=""

if [ -n "${RELEASE_JSON}" ]; then
  DOWNLOAD_URL="$(printf '%s' "${RELEASE_JSON}" | grep -o 'https://[^"]*\.app\.tar\.gz' | grep -i "${RELEASE_ARCH}" | head -n 1 || true)"
fi

if [ -z "${DOWNLOAD_URL}" ]; then
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${APP_NAME}_${RELEASE_ARCH}.app.tar.gz"
fi

echo "Downloading ${DOWNLOAD_URL}"
curl -fL --progress-bar "${DOWNLOAD_URL}" -o "${TMP_DIR}/app.tar.gz"

echo "Installing to ${APP_TARGET}"
if [ -d "${APP_TARGET}" ]; then
  rm -rf "${APP_TARGET}"
fi
tar -xzf "${TMP_DIR}/app.tar.gz" -C /Applications

echo "Removing Gatekeeper quarantine attributes"
xattr -dr com.apple.quarantine "${APP_TARGET}" 2>/dev/null || true
xattr -cr "${APP_TARGET}" 2>/dev/null || true

echo "${APP_NAME} installed at ${APP_TARGET}"
if [ -t 0 ]; then
  read -r -p "Launch ${APP_NAME} now? [Y/n] " answer || true
  answer="${answer:-Y}"
  if [[ "${answer}" =~ ^[Yy]$ ]]; then
    open "${APP_TARGET}"
  fi
else
  open "${APP_TARGET}" 2>/dev/null || true
fi
