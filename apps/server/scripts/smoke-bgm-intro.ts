import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import wavefile from "wavefile";
import { DEFAULT_BGM_INTRO_MS, mixVoiceWithBgm } from "../src/audio/mix-bgm.js";

const WaveFile = (
  wavefile as {
    WaveFile: new (buf?: Buffer) => {
      fromScratch: (ch: number, sr: number, bit: string, samples: Int16Array) => void;
      toBuffer: () => Uint8Array;
      toBitDepth: (bit: string) => void;
      getSamples: (interleaved: boolean, ctor: Int16ArrayConstructor) => Int16Array | Int16Array[];
    };
  }
).WaveFile;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bgm-intro-"));
const sr = 44100;

function writeTone(file: string, seconds: number, freq: number, amp = 8000): number {
  const n = Math.floor(sr * seconds);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * freq * i) / sr) * amp);
  }
  const w = new WaveFile();
  w.fromScratch(1, sr, "16", samples);
  fs.writeFileSync(file, w.toBuffer());
  return n;
}

const voice = path.join(tmp, "voice.wav");
const bgm = path.join(tmp, "bgm.wav");
const out = path.join(tmp, "out.wav");
const voiceN = writeTone(voice, 1.0, 440, 10000);
writeTone(bgm, 0.5, 220, 12000);

mixVoiceWithBgm({ voicePath: voice, bgmPath: bgm, outPath: out, volume01: 1 });

const outWav = new WaveFile(fs.readFileSync(out));
outWav.toBitDepth("16");
const raw = outWav.getSamples(false, Int16Array);
const samples = Array.isArray(raw) ? raw[0]! : raw;
const intro = Math.floor((sr * DEFAULT_BGM_INTRO_MS) / 1000);
const expected = intro + voiceN;
console.log({ DEFAULT_BGM_INTRO_MS, intro, expected, actual: samples.length });
if (samples.length !== expected) process.exit(1);

let introEnergy = 0;
for (let i = 0; i < Math.min(intro, samples.length); i++) {
  introEnergy += Math.abs(samples[i]!);
}
console.log({ introEnergy, after: Math.abs(samples[intro]!) });
if (introEnergy === 0) process.exit(2);
console.log("ok");
