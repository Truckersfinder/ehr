#!/usr/bin/env python3
"""
Knock out edge-connected faux-transparency (checkerboard) to real alpha.

The marketing hero paints cream + grid + soft gold in CSS. This script makes
outer-only pixels transparent so that background shows through (must match
.hero-laptop-wrap in pinpoint-ehr.html).

Requires Pillow:
  python3 -m venv .venv && . .venv/bin/activate && pip install Pillow
  python3 scripts/bake-trans-laptop-cream.py

Input: repo-root transLaptop.png (RGB checkerboard baked in — no alpha).
Output: client/public/trans-laptop.png (RGBA).
"""
from __future__ import annotations

from collections import deque
from pathlib import Path


def is_outer_bg(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    s = r + g + b
    if s < 690:
        return False
    sat = max(r, g, b) - min(r, g, b)
    if sat > 35 and s < 720:
        return False
    return True


def main() -> None:
    try:
        from PIL import Image
    except ImportError as e:
        raise SystemExit("Install Pillow: pip install Pillow") from e

    root = Path(__file__).resolve().parents[1]
    src = root / "transLaptop.png"
    dst = root / "client" / "public" / "trans-laptop.png"
    if not src.is_file():
        raise SystemExit(f"Missing {src}")

    base = Image.open(src).convert("RGBA")
    w, h = base.size
    px = base.load()
    vis = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def try_seed(x: int, y: int) -> None:
        if not (0 <= x < w and 0 <= y < h):
            return
        r, g, b, _a = px[x, y]
        if not is_outer_bg((r, g, b)):
            return
        i = y * w + x
        if vis[i]:
            return
        vis[i] = 1
        q.append((x, y))

    for x in range(w):
        try_seed(x, 0)
        try_seed(x, h - 1)
    for y in range(h):
        try_seed(0, y)
        try_seed(w - 1, y)

    n = 0
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        n += 1
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            ni = ny * w + nx
            if vis[ni]:
                continue
            r, g, b, _a = px[nx, ny]
            if not is_outer_bg((r, g, b)):
                continue
            vis[ni] = 1
            q.append((nx, ny))

    dst.parent.mkdir(parents=True, exist_ok=True)
    base.save(dst)
    print(f"Wrote {dst} ({n} px → transparent)")


if __name__ == "__main__":
    main()
