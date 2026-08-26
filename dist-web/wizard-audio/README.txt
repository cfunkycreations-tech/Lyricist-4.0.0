LYRICIST 4.2.0 GOES QUANTUM — WIZARD NARRATION
==============================================

Voice:   Kokoro af_heart (American female), speed 1.0
Engine:  Kokoro-82M ONNX — onnx-community/Kokoro-82M-v1.0-ONNX, Apache-2.0
Model:   V:\models\kokoro\onnx\model.onnx (325 MB) + voices-en.bin (29 voices)
Format:  MP3, 24 kHz mono, 96 kbps, loudness-normalised to -16 LUFS / -1.5 dBTP

Regenerate:      python scripts/generate-wizard-audio.py
Regenerate + QA: python scripts/generate-wizard-audio.py --qa
Different voice: python scripts/generate-wizard-audio.py --voice af_bella
List voices:     python scripts/generate-wizard-audio.py --voice ?
One card:        python scripts/generate-wizard-audio.py --cards 5

The model is build-time only. It is NOT shipped in the installer — only these
baked MP3s are. Runs entirely on this machine: no API key, no account, no
network, no per-word cost. Nothing here can start charging money later or break
because somebody else changed an endpoint.

ENGINE HISTORY, AND WHY
  edge-tts / Microsoft Ava  — good, but every rebuild called their servers.
  Supertonic                — offline and free, but a flatter read.
  Kokoro-82M (now)          — offline, free, and measurably clearer.

Measured, not guessed. Every clip is transcribed back and scored against its
script. Supertonic averaged 6.2% word error across the set; Kokoro averages
3.0%, with eight of the eighteen cards at 0.0%. Same test, same script.

PRONUNCIATION
Only one substitution is still needed: "4.2.0" reads as "4, 2, 0", so the
generator spells it out. Kokoro says Lyricist, WAV, AI, DNA, EQ, FX, MIDI,
RC-Funk 5000, State A / State B, 808 and "gens" correctly with no help — all
verified by synthesising and transcribing them. Supertonic needed the name
lowercased or it said "Larasist", and "WAV" spelled "wave"; both hacks left
with it. Never add a substitution on a hunch — test it.

STILL TRUE WHATEVER THE ENGINE
  - Synthesise SENTENCE BY SENTENCE, never a whole card. Supertonic silently
    dropped phrases from long input; Kokoro is hard-limited to 510 style rows.
    Chunking also buys the pauses between sentences and paragraphs.
  - Keep a generous trim margin. At 20 ms the attack of the first consonant was
    getting cut and "Quantum Lab" shipped as "Quant Lab" — caught by pulling the
    clip back out of the installer's asar and transcribing THAT.
  - Always run --qa. Nobody can hear a bug report.

card-01  Welcome
card-02  Songwriter
card-03  Ghost Rider + Style DNA
card-04  Song Forge (+ Quantum seed)
card-05  Quantum Lab — numbered buttons, no command bar
card-18  Collaboration — peer to peer with a code
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
