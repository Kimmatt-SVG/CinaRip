#!/usr/bin/env python3
"""Crop horror-theme art and knock out checkerboard / black backgrounds."""

from pathlib import Path

from PIL import Image

ASSETS = Path("/Users/user/.cursor/projects/Users-user-CinaRip/assets")
OUT = Path("/Users/user/CinaRip/nas-web/public/rite")
ICONS = OUT / "icons"

STRIP = ASSETS / "ad02ca9f-c179-4485-8d7f-a6ae1899cdc5-e6974a9e-89fc-421f-9ae6-e0250891645d.jpg"
LOGO = ASSETS / "98d2c3fd-c0a3-48d6-8ded-d26e709156ca-e7715f96-afdd-4024-a67a-987fab8582aa.jpg"
LIBRARY = ASSETS / "dec7c8c0-5221-4faf-9a22-28017f1af942-81b086e6-5c7a-4991-8434-8df4d7360a44.jpg"


def knock_checker(im: Image.Image) -> Image.Image:
    src = im.convert("RGBA")
    pix = src.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = pix[x, y]
            mx = max(r, g, b)
            mn = min(r, g, b)
            sat = mx - mn
            mean = (r + g + b) / 3.0
            if sat < 22 and 95 < mean < 215:
                pix[x, y] = (r, g, b, 0)
            elif sat < 40 and 80 < mean < 230:
                alpha = max(0, min(255, int((sat - 8) / 24.0 * 255)))
                pix[x, y] = (r, g, b, alpha)
    return src


def knock_black(im: Image.Image) -> Image.Image:
    src = im.convert("RGBA")
    pix = src.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = pix[x, y]
            glow = max(0, r - max(g, b))
            luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if luma < 18 and glow < 10:
                pix[x, y] = (r, g, b, 0)
            elif luma < 32 and glow < 14:
                alpha = max(0, min(255, int((luma - 8) / 24.0 * 255)))
                pix[x, y] = (r, g, b, alpha)
    return src


def trim(im: Image.Image, pad: int = 8) -> Image.Image:
    alpha = im.split()[-1]
    bbox = alpha.point(lambda p: 255 if p > 12 else 0).getbbox()
    if not bbox:
        return im
    left, top, right, bottom = bbox
    return im.crop(
        (
            max(0, left - pad),
            max(0, top - pad),
            min(im.width, right + pad),
            min(im.height, bottom + pad),
        )
    )


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "PNG", optimize=True)
    print(f"wrote {path} {im.size}")


def opaque_columns(im: Image.Image) -> list:
    pix = im.load()
    w, h = im.size
    cols = []
    for x in range(w):
        on = False
        for y in range(0, h, 3):
            if pix[x, y][3] > 20:
                on = True
                break
        cols.append(on)
    runs = []
    start = None
    for x, on in enumerate(cols):
        if on and start is None:
            start = x
        elif not on and start is not None:
            runs.append((start, x - 1))
            start = None
    if start is not None:
        runs.append((start, w - 1))
    return runs


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)

    strip = knock_checker(Image.open(STRIP))
    w, h = strip.size
    runs = opaque_columns(strip)
    runs = sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:3]
    runs = sorted(runs, key=lambda r: r[0])
    names = ["music-on.png", "music-off.png", "settings.png"]
    if len(runs) != 3:
        third = w // 3
        runs = [(i * third, (i + 1) * third - 1) for i in range(3)]
    for (x0, x1), name in zip(runs, names):
        pad = max(4, (x1 - x0) // 18)
        crop = strip.crop((max(0, x0 - pad), 0, min(w, x1 + pad + 1), h))
        save(trim(crop, pad=6), ICONS / name)

    library = trim(knock_checker(Image.open(LIBRARY)), pad=10)
    save(library, ICONS / "library.png")

    logo = trim(knock_black(Image.open(LOGO)), pad=12)
    save(logo, OUT / "logo.png")


if __name__ == "__main__":
    main()
