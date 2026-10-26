"""Cut a long Voice Lab recording into one clip per Ghost line.

    python scripts/cut-ghost-recording.py <recording.wav> <tab> [--write]

Tabs: songwriter blackhole analyzer songforge quantum loopstation stemmer
booth midistudio mastering screw settings, and promo (the promo runs' lines,
src/mobile/promoLines.js). Then run scripts/check-ghost-clips.py.

Transcribes the recording (faster-whisper small.en, cached), finds the best
matching stretch of speech for every line of that tab in phoneGhostScripts.js,
and (with --write) cuts each one to src/assets/ghost-vo-phone/<tab>-<i>.mp3.
Spoken headings and repeated takes are simply never matched, so they drop out.
"""
import difflib, json, re, subprocess, sys
from faster_whisper import WhisperModel

import pathlib
REPO = str(pathlib.Path(__file__).resolve().parent.parent)
REPO_URL = REPO.replace(chr(92), '/')
rec, tab = sys.argv[1], sys.argv[2]
write = '--write' in sys.argv

lines = json.loads(subprocess.run(
    ['node', '--input-type=module', '-e',
     f"const m = await import('file:///{REPO_URL}/src/mobile/phoneGhostScripts.js');"
     "process.stdout.write(JSON.stringify(m.phoneGhostLines()))"],
    capture_output=True, text=True, cwd=REPO).stdout)
lines = [l for l in lines if l['tabId'] == tab]

NUM = {'20': 'twenty', '200': 'two hundred', '2': 'two', '4': 'four', '12': 'twelve'}
def norm(t):
    t = t.lower().replace('’', "'")
    for k, v in NUM.items():
        t = re.sub(r'\b%s\b' % k, v, t)
    t = t.replace('songforge', 'song forge').replace("everyone's", "every one's")
    t = re.sub(r"(write|right)", 'rite', t)   # Whisper hears one as the other
    return re.findall(r"[a-z']+", t)

model = WhisperModel('small.en', device='cpu', compute_type='int8')
segs, _ = model.transcribe(rec, language='en', word_timestamps=True)
words = []
for s in segs:
    for w in s.words:
        for tok in norm(w.word) or ['_']:
            words.append({'t': tok, 's': w.start, 'e': w.end})
toks = [w['t'] for w in words]

results = []
for l in lines:
    want = norm(l['text'])
    n = len(want)
    best = (0, 0, 0)
    for i in range(len(toks)):
        if toks[i] != want[0] and (i + 1 >= len(toks) or toks[i + 1] != want[1]) and difflib.SequenceMatcher(None, toks[i:i+3], want[:3]).ratio() < 0.5:
            continue
        for j in range(max(i + 1, i + n - 6), min(len(toks), i + n + 6) + 1):
            r = difflib.SequenceMatcher(None, toks[i:j], want).ratio()
            if r > best[0]:
                best = (r, i, j)
    results.append((l, best))

dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', rec],
                           capture_output=True, text=True).stdout)
ok = True
for l, (score, i, j) in results:
    if score < 0.8:
        ok = False
    a = max(words[i - 1]['e'] + 0.04 if i > 0 else 0, words[i]['s'] - 0.15)
    b = min(words[j]['s'] - 0.04 if j < len(words) else dur, words[j - 1]['e'] + 0.35)
    print(f"{l['id']:<18} {score:.2f}  {a:7.2f}-{b:7.2f}  {' '.join(toks[i:j])[:70]}")
    if write and score >= 0.8:
        out = rf"{REPO}\src\assets\ghost-vo-phone\{l['id']}.mp3"
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', rec,
                        '-codec:a', 'libmp3lame', '-q:a', '2', '-ar', '44100', '-ac', '1', out], check=True)
print('ALL MATCHED' if ok else 'SOME LINES DID NOT MATCH (score < 0.80): not in this recording, or worded differently')
