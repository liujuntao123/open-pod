import fs from "node:fs";
import path from "node:path";
import wavefile from "wavefile";

const WaveFile = wavefile.WaveFile;

type WavFmt = { sampleRate: number };

export type SubtitleCue = {
  startMs: number;
  endMs: number;
  text: string;
};

/** Read mono/multi-channel WAV duration in milliseconds. */
export function wavDurationMs(filePath: string): number {
  const wav = new WaveFile(fs.readFileSync(filePath));
  wav.toBitDepth("16");
  const fmt = wav.fmt as WavFmt;
  const samples = wav.getSamples(false, Int16Array) as unknown as Int16Array | Int16Array[];
  const pcm = Array.isArray(samples) ? samples[0]! : samples;
  if (!fmt.sampleRate || pcm.length === 0) return 0;
  return Math.round((pcm.length / fmt.sampleRate) * 1000);
}

/**
 * Build dialogue-only subtitle cues aligned to chapter assembly:
 * optional BGM intro offset, then each playable line duration + inter-line gap.
 */
export function buildDialogueCues(opts: {
  segments: { audioPath: string; text: string }[];
  gapMs: number;
  offsetMs?: number;
}): SubtitleCue[] {
  const gapMs = Math.max(0, opts.gapMs);
  let cursor = Math.max(0, opts.offsetMs ?? 0);
  const cues: SubtitleCue[] = [];

  for (let i = 0; i < opts.segments.length; i++) {
    const seg = opts.segments[i]!;
    const dur = wavDurationMs(seg.audioPath);
    const text = normalizeSubtitleText(seg.text);
    if (text && dur > 0) {
      cues.push({
        startMs: cursor,
        endMs: cursor + dur,
        text,
      });
    }
    cursor += dur;
    if (i < opts.segments.length - 1) cursor += gapMs;
  }

  return cues;
}

/**
 * Strip control noise; keep spoken dialogue only (no speaker name).
 *
 * Removes square-bracket performance / emotion / paralinguistic tags used in
 * the studio script dialect and Fish S2 cues, e.g. `[长停顿]`, `[思考]`,
 * `[开心]`, `[emphasis]`, `[happy]`. Timing still follows the full line audio.
 */
export function normalizeSubtitleText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    // Cap inner length so a stray unclosed `[` does not swallow the line.
    .replace(/\[[^\]\n]{0,40}\]/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t\u00a0]+/g, " ")
        // Drop space left before CJK / Western punctuation after tag removal.
        .replace(/ +(?=[，。！？；：、,.!?;:…])/g, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function formatSrt(cues: SubtitleCue[]): string {
  const blocks: string[] = [];
  let index = 1;
  for (const cue of cues) {
    if (!cue.text) continue;
    const start = Math.max(0, cue.startMs);
    const end = Math.max(start + 1, cue.endMs);
    blocks.push(
      `${index}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${cue.text}`,
    );
    index += 1;
  }
  return blocks.length > 0 ? `${blocks.join("\n\n")}\n` : "";
}

export function formatSrtTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const millis = total % 1000;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)},${pad3(millis)}`;
}

export function writeSrtFile(outPath: string, cues: SubtitleCue[]): string {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = formatSrt(cues);
  fs.writeFileSync(outPath, body, "utf8");
  return outPath;
}

/** Sibling `.srt` path for a chapter export WAV. */
export function chapterSrtPathFromWav(wavPath: string): string {
  return wavPath.replace(/\.wav$/i, ".srt");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}
