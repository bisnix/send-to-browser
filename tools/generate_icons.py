#!/usr/bin/env python3
"""Generate the "Open in Browser" extension icons (no external dependencies).

Run from the repo root:  python3 tools/generate_icons.py
Outputs PNG files into icons/.
"""
import os
import struct
import zlib

SS = 4  # supersampling factor
SIZES = [16, 32, 48, 128]

BG_TOP = (0xFF, 0x8A, 0x3D)
BG_BOTTOM = (0xF0, 0x4A, 0x1E)
FG = (0xFF, 0xFF, 0xFF)

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def inside_rounded_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= r * r


def dist2_to_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    length2 = vx * vx + vy * vy
    t = 0.0 if length2 == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / length2))
    dx = px - (ax + t * vx)
    dy = py - (ay + t * vy)
    return dx * dx + dy * dy


def inside_triangle(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])

    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


def render(size):
    n = size * SS
    samples = [[(0.0, 0.0, 0.0, 0.0) for _ in range(n)] for _ in range(n)]

    def u(v):
        return v * n

    # Background rounded square.
    bg = (u(0.02), u(0.02), u(0.98), u(0.98), u(0.22))

    # Browser window outline (lower-left).
    box_outer = (u(0.13), u(0.38), u(0.61), u(0.86), u(0.09))
    box_stroke = u(0.085)
    box_inner = (
        box_outer[0] + box_stroke,
        box_outer[1] + box_stroke,
        box_outer[2] - box_stroke,
        box_outer[3] - box_stroke,
        max(0.0, box_outer[4] - box_stroke),
    )

    # Arrow: shaft + head pointing to the upper-right.
    shaft_a = (u(0.42), u(0.58))
    shaft_b = (u(0.7586), u(0.2414))
    shaft_r2 = (u(0.042)) ** 2
    head = [(u(0.90), u(0.10)), (u(0.8435), u(0.3263)), (u(0.6737), u(0.1565))]

    for py in range(n):
        for px in range(n):
            x = px + 0.5
            y = py + 0.5

            if not inside_rounded_rect(x, y, *bg):
                continue

            t = (y - bg[1]) / (bg[3] - bg[1])
            t = max(0.0, min(1.0, t))
            r = (BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t) / 255.0
            g = (BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t) / 255.0
            b = (BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t) / 255.0

            in_box = inside_rounded_rect(x, y, *box_outer) and not inside_rounded_rect(x, y, *box_inner)
            in_shaft = dist2_to_segment(x, y, *shaft_a, *shaft_b) <= shaft_r2
            in_head = inside_triangle(x, y, *head)

            if in_box or in_shaft or in_head:
                r, g, b = FG[0] / 255.0, FG[1] / 255.0, FG[2] / 255.0

            samples[py][px] = (r, g, b, 1.0)

    # Box-downsample (premultiplied) to the target size.
    rows = []
    for oy in range(size):
        row = bytearray()
        for ox in range(size):
            pr = pg = pb = pa = 0.0
            for dy in range(SS):
                for dx in range(SS):
                    r, g, b, a = samples[oy * SS + dy][ox * SS + dx]
                    pr += r * a
                    pg += g * a
                    pb += b * a
                    pa += a
            count = SS * SS
            alpha = pa / count
            if pa > 0:
                pr, pg, pb = pr / pa, pg / pa, pb / pa
            row += bytes(
                (
                    int(round(pr * 255)),
                    int(round(pg * 255)),
                    int(round(pb * 255)),
                    int(round(alpha * 255)),
                )
            )
        rows.append(bytes(row))
    return rows


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open(path, "wb") as handle:
        handle.write(png)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        path = os.path.join(OUT_DIR, "icon%d.png" % size)
        write_png(path, size, render(size))
        print("wrote", path)


if __name__ == "__main__":
    main()
