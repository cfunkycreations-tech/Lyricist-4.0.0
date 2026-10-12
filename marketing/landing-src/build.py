import base64, json, html, re, sys, os
D = os.path.dirname(os.path.abspath(__file__))
A = os.path.join(D, 'assets')
def b64(p): return base64.b64encode(open(os.path.join(A, p), 'rb').read()).decode()
def uri(p): return 'data:image/webp;base64,' + b64(p)

TOOLS = [
  ('Songwriter', 'Write and polish lyrics line by line, with Suno tags to match.', False),
  ('Black Hole Studios', 'Your lyrics, sung by a full band.', True),
  ('Ghost Rider', "Learn any artist's style and write a new song in it.", False),
  ('Song Forge', 'One idea in, a full set of lyrics and cover art out.', False),
  ('The Matrix', 'Build a verse from a grid of word tiles.', False),
  ('Collaboration', 'Write with someone else live. No account, no server.', False),
  ('RC-Funk 5000', 'Four-track live loop station.', True),
  ('Stemmer', 'Split any song into vocals, drums, bass and more.', True),
  ('Recording Booth', 'Record guitar, harmonica or vocals. Keep every take.', True),
  ('Voice Lab', 'Write a script, pick a voice, save a WAV.', False),
  ('MIDI Studio', 'Turn audio into MIDI on a full piano roll.', True),
  ('Mastering Studio', 'EQ, compression, limiting, album export.', True),
  ('Chopped & Screwed', 'Slow it down, chop it up. The Houston sound.', True),
  ('Rhyme Helper', 'Perfect, slant and internal rhymes.', False),
  ('Thesaurus', 'The word you were reaching for.', True),
  ('Dictionary', 'Meanings in English and Spanish.', True),
  ('AI Tools Hub', 'A shelf of AI tools worth knowing.', False),
  ('Scratchpad', 'Catch ideas the second they show up.', True),
]
tools = ''.join(
  f'<li class="rise">{"<span class=free>Ready on install</span>" if free else ""}<b>{html.escape(n)}</b><span>{html.escape(d)}</span></li>'
  for n, d, free in TOOLS)

TICK = ['Songwriter', 'Black Hole Studios', 'Ghost Rider', 'Suno tags', 'The Matrix', 'Song Forge', 'RC-Funk 5000',
        'Stemmer', 'Mastering Studio', 'Chopped & Screwed', 'MIDI Studio', 'Recording Booth', 'Voice Lab', 'Collaboration']
ticker = ''.join(f'<li>{html.escape(t)}</li>' for t in TICK)

EX = {
  'southern': {'name': 'Southern rock', 'lyrics':
    "[Verse 1]\nPawn shop guitar with a crack down the side\nForty dollars, and I paid it with pride\n\n[Chorus]\nPlay it loud on the tailgate, let the county hear\nEvery wrong note sounds right when the whole crowd's near",
    'tags': 'southern rock, gritty male vocals, fuzz guitar, slide guitar, driving drums, live room, 112 bpm'},
  'lofi': {'name': 'Lo-fi hip hop', 'lyrics':
    "[Verse 1]\nWindow cracked, the city hums along\nKettle on the burner, half a verse, half a song\n\n[Hook]\nSlow it down, let the morning take its time\nI got nowhere to be but this line",
    'tags': 'lo-fi hip hop, mellow rap vocals, dusty vinyl drums, warm Rhodes, soft bass, 78 bpm'},
  'country': {'name': 'Outlaw country', 'lyrics':
    "[Verse 1]\nDiesel on my boots and a dime in my hand\nOne more county line and a two-piece band\n\n[Chorus]\nI don't need the radio to know who I am\nJust a road and a song and a reason to stand",
    'tags': 'outlaw country, baritone male vocals, twangy telecaster, upright bass, brushed drums, honky-tonk piano, 96 bpm'},
}
picks = ''.join(f'<button type="button" data-k="{k}" aria-pressed="false">{html.escape(v["name"])}</button>' for k, v in EX.items())

page = open(os.path.join(D, 'template.html'), encoding='utf-8').read()
page = (page.replace('{{FONT}}', b64('audiowide.woff2'))
            .replace('{{LOGO_SM}}', uri('logo-sm.webp')).replace('{{LOGO_MD}}', uri('logo-md.webp')).replace('{{LOGO}}', uri('logo.webp'))
            .replace('{{STUDIO}}', uri('studio.webp')).replace('{{RIDER}}', uri('rider.webp'))
            .replace('{{MATRIX}}', uri('matrix.webp')).replace('{{LOOPS}}', uri('loops.webp'))
            .replace('{{TOOLS}}', tools).replace('{{TICKER}}', ticker).replace('{{PICKS}}', picks)
            .replace('{{EXAMPLES}}', json.dumps(EX)))
assert '{{' not in page, re.findall(r'\{\{\w+\}\}', page)

# The app's banned list, plus words that hide one inside them.
BANNED = r'neon|midnight|rain|heartbreak|cold coffee|shadow|whisper|echo|spark|cage|gravity|chain|storm'
text = re.sub(r'<style>.*?</style>', '', re.sub(r'data:[^"\')]+', '', page), flags=re.S)
hits = sorted(set(m.group(0).lower() for m in re.finditer(r'\w*(?:' + BANNED + r')\w*', text, re.I)))
if hits: sys.exit('banned words: ' + ', '.join(hits))
out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(D, 'landing.html')
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page) // 1024, 'KB')
