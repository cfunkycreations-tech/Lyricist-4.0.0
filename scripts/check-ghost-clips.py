"""Transcribe every phone Ghost clip and check it says its line once, and nothing else."""
import difflib, glob, json, os, re, subprocess
from faster_whisper import WhisperModel

import pathlib
REPO = str(pathlib.Path(__file__).resolve().parent.parent)
REPO_URL = REPO.replace(chr(92), '/')
lines = json.loads(subprocess.run(
    ['node', '--input-type=module', '-e',
     f"const m = await import('file:///{REPO_URL}/src/mobile/phoneGhostScripts.js');"
     "process.stdout.write(JSON.stringify(m.phoneGhostLines()))"],
    capture_output=True, text=True, cwd=REPO).stdout)
want = {l['id']: l['text'] for l in lines}

NUM = {'20': 'twenty', '200': 'two hundred', '2': 'two', '4': 'four'}
def norm(t):
    t = t.lower().replace('’', "'")
    for k, v in NUM.items():
        t = re.sub(r'\b%s\b' % k, v, t)
    t = t.replace('songforge', 'song forge').replace("everyone's", "every one's")
    t = re.sub(r'\b(write|right)\b', 'rite', t)
    return re.findall(r"[a-z']+", t)

def repeats(toks, n=4):
    seen, dup = {}, []
    for i in range(len(toks) - n + 1):
        g = tuple(toks[i:i + n])
        if g in seen and i - seen[g] >= n:
            dup.append(' '.join(g))
        seen.setdefault(g, i)
    return dup

model = WhisperModel('small.en', device='cpu', compute_type='int8')
bad = 0
for f in sorted(glob.glob(os.path.join(REPO, 'src', 'assets', 'ghost-vo-phone', '*.mp3'))):
    cid = os.path.basename(f)[:-4]
    segs, _ = model.transcribe(f, language='en', condition_on_previous_text=False, vad_filter=True)
    heard = ' '.join(s.text for s in segs)
    h, w = norm(heard), norm(want.get(cid, ''))
    score = difflib.SequenceMatcher(None, h, w).ratio()
    dup = repeats(h)
    extra = len(h) - len(w)
    # A clip must START on its line's first word: anything before it is a
    # spoken heading or a stray take (Settings said "Settings" twice).
    starts_wrong = bool(h and w and h[0] != w[0] and difflib.SequenceMatcher(None, h[0], w[0]).ratio() < 0.6)
    flag = (cid not in want) or score < 0.9 or dup or extra > 3 or starts_wrong
    if starts_wrong:
        dup = list(dup) + ['STARTS WITH "%s", line starts "%s"' % (h[0], w[0])]
    bad += bool(flag)
    print(f"{'FIX ' if flag else 'ok  '}{cid:<16} match {score:.2f}  words {len(h)}/{len(w)}"
          + (f"  REPEATS: {dup}" if dup else '') + (f"  HEARD: {heard.strip()}" if flag else ''))
print(f"\n{bad} clip(s) need fixing")
