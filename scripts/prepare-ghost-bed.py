#!/usr/bin/env python3
"""
Turn a music track into a seamless background bed for the Ghost Demo.

    python scripts/prepare-ghost-bed.py <source audio> <name> [--usable-end SEC] [--xfade SEC]

Writes src/assets/ghost-bg/ghost-bg-<name>.mp3 and adds <name> to
src/assets/ghost-bg/beds.json with its loop points. GhostDemo.jsx picks every
bed in that folder up on the next build, no code change.

What it does:
  1. Finds the longest loop [loopStart, loopEnd] whose two ends sound alike:
     same spectrum, same rhythm (onsets line up) and the same level within
     1 dB, so the seam doesn't jump in volume or flam the drums. Then lines the
     waveforms up to the sample.
  2. Bakes a crossfade into the samples just before loopEnd, so the jump from
     loopEnd back to loopStart is continuous. The file carries a short guard
     past loopEnd, so a decoder that shifts the start by a few ms still lands
     on matching audio.
  3. Matches the loop region to -20 LUFS (the intro before loopStart plays once).
  4. 30 ms fade-in at the very start, 192 kbps 44.1 kHz MP3.

--usable-end: where the source stops being usable (a Suno hard cut, or where a
baked fade-out starts). Default: 50 ms before the end of the file.
--xfade: crossfade length. Short (0.5 s) for anything with drums, longer for
drones.

Needs ffmpeg and numpy + soundfile.
"""
import argparse, json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf

SR = 44100
HOP = 1024                 # analysis hop, ~23 ms
NFFT = 2048
TARGET_LUFS = -20.0
GUARD = 0.06               # s of continuation baked past loopEnd
FADE_IN = 0.03
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'src', 'assets', 'ghost-bg')


def decode(path):
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'a.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, '-ac', '2', '-ar', str(SR),
                        '-c:a', 'pcm_f32le', wav], check=True)
        x, _ = sf.read(wav, dtype='float32')
    return x


def mel_bank(n_mels=48, fmin=30.0, fmax=16000.0):
    mel = lambda f: 2595 * np.log10(1 + f / 700)
    inv = lambda m: 700 * (10 ** (m / 2595) - 1)
    pts = inv(np.linspace(mel(fmin), mel(fmax), n_mels + 2))
    bins = np.fft.rfftfreq(NFFT, 1 / SR)
    fb = np.zeros((n_mels, len(bins)))
    for i in range(n_mels):
        lo, c, hi = pts[i], pts[i + 1], pts[i + 2]
        fb[i] = np.clip(np.minimum((bins - lo) / (c - lo), (hi - bins) / (hi - c)), 0, None)
    return fb


def features(mono):
    n = 1 + (len(mono) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    frames = mono[idx] * np.hanning(NFFT)[None, :]
    spec = np.abs(np.fft.rfft(frames, axis=1)) ** 2
    mel = spec @ mel_bank().T
    comp = mel ** 0.3                                     # level-sensitive, but tamed
    unit = comp / (np.linalg.norm(comp, axis=1, keepdims=True) + 1e-12)
    logmel = np.log(mel + 1e-10)
    onset = np.maximum(0, np.diff(logmel, axis=0, prepend=logmel[:1])).sum(1)
    rms_db = 10 * np.log10((frames ** 2).mean(1) + 1e-12)
    return unit, onset, rms_db


def find_loop(x, usable_end, xfade, min_loop):
    mono = x.mean(1)
    unit, onset, rms_db = features(mono)
    nfr = len(unit)
    fps = SR / HOP
    W = int(round(max(3.0, xfade + 1.0) * fps))       # compare 3 s ending at each point
    A = int(round(0.5 * fps))                          # and 0.5 s after it
    t_max = int((usable_end - GUARD) * fps) - A - 2    # T + A must stay inside usable audio
    s_min = int(np.ceil(xfade * fps)) + W              # S - xfade and S - W must exist
    lag_min = int(min_loop * fps)
    if t_max - s_min < lag_min:
        sys.exit(f'Not enough usable audio for a {min_loop}s loop.')
    # Level heard just before a frame and just after it, ~2 s each.
    lw = int(2 * fps)
    c = np.concatenate([[0.0], np.cumsum(rms_db)])
    before = np.full(nfr, np.nan); before[lw:] = (c[lw:nfr] - c[:nfr - lw]) / lw
    after = np.full(nfr, np.nan); after[:nfr - lw] = (c[lw + np.arange(nfr - lw)] - c[:nfr - lw]) / lw
    cum = lambda v: np.concatenate([[0.0], np.cumsum(v)])
    n = W + A
    best = []                                          # (lag, T, score, mel, ons, ddb)
    for lag in range(lag_min, t_max - s_min + 1):
        # f indexes the loop-start side; f + lag is the matching frame at the loop end.
        S = np.arange(s_min, t_max - lag + 1)
        T = S + lag
        a, b = onset[lag:], onset[:nfr - lag]
        win = lambda v: cum(v)[S + A] - cum(v)[S - W]   # window [S-W, S+A) vs [T-W, T+A)
        sa, sb, sab, saa, sbb = win(a), win(b), win(a * b), win(a * a), win(b * b)
        corr = (sab - sa * sb / n) / np.sqrt(np.maximum(1e-12, (saa - sa ** 2 / n) * (sbb - sb ** 2 / n)))
        mel = win(np.einsum('ij,ij->i', unit[lag:], unit[:nfr - lag])) / n
        # Same level on both sides of the seam: what plays before loopEnd vs. what
        # plays before and after loopStart.
        ddb = np.maximum(np.abs(before[T] - before[S]), np.abs(before[T] - after[S]))
        score = np.where(ddb <= 1.0, 0.5 * mel + 0.5 * corr, -np.inf)
        k = int(np.argmax(score))
        if np.isfinite(score[k]):
            best.append((lag, int(T[k]), float(score[k]), float(mel[k]), float(corr[k]), float(ddb[k])))
    if not best:
        sys.exit('No loop found whose ends match in level within 1 dB.')
    top = max(b[2] for b in best)
    # Longest loop that is nearly as good as the best seam anywhere.
    good = [b for b in best if b[2] >= top - 0.03]
    lag, T, score, mel, ons, ddb = max(good, key=lambda b: b[0])
    print(f'  best seam score {top:.3f}; picked {lag / fps:.2f}s loop, score {score:.3f} '
          f'(spectrum {mel:.3f}, rhythm {ons:.3f}, level diff {ddb:.2f} dB)')

    # Sample-accurate alignment. The search is only good to one hop (23 ms),
    # which is enough to flam a snare. Line the transients up first (high-passed
    # energy, 0.7 ms resolution), then the waveform within +-32 samples.
    Ts, Ss = T * HOP + NFFT // 2, (T - lag) * HOP + NFFT // 2
    L = int(xfade * SR)
    ncc = lambda p, q: float(np.dot(p, q) / (np.linalg.norm(p) * np.linalg.norm(q) + 1e-12))
    E, CH = 32, int(3.5 * SR) // 32
    hp = np.abs(np.diff(mono, prepend=mono[:1]))
    env = lambda at: hp[at - CH * E:at].reshape(CH, E).sum(1)
    ref_env = env(Ts)
    env_scores = [(ncc(ref_env, env(Ss + k)), k) for k in range(-HOP, HOP + 1, E // 2)]
    env_best, k0 = max(env_scores)
    if env_best < 0.3:
        k0 = 0                                        # no real transients (a drone): skip
    ref = mono[Ts - L:Ts]
    rho, k = max((ncc(ref, mono[Ss + k0 + j - L:Ss + k0 + j]), k0 + j) for j in range(-32, 33))
    print(f'  transient match {env_best:.3f} (shift {k0 / SR * 1000:+.1f} ms), '
          f'waveform match {rho:.3f} (shift {k / SR * 1000:+.1f} ms)')
    return Ss + k, Ts, rho


def bake(x, S, T, xfade, rho):
    d = T - S
    g = int(GUARD * SR)
    L = int(xfade * SR)
    out = x[:T + g].copy()
    n = L - g                                         # fade runs T-L .. T-g
    p = (np.arange(n) + 0.5) / n
    # Constant power for the measured correlation: equal gain when the two ends
    # are the same wave, equal power when unrelated, and a lift when they are
    # out of phase (two takes of one bass line), so the seam doesn't dip.
    fi, fo = p, 1 - p
    r = max(-0.8, min(1.0, rho))
    norm = np.sqrt(fi ** 2 + fo ** 2 + 2 * r * fi * fo)
    fi, fo = fi / norm, fo / norm
    i0 = T - L
    out[i0:i0 + n] = x[i0:i0 + n] * fo[:, None] + x[i0 - d:i0 - d + n] * fi[:, None]
    out[T - g:T + g] = x[T - g - d:T + g - d]
    f = int(FADE_IN * SR)
    out[:f] *= np.linspace(0, 1, f)[:, None]
    return out


def lufs(x):
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'a.wav')
        sf.write(wav, x, SR, subtype='FLOAT')
        r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128', '-f', 'null', '-'],
                           capture_output=True, text=True)
    line = [l for l in r.stderr.splitlines() if l.strip().startswith('I:')][-1]
    return float(line.split()[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('name')
    ap.add_argument('--usable-end', type=float)
    ap.add_argument('--xfade', type=float, default=0.5)
    ap.add_argument('--min-loop', type=float, default=12.0)
    a = ap.parse_args()

    x = decode(a.src)
    dur = len(x) / SR
    end = a.usable_end if a.usable_end else dur - 0.05
    print(f'{a.name}: {dur:.2f}s source, usable to {end:.2f}s')
    S, T, rho = find_loop(x, end, a.xfade, a.min_loop)
    y = bake(x, S, T, a.xfade, rho)
    gain_db = TARGET_LUFS - lufs(y[S:T])
    y *= 10 ** (gain_db / 20)
    # The intro plays once before the loop. Bring it to the loop's level so the
    # bed doesn't start hot and drop when the loop takes over.
    R = 2 * SR
    if S > R + SR:
        intro_db = TARGET_LUFS - lufs(y[:S - R])
        if abs(intro_db) > 1.0:
            g = 10 ** (intro_db / 20)
            y[:S - R] *= g
            y[S - R:S] *= np.linspace(g, 1, R)[:, None]
            print(f'  intro {intro_db:+.1f} dB to match the loop')
    peak = float(np.abs(y).max())
    if peak > 0.89:                                   # keep ~1 dB of headroom for the MP3
        y *= 0.89 / peak
        print(f'  peak-limited by {20 * np.log10(peak / 0.89):.1f} dB')

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, f'ghost-bg-{a.name}.mp3')
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'a.wav')
        sf.write(wav, y, SR, subtype='FLOAT')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k',
                        '-ar', str(SR), out], check=True)

    meta_path = os.path.join(OUT_DIR, 'beds.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    meta[a.name] = {'file': os.path.basename(out), 'loopStart': round(S / SR, 5), 'loopEnd': round(T / SR, 5)}
    with open(meta_path, 'w') as f:
        json.dump(dict(sorted(meta.items())), f, indent=2)
        f.write('\n')
    print(f'  loop {S / SR:.3f}s to {T / SR:.3f}s ({(T - S) / SR:.2f}s), gain {gain_db:+.1f} dB -> {out}')


if __name__ == '__main__':
    main()
