#!/usr/bin/env python3
import json
import struct
import subprocess
import sys
import time

# Whitelist target -> nama app macOS. Extension hanya boleh memilih dari sini.
TARGET_APPS = {
    "brave": "Brave Browser",
    "arc": "Arc",
}
DEFAULT_TARGET = "brave"
LOG_PATH = "/tmp/openinbrave.log"


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


def main():
    log("host started, argv=%s" % (sys.argv[1:],))
    message = read_message()
    log("message received: %r" % (message,))
    url = (message or {}).get("url")
    target = (message or {}).get("target") or DEFAULT_TARGET

    if not url:
        send_message({"status": "error", "message": "URL not found"})
        return

    app_name = TARGET_APPS.get(target)
    if not app_name:
        send_message({"status": "error", "message": "Unknown target: %s" % target})
        return

    try:
        proc = subprocess.Popen(
            ["open", "-a", app_name, url],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        log("open launched, pid=%s app=%s url=%s" % (proc.pid, app_name, url))
        send_message({"status": "ok"})
    except Exception as exc:
        log("failed to launch open: %s" % exc)
        send_message({"status": "error", "message": str(exc)})


if __name__ == "__main__":
    main()
