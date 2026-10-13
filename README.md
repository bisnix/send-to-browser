# Send to Browser

Open any link — or the page you're on — in **another browser** with one right-click.

<!-- Add a screenshot/GIF of the right-click menu here -->

## What is this?

**Send to Browser** is a small browser extension for people who use more than one browser.
Right-click a link and choose **"Open link in Brave"** (or Arc, Chrome, Edge, …), and the link
opens in that browser right away. No more copying and pasting URLs between browsers.

It works on **macOS** and **Windows**, and you can install it in any Chromium-based browser
(Chrome, Arc, Brave, Edge, Vivaldi, Opera, …).

## Why?

Many people keep two browsers for different things, for example Arc for work and Brave for
personal browsing, or Chrome for one Google account and Edge for another. Moving a link from
one to the other usually means copy → switch app → paste. This extension makes it one click.

## Features

- **Right-click a link** → *Open link in Brave*
- **Right-click the page** → *Open this tab in Brave*
- **Click the toolbar icon** → open the current tab in your default target browser
- **Zero setup:** the extension detects which browser you're in and picks the other one
  automatically. Inside Brave it opens Arc; in any other browser it opens Brave. If that browser
  isn't installed, it uses the next one you do have.
- **More than two browsers?** Pick several in *Settings*. The right-click item then becomes a
  submenu (*Open link in ▸ Brave / Edge / Chrome*). With only one target it stays a single item.
- **Private:** everything happens on your computer. No accounts, no tracking, no network calls.

### Supported browsers

| Open links **in** (target) | macOS | Windows |
|---|:-:|:-:|
| Brave, Chrome, Edge, Vivaldi, Opera, Chromium, Firefox | ✅ | ✅ |
| Arc | ✅ | ⚠️ best effort |
| Safari | ✅ | — |

The extension itself runs in Chromium-based browsers (Chrome, Arc, Brave, Edge, Vivaldi, …).
Firefox and Safari can be *targets* but can't run the extension.

## Installation

Installation has **two parts**:

1. **A small helper app.** Browsers don't allow extensions to open other apps by themselves, so a
   tiny helper (a Python script) does the opening. The installer puts it in your user folder
   and registers it with your browsers. No admin rights needed, and nothing changes system-wide.
2. **The extension** itself, loaded into your browser(s).

### Step 0 — Download

Download this repository: **Code → Download ZIP** on GitHub, then unzip it. Or clone it:

```bash
git clone https://github.com/bisnix/send-to-browser.git
```

Keep the folder somewhere permanent (e.g. `~/Apps/send-to-browser`). The browser loads the
extension from this folder, so don't delete it afterwards.

### macOS

1. **Make sure Python 3 is installed.** Open *Terminal* and run `python3 --version`.
   If macOS asks to install the *Command Line Developer Tools*, click **Install** and wait, or
   install Python from [python.org](https://www.python.org/downloads/).
2. **Install the helper.** In Terminal, go to the downloaded folder and run:
   ```bash
   ./install.sh
   ```
   It ends by listing the browsers it found, e.g. `Browsers found: Brave, Arc, Chrome`.
3. **Load the extension** in each browser you want to use it in:
   - Open `chrome://extensions` (Arc: `arc://extensions`, Brave: `brave://extensions`,
     Edge: `edge://extensions`)
   - Turn on **Developer mode** (top-right toggle)
   - Click **Load unpacked** and select the downloaded folder
4. **Try it:** right-click any link → **Open link in …**

### Windows

1. **Install Python 3** from [python.org](https://www.python.org/downloads/). On the first
   installer screen, tick **"Add python.exe to PATH"**.
2. **Install the helper.** Open the downloaded folder, click the address bar, type
   `powershell`, press Enter, then run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```
3. **Load the extension** in each browser: open `chrome://extensions` (or `edge://extensions`,
   `brave://extensions`) → turn on **Developer mode** → **Load unpacked** → select the folder.
4. **Try it:** right-click any link → **Open link in …**

## Usage

| Action | Result |
|---|---|
| Right-click a link → *Open link in X* | Opens that link in X |
| Right-click empty space on a page → *Open this tab in X* | Opens the current page in X |
| Click the extension's toolbar icon | Opens the current page in your default target |

The toolbar badge briefly shows **OK** on success. If something goes wrong it shows **ERR**
and opens a page with the error message (see [Troubleshooting](#troubleshooting)).

### Settings (optional)

Right-click the extension icon → **Options**:

- **Automatic** *(default)*: one target picked for you. Simple right-click item.
- **Choose browsers**: tick the browsers you want and pick a **default**. With 2 or more
  ticked, the right-click item becomes a submenu. The toolbar icon always uses the default.

Settings are saved separately in each browser, so you can choose "Arc" inside Brave and
"Brave" inside Arc. Untick everything to go back to Automatic.

## Updating

Download the new version into the **same folder**, re-run the installer (`./install.sh` or
`install.ps1`), then click **Reload** on the extension in `chrome://extensions`.

## Uninstalling

1. Remove the extension in `chrome://extensions` (in each browser).
2. Remove the helper:
   - **macOS:**
     ```bash
     rm -rf ~/Library/Application\ Support/OpenInBrowser
     find ~/Library/Application\ Support -name com.openinbrowser.host.json -path '*NativeMessagingHosts*' -delete
     ```
   - **Windows:**
     ```powershell
     powershell -ExecutionPolicy Bypass -File .\install.ps1 -Uninstall
     ```

---

# Developer documentation

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

## Setup notes

- Pinned extension ID: `baohkehfoojhmdhbdacnnknpjbonbmco` (from the public `"key"` in
  `manifest.json`). You do **not** need any credential file for normal setup.
- macOS: `install.sh` copies the host out of the repo folder because macOS TCC blocks the
  browser-launched host from running inside `~/Documents`, `~/Desktop` or `~/Downloads`.
- Debug log: `/tmp/openinbrowser.log` (macOS), `%TEMP%\openinbrowser.log` (Windows).
- Windows: per-user only (HKCU + `%LOCALAPPDATA%`). The host only accepts URLs that start with a
  scheme (`https:`, `file:` …), so a crafted URL can never be passed to the browser as a `--switch`.

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

When something fails, the toolbar shows **ERR** and an error page opens with the exact message.
Find it below.

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
