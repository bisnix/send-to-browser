#!/bin/bash
set -euo pipefail

EXTENSION_ID="baohkehfoojhmdhbdacnnknpjbonbmco"
HOST_NAME="com.openinbrowser.host"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SCRIPT="$SCRIPT_DIR/native-host/open_in_browser.py"

# Important: the host must NOT live in ~/Documents, ~/Desktop, or ~/Downloads.
# macOS TCC blocks the child native-host process from accessing those folders,
# which makes exec fail and Chrome report "Native host has exited".
HOST_DIR="$HOME/Library/Application Support/OpenInBrowser"
HOST_SCRIPT="$HOST_DIR/open_in_browser.py"

PYTHON_BIN="$(command -v python3 || true)"
if [ -z "$PYTHON_BIN" ] && [ -x /usr/bin/python3 ]; then
  PYTHON_BIN="/usr/bin/python3"
fi

if [ -z "$PYTHON_BIN" ]; then
  echo "Error: python3 not found. Install it first (e.g. 'brew install python')." >&2
  exit 1
fi

if [ ! -f "$SOURCE_SCRIPT" ]; then
  echo "Error: $SOURCE_SCRIPT not found." >&2
  exit 1
fi

mkdir -p "$HOST_DIR"
cp "$SOURCE_SCRIPT" "$HOST_SCRIPT"
chmod +x "$HOST_SCRIPT"

# Use an absolute interpreter path so it does not depend on the browser's PATH.
/usr/bin/sed -i '' "1s|.*|#!$PYTHON_BIN|" "$HOST_SCRIPT"

MANIFEST_JSON=$(cat <<EOF
{
  "name": "$HOST_NAME",
  "description": "Opens links in Brave Browser",
  "path": "$HOST_SCRIPT",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
)

TARGET_DIRS=(
  "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome Beta/NativeMessagingHosts"
  "$HOME/Library/Application Support/Google/Chrome Canary/NativeMessagingHosts"
  "$HOME/Library/Application Support/Vivaldi/NativeMessagingHosts"
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
  "$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts"
)

# Bersihkan instalasi lama (nama sebelum mendukung banyak browser).
LEGACY_HOST_NAME="com.openinbrave.host"
rm -rf "$HOME/Library/Application Support/OpenInBrave"

for DIR in "${TARGET_DIRS[@]}"; do
  rm -f "$DIR/$LEGACY_HOST_NAME.json"
  mkdir -p "$DIR"
  printf '%s\n' "$MANIFEST_JSON" > "$DIR/$HOST_NAME.json"
  echo "Installed: $DIR/$HOST_NAME.json"
done

echo
echo "Host script : $HOST_SCRIPT"
echo "Interpreter : $PYTHON_BIN"
# Tampilkan browser yang terdeteksi (sama dengan yang dilihat extension).
DETECTED=$(printf '\x11\x00\x00\x00{"action":"list"}' | "$HOST_SCRIPT" 2>/dev/null | tail -c +5 \
  | "$PYTHON_BIN" -c 'import json,sys; print(", ".join(b["label"] for b in json.load(sys.stdin)["browsers"]))' 2>/dev/null || true)
echo
echo "Browsers found: ${DETECTED:-(none detected)}"
echo
echo "Done. Final steps:"
echo "  1. Reload the extension at chrome://extensions / arc://extensions"
echo "  2. Right-click a link -> 'Open link in <browser>' (works right away)"
echo "  3. Optional: extension Options to add more browsers (2+ = submenu)"
echo
echo "Extension ID in use: $EXTENSION_ID"
