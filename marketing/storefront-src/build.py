"""Build the Gumroad store home page (profile custom HTML) into one file.

    python3 marketing/storefront-src/build.py marketing/storefront.html
"""
import base64, html, os, re, sys
D = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(D, '..', 'landing-src', 'assets')
def b64(p): return base64.b64encode(open(os.path.join(A, p), 'rb').read()).decode()
def uri(p): return 'data:image/webp;base64,' + b64(p)

TOOLS = ['Songwriter', 'Black Hole Studios', 'Ghost Rider', 'Song Forge', 'The Matrix', 'Collaboration',
         'RC-Funk 5000', 'Stemmer', 'Recording Booth', 'Voice Lab', 'MIDI Studio', 'Mastering Studio',
         'Chopped & Screwed', 'Rhyme Helper', 'Thesaurus', 'Dictionary', 'AI Tools Hub', 'Scratchpad']
HI = {'Songwriter', 'Black Hole Studios', 'Ghost Rider'}
cloud = ''.join(f'<li{" class=hi" if t in HI else ""}>{html.escape(t)}</li>' for t in TOOLS)

page = open(os.path.join(D, 'template.html'), encoding='utf-8').read()
for k, v in {
    'FONT': b64('audiowide.woff2'), 'LOGO_SM': uri('logo-sm.webp'), 'LOGO_MD': uri('logo-md.webp'),
    'PHOTO': uri('logo-badge.webp'), 'SKYLINE': uri('skyline.webp'), 'STUDIO': uri('studio.webp'),
    'RIDER': uri('rider.webp'), 'MATRIX': uri('matrix.webp'), 'LOOPS': uri('loops.webp'), 'CLOUD': cloud,
    'LP_URL': 'https://funkycreations.gumroad.com/l/lyricist-pro', 'TP_URL': 'https://funkycreations.gumroad.com/l/avtte',
}.items():
    page = page.replace('{{' + k + '}}', v)
assert '{{' not in page, re.findall(r'\{\{\w+\}\}', page)

BANNED = r'neon|midnight|rain|heartbreak|cold coffee|shadow|whisper|echo|spark|cage|gravity|chain|storm'
text = re.sub(r'<style>.*?</style>', '', re.sub(r'data:[^"\')]+', '', page), flags=re.S)
hits = sorted(set(m.group(0).lower() for m in re.finditer(r'\w*(?:' + BANNED + r')\w*', text, re.I)))
if hits: sys.exit('banned words: ' + ', '.join(hits))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(D, '..', 'storefront.html')
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page) // 1024, 'KB')
