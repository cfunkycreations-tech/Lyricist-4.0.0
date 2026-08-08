#!/usr/bin/env python3
"""Kokoro TTS (ONNX) — the narrator engine for Lyricist's wizard cards.

Replaced Supertonic on 2026-08-07. Same terms — runs entirely on this machine,
no API key, no account, no per-word billing, nothing leaves the box — but it is
a more natural read. Kokoro-82M is Apache-2.0.

Files (downloaded once, build-time only, NOT shipped in the installer):
    V:\\models\\kokoro\\onnx\\model.onnx   325 MB, full precision on purpose:
                                          this runs once when baking narration,
                                          so there is no reason to take the
                                          quality hit of a quantised model.
    V:\\models\\kokoro\\voices-en.bin      29 English voices.

Voices: af_* American female, am_* American male, bf_*/bm_* British.
af_heart is the default and the best of them.
"""
import os
import numpy as np
import onnxruntime as ort
from kokoro_onnx.tokenizer import Tokenizer

MODEL = os.environ.get("KOKORO_MODEL", r"V:\models\kokoro\onnx\model.onnx")
VOICES = os.environ.get("KOKORO_VOICES", r"V:\models\kokoro\voices-en.bin")

SAMPLE_RATE = 24000
MAX_TOKENS = 508          # the model's style table is 510 rows; leave room for the pad tokens


class KokoroTTS:
    def __init__(self, model_path=MODEL, voices_path=VOICES):
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self.sess = ort.InferenceSession(model_path, opts, providers=["CPUExecutionProvider"])
        self.voices = np.load(voices_path)
        self.tokenizer = Tokenizer()

    def voice_names(self):
        return sorted(self.voices.files)

    def generate(self, texts, *, voice="af_heart", speed=1.0, lang="en-us"):
        """One waveform per input string, 24 kHz float32."""
        if voice not in self.voices.files:
            raise ValueError(f"Voice '{voice}' not found. Have: {', '.join(self.voice_names())}")
        style_table = self.voices[voice]

        out = []
        for text in texts:
            ids = self.tokenizer.tokenize(self.tokenizer.phonemize(text, lang=lang))
            if not ids:
                out.append(np.zeros(1, dtype=np.float32))
                continue
            if len(ids) > MAX_TOKENS:
                # Long input is chunked by the caller; this is the backstop that
                # keeps a stray long line from indexing off the style table.
                ids = ids[:MAX_TOKENS]
            style = style_table[len(ids)].astype(np.float32)
            wav = self.sess.run(None, {
                "input_ids": np.array([[0, *ids, 0]], dtype=np.int64),
                "style": style,
                "speed": np.array([speed], dtype=np.float32),
            })[0]
            out.append(np.asarray(wav).squeeze().astype(np.float32))
        return out
