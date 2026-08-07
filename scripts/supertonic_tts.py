#!/usr/bin/env python3
"""Supertonic TTS (ONNX) — the narrator engine for Lyricist's wizard cards.

Runs entirely on this machine: no API key, no account, no per-word billing,
nothing leaves the box. Model is `onnx-community/Supertonic-TTS-2-ONNX`
(openrail), cached at V:\\models\\supertonic-2 — 263 MB, downloaded once.

Voices: F1-F5 female, M1-M5 male.

Inference pipeline is Supertone's own reference implementation from the model
card: tokenize -> text_encoder (predicts per-token duration) -> latent_denoiser
(a few diffusion steps) -> voice_decoder -> 44.1 kHz waveform.
"""
import os
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

MODEL_DIR = os.environ.get("SUPERTONIC_DIR", r"V:\models\supertonic-2")


class SupertonicTTS:
    SAMPLE_RATE = 44100
    CHUNK_COMPRESS_FACTOR = 6
    BASE_CHUNK_SIZE = 512
    LATENT_DIM = 24
    STYLE_DIM = 128
    LATENT_SIZE = BASE_CHUNK_SIZE * CHUNK_COMPRESS_FACTOR
    LANGUAGES = ["en", "ko", "es", "pt", "fr"]

    def __init__(self, model_path=MODEL_DIR):
        self.model_path = model_path
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path)
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self.text_encoder = ort.InferenceSession(os.path.join(model_path, "onnx", "text_encoder.onnx"), opts)
        self.latent_denoiser = ort.InferenceSession(os.path.join(model_path, "onnx", "latent_denoiser.onnx"), opts)
        self.voice_decoder = ort.InferenceSession(os.path.join(model_path, "onnx", "voice_decoder.onnx"), opts)

    def _load_style(self, voice):
        p = os.path.join(self.model_path, "voices", f"{voice}.bin")
        if not os.path.exists(p):
            raise ValueError(f"Voice '{voice}' not found in {self.model_path}/voices")
        return np.fromfile(p, dtype=np.float32).reshape(1, -1, self.STYLE_DIM)

    def generate(self, texts, *, voice="F1", speed=1.0, steps=16, language="en", seed=None):
        """Returns a list of float32 waveforms at 44.1 kHz, one per input string."""
        if language not in self.LANGUAGES:
            raise ValueError(f"Language '{language}' not supported")
        if seed is not None:
            np.random.seed(seed)  # same seed => same take, so a re-run is reproducible

        texts = [f"<{language}>{t}</{language}>" for t in texts]
        inputs = self.tokenizer(texts, return_tensors="np", padding=True, truncation=True)
        input_ids, attn_mask = inputs["input_ids"], inputs["attention_mask"]
        batch = input_ids.shape[0]

        style = self._load_style(voice).repeat(batch, axis=0)

        last_hidden_state, raw_durations = self.text_encoder.run(
            None, {"input_ids": input_ids, "attention_mask": attn_mask, "style": style}
        )
        durations = (raw_durations / speed * self.SAMPLE_RATE).astype(np.int64)

        latent_lengths = (durations + self.LATENT_SIZE - 1) // self.LATENT_SIZE
        max_len = latent_lengths.max()
        latent_mask = (np.arange(max_len) < latent_lengths[:, None]).astype(np.int64)
        latents = np.random.randn(batch, self.LATENT_DIM * self.CHUNK_COMPRESS_FACTOR, max_len).astype(np.float32)
        latents *= latent_mask[:, None, :]

        n_steps = np.full(batch, steps, dtype=np.float32)
        for step in range(steps):
            timestep = np.full(batch, step, dtype=np.float32)
            latents = self.latent_denoiser.run(
                None,
                {
                    "noisy_latents": latents,
                    "latent_mask": latent_mask,
                    "style": style,
                    "encoder_outputs": last_hidden_state,
                    "attention_mask": attn_mask,
                    "timestep": timestep,
                    "num_inference_steps": n_steps,
                },
            )[0]

        waveforms = self.voice_decoder.run(None, {"latents": latents})[0]
        return [waveforms[i, :length] for i, length in enumerate(latent_mask.sum(axis=1) * self.LATENT_SIZE)]
