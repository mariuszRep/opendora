#!/usr/bin/env bash
# Projectflows installer for Linux and macOS
# Usage: curl -fsSL https://raw.githubusercontent.com/mariuszRep/opendora/main/scripts/install.sh | bash
set -euo pipefail

VERSION="${PROJECTFLOWS_VERSION:-latest}"
INSTALL_DIR="${PROJECTFLOWS_INSTALL_DIR:-$HOME/.local/bin}"
DATA_DIR="${PROJECTFLOWS_DATA_DIR:-$HOME/.local/share/projectflows}"

# Detect OS and architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac

case "$OS" in
  linux|darwin) ;;
  *) echo "Unsupported OS: $OS" >&2; exit 1 ;;
esac

BIN_NAME="projectflows-${OS}-${ARCH}"
if [ "$VERSION" = "latest" ]; then
  BASE_URL="https://github.com/mariuszRep/opendora/releases/latest/download"
else
  BASE_URL="https://github.com/mariuszRep/opendora/releases/download/${VERSION}"
fi

echo "Installing Projectflows ${VERSION} for ${OS}/${ARCH}..."

# Create directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$DATA_DIR"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Download binary
echo "  Downloading binary..."
curl -fsSL "${BASE_URL}/${BIN_NAME}" -o "${TMP}/projectflows"
chmod +x "${TMP}/projectflows"

# Download and extract web assets
echo "  Downloading web assets..."
curl -fsSL "${BASE_URL}/web.tar.gz" -o "${TMP}/web.tar.gz"
mkdir -p "${DATA_DIR}/web"
tar -xzf "${TMP}/web.tar.gz" -C "${DATA_DIR}/web" --strip-components=1

# Install binary
mv "${TMP}/projectflows" "${INSTALL_DIR}/projectflows"

echo ""
echo "Projectflows installed successfully!"
echo ""
echo "  Binary: ${INSTALL_DIR}/projectflows"
echo "  Web UI: ${DATA_DIR}/web/"
echo ""

# Check PATH
if ! echo "$PATH" | tr ':' '\n' | grep -qxF "$INSTALL_DIR"; then
  echo "Add ${INSTALL_DIR} to your PATH:"
  echo "  export PATH=\"\$PATH:${INSTALL_DIR}\""
  echo ""
fi

echo "To start:"
echo "  PROJECTFLOWS_WEB_DIR=${DATA_DIR}/web projectflows serve"
