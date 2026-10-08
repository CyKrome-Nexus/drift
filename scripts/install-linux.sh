#!/usr/bin/env bash
set -euo pipefail

APP_NAME="Drift"
BINARY_NAME="drift"
REPO="CyKrome-Nexus/Drift-Release"
INSTALL_DIR="${HOME}/.local/share/${APP_NAME}"
APPIMAGE="${INSTALL_DIR}/${APP_NAME}.AppImage"
DESKTOP_FILE="${HOME}/.local/share/applications/${BINARY_NAME}.desktop"
BIN_DIR="${HOME}/.local/bin"

if [ "$(uname -s)" != "Linux" ]; then
  echo "Error: this installer is for Linux only." >&2
  exit 1
fi

case "$(uname -m)" in
  x86_64|amd64) RELEASE_ARCH="amd64" ;;
  aarch64|arm64) RELEASE_ARCH="aarch64" ;;
  *)
    echo "Error: unsupported architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

mkdir -p "${INSTALL_DIR}" "${BIN_DIR}" "$(dirname "${DESKTOP_FILE}")"

echo "Fetching latest release information..."
RELEASE_JSON="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null || true)"
DOWNLOAD_URL=""

if [ -n "${RELEASE_JSON}" ]; then
  DOWNLOAD_URL="$(printf '%s' "${RELEASE_JSON}" | grep -o 'https://[^"]*\.AppImage' | grep -i "${RELEASE_ARCH}" | head -n 1 || true)"
fi

if [ -z "${DOWNLOAD_URL}" ]; then
  DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${APP_NAME}_${RELEASE_ARCH}.AppImage"
fi

echo "Downloading ${DOWNLOAD_URL}"
curl -fL --progress-bar "${DOWNLOAD_URL}" -o "${APPIMAGE}"
chmod +x "${APPIMAGE}"
ln -sf "${APPIMAGE}" "${BIN_DIR}/${BINARY_NAME}"

cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Name=${APP_NAME}
Exec=${APPIMAGE}
Icon=${APP_NAME}
Type=Application
Categories=Utility;
Terminal=false
EOF

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${HOME}/.local/share/applications" >/dev/null 2>&1 || true
fi

echo "${APP_NAME} installed. Run '${BINARY_NAME}' or launch it from your application menu."
