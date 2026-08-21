import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PresetTrackDto } from "@open-pod/shared";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Built-in assets live next to server package: apps/server/assets/bgm */
export const BGM_ASSETS_DIR = path.resolve(HERE, "../../assets/bgm");

type PresetDef = PresetTrackDto & { file: string };

const PRESETS: PresetDef[] = [
  {
    id: "canon-piano",
    name: "卡农 经典钢琴版",
    description: "dylanf · 经典钢琴",
    file: "canon-piano.wav",
  },
  {
    id: "humoresque-dvorak",
    name: "幽默曲",
    description: "德沃夏克",
    file: "humoresque-dvorak.wav",
  },
  {
    id: "minuet-in-d-bach",
    name: "D大调小步舞曲",
    description: "巴赫",
    file: "minuet-in-d-bach.wav",
  },
  {
    id: "prelude-in-e-bach",
    name: "E大调前奏曲",
    description: "巴赫",
    file: "prelude-in-e-bach.wav",
  },
  {
    id: "ode-to-joy-beethoven",
    name: "欢乐颂",
    description: "贝多芬 · 第九交响曲",
    file: "ode-to-joy-beethoven.wav",
  },
  {
    id: "fate-symphony-beethoven",
    name: "命运交响曲",
    description: "贝多芬",
    file: "fate-symphony-beethoven.wav",
  },
  {
    id: "tchaikovsky-selection",
    name: "柴可夫斯基精选",
    description: "柴可夫斯基",
    file: "tchaikovsky-selection.wav",
  },
  {
    id: "liebestraum-liszt",
    name: "爱之梦",
    description: "李斯特",
    file: "liebestraum-liszt.wav",
  },
  {
    id: "piano-dance-debussy",
    name: "钢琴舞曲",
    description: "德彪西",
    file: "piano-dance-debussy.wav",
  },
  {
    id: "fantasia-haydn",
    name: "幻想曲",
    description: "海顿",
    file: "fantasia-haydn.wav",
  },
  {
    id: "rondo-mozart",
    name: "回旋曲",
    description: "莫扎特",
    file: "rondo-mozart.wav",
  },
  {
    id: "military-march-schubert",
    name: "军队进行曲",
    description: "舒伯特",
    file: "military-march-schubert.wav",
  },
  {
    id: "harmonious-blacksmith-handel",
    name: "快乐的铁匠",
    description: "亨德尔",
    file: "harmonious-blacksmith-handel.wav",
  },
  {
    id: "blue-danube-strauss",
    name: "蓝色多瑙河",
    description: "约翰·施特劳斯",
    file: "blue-danube-strauss.wav",
  },
  {
    id: "wedding-of-dreams-clayderman",
    name: "梦中的婚礼",
    description: "理查德·克莱德曼",
    file: "wedding-of-dreams-clayderman.wav",
  },
  {
    id: "autumn-whisper-clayderman",
    name: "秋日的私语",
    description: "理查德·克莱德曼",
    file: "autumn-whisper-clayderman.wav",
  },
  {
    id: "adeline-by-water-clayderman",
    name: "水边的阿狄丽娜",
    description: "理查德·克莱德曼 · Ballade pour Adeline",
    file: "adeline-by-water-clayderman.wav",
  },
  {
    id: "serenade-schubert",
    name: "小夜曲",
    description: "舒伯特",
    file: "serenade-schubert.wav",
  },
  {
    id: "berceuse-grieg",
    name: "摇篮曲",
    description: "格里格",
    file: "berceuse-grieg.wav",
  },
  {
    id: "moonlight-sonata-beethoven",
    name: "月光奏鸣曲",
    description: "贝多芬",
    file: "moonlight-sonata-beethoven.wav",
  },
];

export function listPresetTracks(): PresetTrackDto[] {
  return PRESETS.map(({ id, name, description }) => ({ id, name, description }));
}

export function getPresetTrack(id: string): PresetDef | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function resolvePresetAudioPath(id: string): string | null {
  const preset = getPresetTrack(id);
  if (!preset) return null;
  const full = path.join(BGM_ASSETS_DIR, preset.file);
  if (!fs.existsSync(full)) return null;
  return full;
}

export function assertPresetAvailable(id: string): { ok: true; path: string } | { ok: false; error: string } {
  const preset = getPresetTrack(id);
  if (!preset) {
    return { ok: false, error: `预置曲目不存在：${id}` };
  }
  const full = path.join(BGM_ASSETS_DIR, preset.file);
  if (!fs.existsSync(full)) {
    return { ok: false, error: `预置曲目音频不可用：${preset.name}` };
  }
  return { ok: true, path: full };
}

export function clampBgmVolume(value: unknown, fallback = 45): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Chapter BGM-only lead-in seconds before speech; default 3, range 0–30. */
export function clampBgmIntroSeconds(value: unknown, fallback = 3): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(30, Math.round(n)));
}
