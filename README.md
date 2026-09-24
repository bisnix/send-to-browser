# Open in Brave

Chrome/Arc/Brave/Edge extension (Manifest V3) + Python native host to open links or the
current tab in the **Brave** browser via right-click menu or toolbar button.

- Right-click a link → **Open link in Brave**
- Right-click page background → **Open this tab in Brave**
- Click the toolbar icon → opens the active tab in Brave

## How it works

```
Extension (background.js) --native messaging--> com.openinbrave.host (Python)
    { "url": "https://..." }  -->  { "status": "ok" }  -->  `open -a "Brave Browser" <url>`
```

| File | Role |
|---|---|
| `manifest.json` | Extension manifest. The `"key"` field pins a stable extension ID (see below). |
| `background.js` | Context menus (`link`, `page`), toolbar click, `sendNativeMessage` to the host. |
| `native-host/open_in_brave.py` | Native host: reads one length-prefixed JSON message from stdin, opens the URL in Brave, replies `{ "status": "ok" }`. |
| `native-host/com.openinbrave.host.json` | Example native-host manifest (generated per-machine by `install.sh`; the copy in repo is only an example). |
| `install.sh` | Installs the host script + host manifests for Chrome, Chrome Beta, Chromium, Brave, Edge, Arc. |
| `tools/generate_icons.py` | Regenerates `icons/` (no dependencies). |
| `error.html` / `error.js` | Error page shown when the host call fails. |

Pinned extension ID: `baohkehfoojhmdhbdacnnknpjbonbmco`

## Prerequisites

- macOS with **Brave Browser** installed in `/Applications` (exactly `Brave Browser.app`).
- `python3` on PATH.
- A Chromium browser to load the extension unpacked (Chrome / Arc / Brave / Edge).
- Brave Browser installed at `/Applications/Brave Browser.app` (name must match exactly; edit `BRAVE_APP_NAME` in `native-host/open_in_brave.py` otherwise).

## Setup (fresh clone — normal case)

> You do **NOT** need any credential file for normal setup. The public `"key"` in
> `manifest.json` is already committed and keeps the extension ID stable.

```bash
# 1. Install the native host (copies the .py out of ~/Documents — macOS TCC
#    blocks execution from Documents/Desktop/Downloads — and writes the
#    NativeMessagingHosts manifests for all supported browsers)
./install.sh

# 2. Load the extension unpacked in your Chromium browser:
#    chrome://extensions (or arc://extensions) → Developer mode → Load unpacked
#    → select this folder.
#    Confirm the extension ID reads: baohkehfoojhmdhbdacnnknpjbonbmco

# 3. Test: right-click any link → "Open link in Brave",
#    or right-click page background → "Open this tab in Brave".
#    The toolbar badge shows OK on success, ERR + error page on failure.
```

Debug log: the host appends to `/tmp/openinbrave.log`.

## Credential / git-ignored files

| Path (NOT in repo) | What it is | Do you need it? |
|---|---|---|
| `native-host/extension-key.pem` | RSA **private** key whose public half is the `"key"` in `manifest.json`. Kept local-only via `.gitignore` (`*.pem`). | **No**, for normal setup/cloning. Only needed if you want to re-derive or rotate the pinned extension ID. |
| `native-host/__pycache__/`, `*.pyc` | Python bytecode. | No, regenerated automatically. |
| `.env*`, `credentials*.json`, `secrets*.json` | Generic secret patterns, pre-emptively ignored. | No. |

If someone gains your `.pem`, they can forge an extension with the **same ID** that
your installed native host will trust (`allowed_origins`), so keep it private
(backup outside the repo, e.g. password manager).

## Rotating / regenerating the keypair (only if the `.pem` is lost or you want a new ID)

Losing the `.pem` does **not** break existing installs — but you can no longer prove
ownership of the pinned ID, so generate a new pair and update 3 places:

```bash
# 1. Generate a new private key (keep it OUT of the repo)
openssl genrsa -out /tmp/extension-key.pem 2048

# 2. Extract the public key in the format manifest.json expects (base64 DER SPKI)
openssl rsa -in /tmp/extension-key.pem -pubout -outform DER | base64 | tr -d '\n'
# → paste the output as the "key" value in manifest.json

# 3. Derive the new extension ID from that public key
python3 -c "
import hashlib, base64
key = base64.b64decode('<paste-public-key-here>')
h = hashlib.sha256(key).digest()[:16]
print(''.join(chr((b>>4)+97)+chr((b&15)+97) for b in h))
"
# 4. Update EXTENSION_ID in install.sh with the new ID,
#    then re-run ./install.sh and reload the extension.
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Native host has exited` | Host script lives under `~/Documents`/`~/Desktop`/`~/Downloads` (macOS TCC). Re-run `./install.sh`, which copies it to `~/Library/Application Support/OpenInBrave/`. |
| `Native host did not respond within 4000 ms` | Host manifest missing for that browser profile. Re-run `./install.sh`; check `/tmp/openinbrave.log`. |
| `sendNativeMessage failed: ...` | Extension ID mismatch: `chrome://extensions` ID must equal `EXTENSION_ID` in `install.sh` and the `allowed_origins` in the installed `com.openinbrave.host.json`. Reload the unpacked extension. |
| `Could not determine the current tab URL` | `chrome://` / `edge://` / Web Store pages can't be read by extensions. Normal limitation. |
| Badge `ERR` + error page | Open the error page / service-worker console for the exact message. |

## For AI agents

- **Source of truth for IDs:** `manifest.json` → `"key"` (public key) determines the extension ID; `install.sh` → `EXTENSION_ID` must match the ID shown at `chrome://extensions` after loading unpacked.
- **Verify ID derivation:** `python3 -c` snippet in "Rotating" section above; expected `baohkehfoojhmdhbdacnnknpjbonbmco` for the committed key.
- **Never commit:** `*.pem`, `*.key`, `*.p12`, `.env*`, `*credentials*.json`, `*secrets*.json` (see `.gitignore`). Never print the `.pem` contents into logs/PRs.
- **Native protocol:** 4-byte little-endian length prefix + UTF-8 JSON. Request `{ "url": "<http(s)://...>" }`, response `{ "status": "ok" }` or `{ "status": "error", "message": "..." }`.
- **Host install locations:** `install.sh` writes `com.openinbrave.host.json` into each browser's `NativeMessagingHosts` dir and copies the runnable host to `$HOME/Library/Application Support/OpenInBrave/open_in_brave.py` with an absolute-python shebang.
- **Validate changes:** `python3 -c "import json; json.load(open('manifest.json'))"` and `node --check background.js`; then reload unpacked + right-click test.
