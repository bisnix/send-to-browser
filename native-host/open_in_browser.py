#!/usr/bin/env python3
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import time

IS_WINDOWS = sys.platform == "win32"

# Whitelist browser tujuan. Extension hanya boleh memilih id dari sini.
#   mac  : nama app macOS untuk `open -a` (juga dipakai cek terpasang)
#   exe  : nama exe Windows (dicari lewat App Paths)
#   paths: lokasi install umum di Windows
BROWSERS = {
    "brave": {
        "label": "Brave",
        "mac": "Brave Browser",
        "exe": "brave.exe",
        "paths": [
            r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"%PROGRAMFILES%\BraveSoftware\Brave-Browser\Application\brave.exe",
            r"%PROGRAMFILES(X86)%\BraveSoftware\Brave-Browser\Application\brave.exe",
        ],
    },
    "arc": {
        "label": "Arc",
        "mac": "Arc",
        "exe": "Arc.exe",
        "paths": [
            # App execution alias (Arc for Windows is an MSIX package).
            r"%LOCALAPPDATA%\Microsoft\WindowsApps\Arc.exe",
            r"%LOCALAPPDATA%\Arc\Arc.exe",
        ],
    },
    "chrome": {
        "label": "Chrome",
        "mac": "Google Chrome",
        "exe": "chrome.exe",
        "paths": [
            r"%PROGRAMFILES%\Google\Chrome\Application\chrome.exe",
            r"%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe",
            r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe",
        ],
    },
    "edge": {
        "label": "Edge",
        "mac": "Microsoft Edge",
        "exe": "msedge.exe",
        "paths": [
            r"%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe",
            r"%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe",
        ],
    },
    "vivaldi": {
        "label": "Vivaldi",
        "mac": "Vivaldi",
        "exe": "vivaldi.exe",
        "paths": [
            r"%LOCALAPPDATA%\Vivaldi\Application\vivaldi.exe",
            r"%PROGRAMFILES%\Vivaldi\Application\vivaldi.exe",
        ],
    },
    "opera": {
        "label": "Opera",
        "mac": "Opera",
        "exe": "opera.exe",
        "paths": [
            r"%LOCALAPPDATA%\Programs\Opera\opera.exe",
        ],
    },
    "chromium": {
        "label": "Chromium",
        "mac": "Chromium",
        "exe": "chrome.exe",
        "paths": [
            r"%LOCALAPPDATA%\Chromium\Application\chrome.exe",
        ],
    },
    "firefox": {
        "label": "Firefox",
        "mac": "Firefox",
        "exe": "firefox.exe",
        "paths": [
            r"%PROGRAMFILES%\Mozilla Firefox\firefox.exe",
            r"%PROGRAMFILES(X86)%\Mozilla Firefox\firefox.exe",
        ],
    },
    "safari": {
        "label": "Safari",
        "mac": "Safari",
        "exe": None,
        "paths": [],
    },
}
DEFAULT_TARGET = "brave"

MAC_APP_DIRS = [
    "/Applications",
    os.path.expanduser("~/Applications"),
    "/System/Applications",
    "/System/Volumes/Preboot/Cryptexes/App/System/Applications",
]

if IS_WINDOWS:
    LOG_PATH = os.path.join(tempfile.gettempdir(), "openinbrowser.log")
else:
    LOG_PATH = "/tmp/openinbrowser.log"

# URL harus diawali scheme (mis. https:) supaya tidak bisa jadi switch "--..."
# saat dipassing sebagai argumen ke exe browser di Windows.
URL_SCHEME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*:")


def log(text):
    try:
        with open(LOG_PATH, "a") as handle:
            handle.write("%s %s\n" % (time.strftime("%H:%M:%S"), text))
    except Exception:
        pass


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) < 4:
        return None
    length = struct.unpack("<I", raw_length)[0]
    data = sys.stdin.buffer.read(length)
    return json.loads(data.decode("utf-8"))


def send_message(message):
    data = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def windows_app_path(exe_name):
    """Read HKCU/HKLM ...\\App Paths\\<exe> (default value), or None."""
    import winreg

    subkey = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths" + "\\" + exe_name
    for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for view in (winreg.KEY_WOW64_64KEY, winreg.KEY_WOW64_32KEY):
            try:
                with winreg.OpenKey(root, subkey, 0, winreg.KEY_READ | view) as key:
                    value, _ = winreg.QueryValueEx(key, "")
            except OSError:
                continue
            value = os.path.expandvars(str(value)).strip('"')
            if value and os.path.isfile(value):
                return value
    return None


def find_windows_exe(target):
    spec = BROWSERS[target]
    if not spec["exe"]:
        return None
    found = windows_app_path(spec["exe"])
    if found:
        return found
    for raw in spec["paths"]:
        path = os.path.expandvars(raw)
        # Env var yang tidak ter-set tetap berbentuk %VAR%; lewati.
        if "%" not in path and os.path.isfile(path):
            return path
    return None


def launch_windows(target, url):
    exe = find_windows_exe(target)
    if not exe:
        raise RuntimeError("%s is not installed" % BROWSERS[target]["label"])

    # Lepas dari console & job object Chrome supaya browser tidak ikut mati
    # saat host keluar. Breakaway bisa ditolak job-nya, jadi ada fallback.
    base_flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
    for flags in (base_flags | subprocess.CREATE_BREAKAWAY_FROM_JOB, base_flags):
        try:
            return subprocess.Popen(
                [exe, url],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=flags,
                close_fds=True,
            ), exe
        except OSError as exc:
            log("launch with flags=%#x failed: %s" % (flags, exc))
            last_exc = exc
    raise last_exc


def launch_macos(app_name, url):
    return subprocess.Popen(
        ["open", "-a", app_name, url],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    ), app_name


def mac_app_installed(app_name):
    return any(
        os.path.isdir(os.path.join(d, app_name + ".app")) for d in MAC_APP_DIRS
    )


def installed_browsers():
    found = []
    for browser_id, spec in BROWSERS.items():
        if IS_WINDOWS:
            ok = find_windows_exe(browser_id) is not None
        else:
            ok = mac_app_installed(spec["mac"])
        if ok:
            found.append({"id": browser_id, "label": spec["label"]})
    return found


def detect_caller():
    """Browser yang menjalankan host ini (proses induk), atau None.

    macOS: proses induk host adalah proses utama browser, mis.
    /Applications/Arc.app/Contents/MacOS/Arc. Di Windows host dijalankan
    lewat cmd.exe (.bat), jadi extension memakai deteksi sendiri.
    """
    if IS_WINDOWS:
        return None
    try:
        out = subprocess.run(
            ["ps", "-o", "comm=", "-p", str(os.getppid())],
            capture_output=True, text=True, timeout=2,
        ).stdout.strip()
    except Exception as exc:
        log("detect_caller failed: %s" % exc)
        return None
    match = re.search(r"/([^/]+)\.app/", out)
    if not match:
        return None
    bundle = match.group(1)
    for browser_id, spec in BROWSERS.items():
        if spec["mac"] == bundle:
            return browser_id
    return None


def handle_list():
    send_message({
        "status": "ok",
        "browsers": installed_browsers(),
        "current": detect_caller(),
    })


def main():
    log("host started, platform=%s argv=%s" % (sys.platform, sys.argv[1:]))
    message = read_message()
    log("message received: %r" % (message,))
    if (message or {}).get("action") == "list":
        handle_list()
        return

    url = (message or {}).get("url")
    target = (message or {}).get("target") or DEFAULT_TARGET

    if not url:
        send_message({"status": "error", "message": "URL not found"})
        return

    spec = BROWSERS.get(target)
    if not spec:
        send_message({"status": "error", "message": "Unknown target: %s" % target})
        return

    if IS_WINDOWS and not URL_SCHEME_RE.match(url):
        send_message({"status": "error", "message": "Invalid URL: %s" % url})
        return

    try:
        if IS_WINDOWS:
            proc, launched = launch_windows(target, url)
        else:
            proc, launched = launch_macos(spec["mac"], url)
        log("launched, pid=%s app=%s url=%s" % (proc.pid, launched, url))
        send_message({"status": "ok"})
    except Exception as exc:
        log("failed to launch: %s" % exc)
        send_message({"status": "error", "message": str(exc)})


if __name__ == "__main__":
    main()
