LYRICIST 4.2.0 GOES QUANTUM — WIZARD NARRATION
==============================================

Voice:   Supertonic F2 (female), speed 1.05, 16 denoiser steps
Engine:  Supertonic TTS (ONNX) — onnx-community/Supertonic-TTS-2-ONNX, openrail
Model:   V:\models\supertonic-2   (263 MB, downloaded once)
Format:  MP3, 44.1 kHz mono, 96 kbps, loudness-normalised to -16 LUFS / -1.5 dBTP

Regenerate:      python scripts/generate-wizard-audio.py
Regenerate + QA: python scripts/generate-wizard-audio.py --qa
Different voice: python scripts/generate-wizard-audio.py --voice F4
One card:        python scripts/generate-wizard-audio.py --cards 5

Runs entirely on this machine. No API key, no account, no network, no per-word
cost — which is the point: the narration can always be rebuilt for free, and it
cannot break because someone else changed an endpoint. (The previous take used
Microsoft's Ava via edge-tts, which needed a live connection to their service.)

WHY F2
------
All five female voices were auditioned on the same line, then the audio was run
back through speech recognition and scored against the script. F2 tied for the
best word error rate AND stayed clean on the harder scripts full of product
names. F5 measured best on pure spectrum but slurred "Spotlight heats" into
"Spotlheats" — which is exactly why the ear test has to be a measurement and
not a guess. Full ranking is in the commit message.

TWO TRAPS, BOTH ALREADY HANDLED IN THE SCRIPT
---------------------------------------------
1. Capitalised "Lyricist" is pronounced "Larasist", and "4.2.0" is read as
   "4.0". The generator lowercases the name and spells the version out loud.
   Same for "WAV", which comes out as "WOWWOW" — it is sent as "wave".
   Verified fine as-is: AI, DNA, EQ, FX, MIDI, RC-Funk 5000, State A / B, 808.
2. Given a whole 130-word card the model silently DROPS phrases. Card-05 lost
   "run twelve gens spreads" mid-sentence. The generator synthesises one
   sentence at a time and stitches them with real pauses; that took card-05
   from 23.4% word error to 4.0%.

QA RESULT FOR THIS TAKE
-----------------------
Every clip transcribed back and scored: mean 6.5% word error, which is the
recognition engine's own error rate on synthetic speech. The worst number was
card-16 at 14.8%, and all four of its "errors" are the recogniser writing
compound words differently ("open router" for "openrouter", "songforge" for
"song forge") — the audio is correct.

card-01  Welcome
card-02  Songwriter
card-03  Ghost Rider + Style DNA
card-04  Song Forge (+ Quantum seed)
card-05  Quantum Lab — numbered buttons, no command bar
card-06  RC-Funk 5000 (loops + Delay/Reverb/Dub FX)
card-07  Recording Booth
card-08  MIDI Studio (synth + full viz pack)
card-09  Album Architect
card-10  Mastering Studio
card-11  Rhyme Helper
card-12  Thesaurus
card-13  Dictionary
card-14  AI Tools Hub
card-15  Scratch Pad
card-16  Settings
card-17  A note from the AI
