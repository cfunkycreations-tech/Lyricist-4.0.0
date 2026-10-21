"""
BLACK HOLE STUDIOS — the images the logo intro reads.

    python scripts/logo_textures.py

Writes scripts/logo_tex/ next to this file:

    lyricist_logo.png   the brand logo, straight from src/assets, as PNG with
                        its alpha kept. Cinema 4D does not read .webp, and the
                        alpha is what cuts the badge out of its black square.
    logo_glow.png       a soft warm disc, white-hot in the middle. It sits
                        behind the badge and flares as the logo lands, so the
                        painted black hole appears to light the whole card.

Run this once. Run it again only if the logo itself changes; logo_c4d.py hands
Cinema 4D a fresh copy either way, so a changed image always shows up.
"""
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SOURCE = os.path.join(ROOT, "src", "assets", "brand-logo.webp")
OUT = os.path.join(HERE, "logo_tex")

GLOW_SIZE = 1024
GLOW_CORE = (1.00, 0.97, 0.88)      # white-hot middle
GLOW_EDGE = (1.00, 0.42, 0.08)      # ember rim


def logo():
    img = Image.open(SOURCE).convert("RGBA")
    img.save(os.path.join(OUT, "lyricist_logo.png"))
    return img.size


def glow():
    """A radial falloff, hot in the middle and gone by the edge. The alpha is
    the falloff too, so the disc has no rectangle around it."""
    size = GLOW_SIZE
    half = size / 2.0
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        dy = (y - half) / half
        for x in range(size):
            dx = (x - half) / half
            d = (dx * dx + dy * dy) ** 0.5
            if d >= 1.0:
                continue
            t = d * d                     # tight core, long tail
            fade = (1.0 - d) ** 2.2
            px[x, y] = (
                int(255 * (GLOW_CORE[0] + (GLOW_EDGE[0] - GLOW_CORE[0]) * t)),
                int(255 * (GLOW_CORE[1] + (GLOW_EDGE[1] - GLOW_CORE[1]) * t)),
                int(255 * (GLOW_CORE[2] + (GLOW_EDGE[2] - GLOW_CORE[2]) * t)),
                int(255 * fade),
            )
    img.save(os.path.join(OUT, "logo_glow.png"))


if not os.path.isdir(OUT):
    os.makedirs(OUT)
size = logo()
glow()
print("logo_tex ready: lyricist_logo.png {}x{}, logo_glow.png {}x{}".format(
    size[0], size[1], GLOW_SIZE, GLOW_SIZE))
