#!/bin/bash
set -euo pipefail

EXTENSION_ID="baohkehfoojhmdhbdacnnknpjbonbmco"
HOST_NAME="com.openinbrave.host"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SCRIPT="$SCRIPT_DIR/native-host/open_in_brave.py"

# Important: the host must NOT live in ~/Documents, ~/Desktop, or ~/Downloads.
# macOS TCC blocks the child native-host process from accessing those folders,
# which makes exec fail and Chrome report "Native host has exited".
HOST_DIR="$HOME/Library/Application Support/OpenInBrave"
HOST_SCRIPT="$HOST_DIR/open_in_brave.py"

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

if [ ! -d "/Applications/Brave Browser.app" ]; then
  echo "Warning: 'Brave Browser.app' is not in /Applications." >&2
  echo "         Make sure the app name is exactly 'Brave Browser'." >&2
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
  "$HOME/Library/Application Support/Chromium/NativeMessagingHosts"
  "$HOME/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"
  "$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts"
  "$HOME/Library/Application Support/Arc/User Data/NativeMessagingHosts"
)

for DIR in "${TARGET_DIRS[@]}"; do
  mkdir -p "$DIR"
  printf '%s\n' "$MANIFEST_JSON" > "$DIR/$HOST_NAME.json"
  echo "Installed: $DIR/$HOST_NAME.json"
done

echo
echo "Host script : $HOST_SCRIPT"
echo "Interpreter : $PYTHON_BIN"
echo
echo "Done. Final steps:"
echo "  1. Reload the extension at chrome://extensions / arc://extensions"
echo "  2. Right-click a link -> 'Open in Brave'"
echo
echo "Extension ID in use: $EXTENSION_ID"
