"""Build the Gumroad store pages (About, FAQ, Get started, Refunds, License) into one file each.

    python3 marketing/pages-src/build.py        → marketing/pages/<slug>.html

Publish one:  gumroad pages push <slug> marketing/pages/<slug>.html
"""
import base64, os, re, sys
D = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(D, '..', 'landing-src', 'assets')
OUT = os.path.join(D, '..', 'pages')
def b64(p): return base64.b64encode(open(os.path.join(A, p), 'rb').read()).decode()
def uri(p): return 'data:image/webp;base64,' + b64(p)

PAGES = {'about': 'About', 'faq': 'FAQ', 'start': 'Get started', 'refunds': 'Refunds', 'license': 'License'}
CTA = '''<aside class="bh-cta">
    <img src="{{LOGO_MD}}" alt="" width="74" height="80">
    <div><h3>Lyricist Pro</h3><p>18 songwriting tools in one Windows app, plus the phone version. Lyrics and Suno tags, a full band, a mastered album.</p></div>
    <a class="bh-btn bh-btn-hot" href="{{LP_URL}}">Get it <span class="bh-price">$19.99</span></a>
  </aside>'''
VARS = {
    'FONT': b64('audiowide.woff2'), 'LOGO_SM': uri('logo-sm.webp'), 'LOGO_MD': uri('logo-md.webp'), 'PHOTO': uri('funk.webp'),
    'HOME': 'https://funkycreations.gumroad.com', 'LP_URL': 'https://funkycreations.gumroad.com/l/lyricist-pro',
}
BANNED = r'neon|midnight|rain|heartbreak|cold coffee|shadow|whisper|echo|spark|cage|gravity|chain|storm'
os.makedirs(OUT, exist_ok=True)
shell = open(os.path.join(D, 'shell.html'), encoding='utf-8').read()
for slug in (sys.argv[1:] or PAGES):
    page = shell.replace('{{BODY}}', open(os.path.join(D, f'{slug}.html'), encoding='utf-8').read()).replace('{{CTA}}', CTA)
    for s in PAGES:
        page = page.replace('{{CUR_' + s + '}}', ' aria-current="page"' if s == slug else '')
    for k, v in VARS.items():
        page = page.replace('{{' + k + '}}', v)
    assert '{{' not in page, re.findall(r'\{\{\w+\}\}', page)
    text = re.sub(r'<style>.*?</style>', '', re.sub(r'data:[^"\')]+', '', page), flags=re.S)
    hits = sorted(set(m.group(0).lower() for m in re.finditer(r'\w*(?:' + BANNED + r')\w*', text, re.I)))
    if hits: sys.exit(f'{slug}: banned words: ' + ', '.join(hits))
    out = os.path.join(OUT, f'{slug}.html')
    open(out, 'w', encoding='utf-8').write(page)
    print(out, len(page) // 1024, 'KB')
