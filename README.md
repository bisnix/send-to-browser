# Open in Browser

Chromium extension (Manifest V3) + small Python helper that opens a link or the current tab
in **another browser** — Brave, Arc, Chrome, Edge, Vivaldi, Opera, Chromium, Firefox or Safari.
Works on **macOS** and **Windows**.

- Right-click a link → **Open link in Brave**
- Right-click page background → **Open this tab in Brave**
- Click the toolbar icon → opens the active tab in the default browser

**Zero config by default.** The extension detects which browser it is running in and picks
one target automatically: inside Brave → **Arc**, anywhere else → **Brave**. If that browser
isn't installed it falls back to the next installed one (Arc, Chrome, Edge, …). One target
means a plain right-click item, no submenu.

**Optional — more browsers.** Extension *Options* → **Choose browsers**: tick any installed
browsers and pick a default. With 2+ targets the menu becomes a submenu
(`Open link in ▸ Brave / Edge / …`); the toolbar button always uses the default. Settings are
per browser (each browser has its own copy of the extension). Unticking everything returns to
Automatic.

## How it works

```
Extension (background.js) --native messaging--> com.openinbrowser.host (Python)
    { "action": "list" }                    --> installed browsers + calling browser
    { "url": "https://...", "target": "<id>" }
        macOS   -->  `open -a "<App Name>" <url>`
        Windows -->  `<path>\<browser>.exe <url>`   (no shell)
```

| File | Role |
|---|---|
| `manifest.json` | Extension manifest. The `"key"` field pins a stable extension ID (see below). |
| `background.js` | Detects the current browser, builds the context menu (flat for 1 target, submenu for 2+), toolbar click, `sendNativeMessage` to the host. |
| `options.html` / `options.js` | Settings: Automatic (default) or Choose browsers + default. Stored in `chrome.storage.local`. |
| `native-host/open_in_browser.py` | Native host (macOS + Windows): reads one length-prefixed JSON message from stdin, opens the URL in the target browser, replies `{ "status": "ok" }`. |
| `native-host/open_in_browser.bat` | Windows wrapper (Chrome on Windows needs an executable as the host `path`). `install.ps1` writes a copy with an absolute Python path. |
| `native-host/com.openinbrowser.host.json` | Template native-host manifest with a `__HOST_PATH__` placeholder. The real one is generated per-machine by `install.sh` / `install.ps1`. |
| `install.sh` | macOS: installs the host script + host manifests for Chrome (+Beta, Canary), Chromium, Brave, Edge, Arc, Vivaldi, then prints the browsers it found. |
| `install.ps1` | Windows: installs the host into `%LOCALAPPDATA%\OpenInBrowser` and registers it under HKCU for Chrome, Chromium, Brave, Edge. `-Uninstall` removes it. |
| `tools/generate_icons.py` | Regenerates `icons/` (no dependencies). |
| `error.html` / `error.js` | Error page shown when the host call fails. |

Pinned extension ID: `baohkehfoojhmdhbdacnnknpjbonbmco`

## Prerequisites

### macOS

- macOS with at least one *other* browser to open links in. Browsers are found in `/Applications` or `~/Applications` by their standard app name (see `BROWSERS` in `native-host/open_in_browser.py`).
- `python3` on PATH.
- A Chromium browser to load the extension unpacked (Chrome / Arc / Brave / Edge).

### Windows

- Windows 10/11 with at least one other browser installed (found via the `App Paths\<exe>` registry key or the usual install folders).
- **Python 3** from python.org (tick *Add python.exe to PATH*) or the `py` launcher. The Microsoft Store `python.exe` stub is not enough — the installer actually runs the interpreter to check.
- Arc for Windows is detected on a best-effort basis — see the Arc note under Troubleshooting.

## Setup (fresh clone — normal case)

### macOS

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

# 3. Test: right-click any link → "Open link in <browser>",
#    or right-click page background → "Open this tab in <browser>".
#    Optional: extension Options to add more browsers.
#    The toolbar badge shows OK on success, ERR + error page on failure.
```

Debug log: the host appends to `/tmp/openinbrowser.log`.

### Windows

```powershell
# 1. Install the native host (copies the host to %LOCALAPPDATA%\OpenInBrowser, writes
#    com.openinbrowser.host.json there, and registers it under
#    HKCU\Software\{Google\Chrome, Chromium, BraveSoftware\Brave-Browser, Microsoft\Edge}\NativeMessagingHosts)
powershell -ExecutionPolicy Bypass -File .\install.ps1

# 2. Load the extension unpacked: chrome://extensions (edge://, brave://) → Developer mode
#    → Load unpacked → select this folder. ID must be baohkehfoojhmdhbdacnnknpjbonbmco.

# 3. Test as on macOS. To remove the host later:
powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
```

No admin rights needed (per-user only). Debug log: `%TEMP%\openinbrowser.log`.
On Windows the host only accepts URLs that start with a scheme (`https:`, `file:` …) so a
crafted URL can never be passed to the browser as a `--switch`.

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

### macOS

| Symptom | Cause / fix |
|---|---|
| `Native host has exited` | Host script lives under `~/Documents`/`~/Desktop`/`~/Downloads` (macOS TCC). Re-run `./install.sh`, which copies it to `~/Library/Application Support/OpenInBrowser/`. |
| `Native host did not respond within 4000 ms` | Host manifest missing for that browser profile. Re-run `./install.sh`; check `/tmp/openinbrowser.log`. |
| `sendNativeMessage failed: ...` | Extension ID mismatch: `chrome://extensions` ID must equal `EXTENSION_ID` in `install.sh` and the `allowed_origins` in the installed `com.openinbrowser.host.json`. Reload the unpacked extension. |
| `Could not determine the current tab URL` | `chrome://` / `edge://` / Web Store pages can't be read by extensions. Normal limitation. |
| Badge `ERR` + error page | Open the error page / service-worker console for the exact message. |
| Menu shows the wrong browser / Options says "Helper app not installed" | Re-run `./install.sh`, then reload the extension (or just open its Options page — that re-detects and rebuilds the menu). |

### Windows

| Symptom | Cause / fix |
|---|---|
| `Specified native messaging host not found` | Registry key missing for that browser. Re-run `install.ps1`; check `reg query "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.openinbrowser.host"` (or the Brave/Edge/Chromium equivalent) points at `%LOCALAPPDATA%\OpenInBrowser\com.openinbrowser.host.json`. |
| `Native host has exited` / `Error when communicating with the native messaging host` | Python failed to start. Open `%LOCALAPPDATA%\OpenInBrowser\open_in_browser.bat` and check the interpreter path still exists (e.g. after upgrading Python); re-run `install.ps1`. |
| Host returned `<Browser> is not installed` | Browser not in the usual locations. Add its full path to `BROWSERS["<id>"]["paths"]` in `open_in_browser.py` and re-run `install.ps1`. |
| Host returned `Arc is not installed` | Arc for Windows ships as an MSIX package whose exe is not directly launchable. The host tries `App Paths\Arc.exe` and `%LOCALAPPDATA%\Microsoft\WindowsApps\Arc.exe`; if neither exists, add the right path to `BROWSERS["arc"]["paths"]`. **Unverified on real hardware.** |
| Extension doesn't work *inside* Arc on Windows | Arc's NativeMessagingHosts registry key is unconfirmed, so `install.ps1` doesn't register Arc. |
| `install.ps1` "running scripts is disabled" | Run it via `powershell -ExecutionPolicy Bypass -File .\install.ps1` as shown. |

## For AI agents

- **Source of truth for IDs:** `manifest.json` → `"key"` (public key) determines the extension ID; `install.sh` → `EXTENSION_ID` must match the ID shown at `chrome://extensions` after loading unpacked.
- **Verify ID derivation:** `python3 -c` snippet in "Rotating" section above; expected `baohkehfoojhmdhbdacnnknpjbonbmco` for the committed key.
- **Never commit:** `*.pem`, `*.key`, `*.p12`, `.env*`, `*credentials*.json`, `*secrets*.json` (see `.gitignore`). Never print the `.pem` contents into logs/PRs.
- **Native protocol:** 4-byte little-endian length prefix + UTF-8 JSON. Requests: `{ "action": "list" }` → `{ "status": "ok", "browsers": [{id,label}], "current": id|null }` (`current` = calling browser from the parent process on macOS, `null` on Windows); `{ "url": "...", "target": "<id>" }` (id whitelisted in `BROWSERS`, defaults to `brave`) → `{ "status": "ok" }` or `{ "status": "error", "message": "..." }`.
- **Host install locations (macOS):** `install.sh` writes `com.openinbrowser.host.json` into each browser's `NativeMessagingHosts` dir and copies the runnable host to `$HOME/Library/Application Support/OpenInBrowser/open_in_browser.py` with an absolute-python shebang.
- **Host install locations (Windows):** `install.ps1` copies `open_in_browser.py` + a generated `open_in_browser.bat` (absolute python path) and `com.openinbrowser.host.json` into `%LOCALAPPDATA%\OpenInBrowser`, and sets the default value of `HKCU\Software\<vendor>\NativeMessagingHosts\com.openinbrowser.host` to the manifest path.
- **Adding a browser:** add an entry to `BROWSERS` in the host (`label`, macOS app name, Windows exe + paths) and to `KNOWN_BROWSERS`/`AUTO_ORDER` in `background.js` and `KNOWN_LABELS` in `options.js`.
- **Platform split in the host:** `BROWSERS` is the single whitelist (macOS app name + Windows exe/paths per id). Windows launches the exe directly via `subprocess.Popen([exe, url])` (no shell), detached and breaking away from Chrome's job object when allowed.
- **Validate changes:** `python3 -c "import json; json.load(open('manifest.json'))"` and `node --check background.js`; then reload unpacked + right-click test.
