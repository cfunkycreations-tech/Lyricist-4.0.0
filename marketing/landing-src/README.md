# Gumroad landing page

Live at https://funkycreations.gumroad.com/l/lyricist-pro (product `pzglwj`).
It replaces the whole Gumroad product page.

Rebuild after editing `template.html`:

    python3 marketing/landing-src/build.py marketing/landing.html

Check and publish with the Gumroad CLI:

    gumroad products page preview pzglwj marketing/landing.html --json --no-input --non-interactive
    gumroad products page publish pzglwj marketing/landing.html --json --no-input --non-interactive

Back to Gumroad's default page: `gumroad products page clear pzglwj --yes`.

## Store home page

`marketing/storefront.html` is the custom profile page at https://funkycreations.gumroad.com.
It shares the assets in `landing-src/assets/`. Rebuild and publish:

    python3 marketing/storefront-src/build.py marketing/storefront.html
    gumroad user page preview marketing/storefront.html --json --no-input --non-interactive
    gumroad user page publish marketing/storefront.html --json --no-input --non-interactive

`storefront-src/previous-profile.html` is the page it replaced (CFunk Creations AI consulting).
Don't name a class `ring`: Gumroad's own stylesheet draws a box around it.
