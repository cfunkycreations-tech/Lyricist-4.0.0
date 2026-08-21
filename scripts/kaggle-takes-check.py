# -*- coding: utf-8 -*-
"""Prove the notebook makes two takes AT THE SAME TIME, without needing a GPU.

    python scripts/kaggle-takes-check.py

Kaggle's free machine is a T4 x2, two whole graphics cards, and one ComfyUI only
ever uses the first. The generation cell now runs a second ComfyUI on the second
card and splits the takes between them, so two versions cost about what one used
to. None of that can be tested by reading it, and testing it for real costs a
graphics card hour per attempt.

Stands up two fake ComfyUI servers, runs the real generation cell against them,
and checks that both takes went out at the same time, on different ports, with
different seeds, and that both files landed. Then does it again with one card to
prove the fall-back still produces every take.
"""
import json, io, os, sys, time, threading, shutil, types
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = r'V:\src\Lyricist-4.0.0'
P = ROOT + r'\resources\kaggle-minimax-music3.ipynb'
TMP = os.path.dirname(os.path.abspath(__file__))
COMFY = os.path.join(TMP, 'fake-comfy')
WORKING = os.path.join(TMP, 'fake-working')

SUBMITS = []          # (port, seed, tag, t)
LOCK = threading.Lock()


def make_handler(port):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, obj):
            b = json.dumps(obj).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_GET(self):
            if self.path.endswith('/system_stats'):
                return self._send({'ok': True})
            if '/history/' in self.path:
                pid = self.path.rsplit('/', 1)[1]
                job = JOBS.get(pid)
                if not job or time.time() < job['done_at']:
                    return self._send({})          # still running
                name = f"{job['tag']}_00001_.flac"
                os.makedirs(os.path.join(COMFY, 'output'), exist_ok=True)
                with open(os.path.join(COMFY, 'output', name), 'wb') as f:
                    f.write(b'fLaC' + os.urandom(2048))
                return self._send({pid: {'status': {'status_str': 'success', 'messages': []},
                                        'outputs': {'9': {'audio': [{'filename': name,
                                                                     'subfolder': ''}]}}}})
            return self._send({})

        def do_POST(self):
            n = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(n) or b'{}')
            g = body.get('prompt', {})
            seed = g.get('7', {}).get('inputs', {}).get('seed')
            tag = g.get('9', {}).get('inputs', {}).get('filename_prefix')
            pid = f'{port}-{len(JOBS)}-{seed}'
            with LOCK:
                SUBMITS.append((port, seed, tag, time.time()))
            # Each take "takes" 4 seconds of sampling.
            JOBS[pid] = {'tag': tag, 'done_at': time.time() + 4}
            return self._send({'prompt_id': pid})
    return H


JOBS = {}


def serve(port):
    s = HTTPServer(('127.0.0.1', port), make_handler(port))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def cell_source():
    nb = json.load(io.open(P, encoding='utf-8'))
    c = next(c for c in nb['cells']
             if c['cell_type'] == 'code' and 'class_type' in ''.join(c['source']))
    src = ''.join(c['source']) if isinstance(c['source'], list) else c['source']
    return (src.replace('COMFY   = "/kaggle/temp/ComfyUI"', f'COMFY   = r"{COMFY}"')
               .replace('WORKING = "/kaggle/working"', f'WORKING = r"{WORKING}"')
               .replace('open(f"/kaggle/temp/comfy-{port}.log", "wb")',
                        'open(os.path.join(r"' + TMP + '", f"comfy-{port}.log"), "wb")'))


def run(seeds, cards):
    for d in (COMFY, WORKING):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(os.path.join(d, 'output') if d == COMFY else d, exist_ok=True)
    SUBMITS.clear()
    JOBS.clear()
    fake_torch = types.ModuleType('torch')
    fake_torch.cuda = types.SimpleNamespace(device_count=lambda: cards)
    sys.modules['torch'] = fake_torch
    g = {'CAPTION': 'a caption', 'LYRICS': '[Verse]\nwords', 'DURATION': 60,
         'SEEDS': seeds, 'STEPS': 30, 'CFG': 1.7, '__name__': '__main__'}
    t0 = time.time()
    exec(compile(cell_source(), 'gen-cell', 'exec'), g)
    return time.time() - t0, list(g.get('out_files', []))


bad = 0


def ok(name, cond, extra=''):
    global bad
    print(f"{'PASS' if cond else 'FAIL'}  {name}{('  ' + extra) if extra else ''}")
    if not cond:
        bad += 1


serve(8188)
serve(8189)

print('--- two cards, two seeds ---')
el, files = run([222, 777], cards=2)
ports = sorted({p for p, *_ in SUBMITS})
seeds = sorted({s for _, s, *_ in SUBMITS})
spread = max(t for *_, t in SUBMITS) - min(t for *_, t in SUBMITS)
ok('both takes were made', len(files) == 2, f'{[os.path.basename(f) for f in files]}')
ok('one take per card', ports == [8188, 8189], str(ports))
ok('different seeds', seeds == [222, 777], str(seeds))
ok('they started together', spread < 1.5, f'{spread:.2f}s apart')
two_cards_two = el   # compared against the one-card run below

print('\n--- one card, two seeds: it must still make both ---')
el1, files1 = run([222, 777], cards=1)
ports1 = sorted({p for p, *_ in SUBMITS})
ok('both takes still made', len(files1) == 2, f'{[os.path.basename(f) for f in files1]}')
ok('all on the first card', ports1 == [8188], str(ports1))
ok('one after the other', el1 > two_cards_two + 5,
   f'{el1:.0f}s on one card vs {two_cards_two:.0f}s on two: the second card really halves it')

print('\n--- four seeds on two cards ---')
el4, files4 = run([1, 2, 3, 4], cards=2)
ok('four takes made', len(files4) == 4, str(len(files4)))
ok('two rounds, not four', el4 <= el1 + 1, f'4 takes on two cards took {el4:.0f}s, the same as 2 takes on one card ({el1:.0f}s)')

print('\n--- a single seed still works ---')
el5, files5 = run([222], cards=2)
ok('one take, one file', len(files5) == 1, str([os.path.basename(f) for f in files5]))
ok('no second server needed', sorted({p for p, *_ in SUBMITS}) == [8188], '')

print(f"\n{bad} FAILED" if bad else "\nALL PASSED")
sys.exit(1 if bad else 0)
