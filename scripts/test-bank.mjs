/**
 * Render every preset in a SoundFont through spessasynth_core and confirm it
 * makes sound.
 *
 * A malformed SF2 does not usually throw. It parses, loads, and renders
 * silence, which looks exactly like a working bank until you press a key. This
 * is the only check that actually proves the file is playable, and it runs
 * through the same synth the piano roll uses, not a different parser.
 */
import fs from 'fs';
import { SpessaSynthProcessor, SoundBankLoader } from 'spessasynth_core';

const file = process.argv[2] || 'V:/assets/suno-sounds/CFunky-Quantum.sf2';
const BANK = Number(process.argv[3] ?? 1);
const SR = 48000;

const buf = fs.readFileSync(file);
const bank = SoundBankLoader.fromArrayBuffer(
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
);

const presets = bank.presets.map(p => ({
  name: (p.name || '').trim(),
  program: p.program,
  bank: p.bank,
}));
console.log(`${file}`);
console.log(`parsed ${presets.length} presets, ${bank.samples.length} samples\n`);

const proc = new SpessaSynthProcessor(SR, { enableEffects: false });
await proc.processorInitialized;
proc.soundBankManager.addSoundBank(bank, 'test');

const CHUNK = 128;
let silent = 0;

for (const p of presets) {
  proc.stopAllChannels?.(true);
  // Bank select MSB then program change, the way a real MIDI host addresses a
  // non-zero bank.
  proc.controllerChange(0, 0, p.bank);
  proc.programChange(0, p.program);

  const total = Math.ceil(SR * 2.0);
  const hold = Math.ceil(SR * 1.5);
  const L = new Float32Array(CHUNK), R = new Float32Array(CHUNK);
  let peak = 0, energy = 0, n = 0;

  proc.noteOn(0, 60, 100);
  let released = false;
  for (let i = 0; i < total; i += CHUNK) {
    if (!released && i >= hold) { proc.noteOff(0, 60); released = true; }
    L.fill(0); R.fill(0);
    proc.process(L, R, 0, CHUNK);
    for (let j = 0; j < CHUNK; j++) {
      const v = Math.abs(L[j]) > Math.abs(R[j]) ? L[j] : R[j];
      peak = Math.max(peak, Math.abs(v));
      energy += v * v; n++;
    }
  }
  if (!released) proc.noteOff(0, 60);

  const rms = Math.sqrt(energy / n);
  const db = rms > 0 ? (20 * Math.log10(rms)).toFixed(1) : '-inf';
  const ok = rms > 0.0005;
  if (!ok) silent++;
  console.log(
    `${ok ? 'ok  ' : 'DEAD'}  bank ${String(p.bank).padStart(3)} prog ${String(p.program).padStart(3)}  ` +
    `peak ${peak.toFixed(3)}  rms ${String(db).padStart(6)} dB  ${p.name}`
  );
}

console.log(`\n${presets.length - silent}/${presets.length} presets produce audio`);
if (silent) { console.error(`${silent} SILENT presets`); process.exit(1); }
