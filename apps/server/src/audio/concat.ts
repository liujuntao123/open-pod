import fs from "node:fs";
import path from "node:path";
import wavefile from "wavefile";

const WaveFile = wavefile.WaveFile;
/** Default silence inserted between consecutive line audio during chapter assembly. */
export const DEFAULT_LINE_GAP_MS = 300;

type WavFmt = { sampleRate: number };

export function concatWavFiles(
  paths: string[],
  outPath: string,
  gapMs = DEFAULT_LINE_GAP_MS,
): void {
  if (paths.length === 0) throw new Error("没有可拼接的行音频");

  let sampleRate = 0;
  const pcmChunks: Int16Array[] = [];

  for (const p of paths) {
    const wav = new WaveFile(fs.readFileSync(p));
    wav.toBitDepth("16");
    const fmt = wav.fmt as WavFmt;
    if (!sampleRate) sampleRate = fmt.sampleRate;
    else if (fmt.sampleRate !== sampleRate) wav.toSampleRate(sampleRate);
    const samples = wav.getSamples(false, Int16Array) as unknown as Int16Array | Int16Array[];
    pcmChunks.push(Array.isArray(samples) ? mixToMono(samples) : samples);
  }

  const gapSamples = Math.floor((sampleRate * gapMs) / 1000);
  const gap = new Int16Array(gapSamples);

  let total = 0;
  for (let i = 0; i < pcmChunks.length; i++) {
    total += pcmChunks[i]!.length;
    if (i < pcmChunks.length - 1) total += gap.length;
  }

  const merged = new Int16Array(total);
  let offset = 0;
  for (let i = 0; i < pcmChunks.length; i++) {
    merged.set(pcmChunks[i]!, offset);
    offset += pcmChunks[i]!.length;
    if (i < pcmChunks.length - 1) {
      merged.set(gap, offset);
      offset += gap.length;
    }
  }

  const out = new WaveFile();
  out.fromScratch(1, sampleRate, "16", merged);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out.toBuffer());
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
