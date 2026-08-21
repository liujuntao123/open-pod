import fs from "node:fs";
import path from "node:path";
import wavefile from "wavefile";

const WaveFile = wavefile.WaveFile;

type WavFmt = { sampleRate: number };

/**
 * Mix a voice WAV with a BGM WAV:
 * - optional BGM-only intro (chapter-configurable; default 3s) before voice starts
 * - loop BGM across intro + full voice length
 * - apply relative volume; write mono 16-bit WAV
 *
 * volume01 is 0..1 where 1 = preset standard accompaniment level
 * (further scaled by STANDARD_BGM_GAIN so full scale does not bury speech).
 */
const STANDARD_BGM_GAIN = 0.28;
/** Default BGM-only lead-in before speech when chapter does not specify one. */
export const DEFAULT_BGM_INTRO_MS = 3000;

export function mixVoiceWithBgm(opts: {
  voicePath: string;
  bgmPath: string;
  outPath: string;
  /** 0–1 relative volume from chapter setting / 100 */
  volume01: number;
  /** BGM-only lead-in before voice; default {@link DEFAULT_BGM_INTRO_MS}. */
  introMs?: number;
}): void {
  const voice = readMonoPcm(opts.voicePath);
  const bgm = readMonoPcm(opts.bgmPath, voice.sampleRate);

  if (bgm.pcm.length === 0) {
    throw new Error("背景音乐音频为空");
  }

  const introMs = opts.introMs ?? DEFAULT_BGM_INTRO_MS;
  const introSamples = Math.max(0, Math.floor((voice.sampleRate * introMs) / 1000));
  const totalSamples = introSamples + voice.pcm.length;

  const gain = Math.max(0, Math.min(1, opts.volume01)) * STANDARD_BGM_GAIN;
  const out = new Int16Array(totalSamples);
  const bgmLen = bgm.pcm.length;

  for (let i = 0; i < totalSamples; i++) {
    const b = bgm.pcm[i % bgmLen]! * gain;
    const v = i < introSamples ? 0 : voice.pcm[i - introSamples]!;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(v + b)));
  }

  const wav = new WaveFile();
  wav.fromScratch(1, voice.sampleRate, "16", out);
  fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
  fs.writeFileSync(opts.outPath, wav.toBuffer());
}

function readMonoPcm(
  filePath: string,
  targetRate?: number,
): { sampleRate: number; pcm: Int16Array } {
  const wav = new WaveFile(fs.readFileSync(filePath));
  wav.toBitDepth("16");
  const fmt = wav.fmt as WavFmt;
  if (targetRate && fmt.sampleRate !== targetRate) {
    wav.toSampleRate(targetRate);
  }
  const samples = wav.getSamples(false, Int16Array) as unknown as Int16Array | Int16Array[];
  const pcm = Array.isArray(samples) ? mixToMono(samples) : samples;
  const sampleRate = targetRate ?? (wav.fmt as WavFmt).sampleRate;
  return { sampleRate, pcm };
}

function mixToMono(channels: Int16Array[]): Int16Array {
  const len = channels[0]?.length ?? 0;
  const out = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i] ?? 0;
    out[i] = Math.max(-32768, Math.min(32767, Math.round(sum / channels.length)));
  }
  return out;
}
