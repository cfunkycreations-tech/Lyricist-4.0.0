# Gumroad landing page

Live at https://funkycreations.gumroad.com/l/lyricist-pro (product `pzglwj`).
It replaces the whole Gumroad product page.

Rebuild after editing `template.html`:

    python3 marketing/landing-src/build.py marketing/landing.html

Check and publish with the Gumroad CLI:

    gumroad products page preview pzglwj marketing/landing.html --json --no-input --non-interactive
    gumroad products page publish pzglwj marketing/landing.html --json --no-input --non-interactive

Back to Gumroad's default page: `gumroad products page clear pzglwj --yes`.
