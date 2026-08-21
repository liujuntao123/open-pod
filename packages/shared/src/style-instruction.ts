/**
 * Built-in MiMo character style_instruction presets.
 *
 * Copy focuses on vocal delivery only (who + how it sounds): tone, energy,
 * pace, warmth. Avoid content strategy or scene-plot narration — those do
 * little for TTS. Users pick a chip to fill the field, then may edit before save.
 */

export type StyleInstructionTemplateId =
  | "duo-host"
  | "duo-guest"
  | "solo-host"
  | "book-explainer"
  | "book-questioner"
  | "audiobook-narrator"
  | "drama-character"
  | "interview-host"
  | "interview-guest"
  | "essay-reader"
  | "news-anchor"
  | "warm-companion";

export type StyleInstructionTemplate = {
  id: StyleInstructionTemplateId;
  label: string;
  /** Short chip subtitle / tooltip. */
  hint: string;
  /** Ready-to-use style_instruction body (paste into param override). */
  text: string;
};

/** Preset role archetypes with built-in style_instruction copy. */
export const STYLE_INSTRUCTION_TEMPLATES: readonly StyleInstructionTemplate[] = [
  {
    id: "duo-host",
    label: "播客主持人",
    hint: "轻松明快",
    text: "请扮演双人播客主持人，说话语气轻松亲切，节奏偏明快，声音明亮有活力。",
  },
  {
    id: "duo-guest",
    label: "播客嘉宾",
    hint: "自然有思考感",
    text: "请扮演双人播客嘉宾，说话口语自然，语气真诚投入，语速适中，带一点自然的思考停顿。",
  },
  {
    id: "solo-host",
    label: "单人主播",
    hint: "亲和清楚",
    text: "请扮演单人播客主讲人，说话像跟听众聊天，语气亲和清楚，节奏稳，重点处略加重。",
  },
  {
    id: "book-explainer",
    label: "书籍讲解者",
    hint: "沉稳耐心",
    text: "请扮演书籍解读讲解者，说话沉稳耐心，语速中等偏稳，语气清晰有分享感。",
  },
  {
    id: "book-questioner",
    label: "书籍提问者",
    hint: "好奇热情",
    text: "请扮演书籍解读播客里的提问者，说话语气好奇、热情、利落。",
  },
  {
    id: "audiobook-narrator",
    label: "有声书旁白",
    hint: "平稳清楚",
    text: "请扮演有声书旁白，说话口齿清楚、叙事平稳，语气中性略带画面感，不做夸张表演。",
  },
  {
    id: "drama-character",
    label: "广播剧角色",
    hint: "有情绪起伏",
    text: "请扮演广播剧人物，说话像当场对白，情绪和关系感更强，节奏可随情绪起伏，吐字仍要清楚。",
  },
  {
    id: "interview-host",
    label: "访谈主持人",
    hint: "专业利落",
    text: "请扮演访谈主持人，说话专业礼貌、吐字利落，语气稳、节奏偏短促。",
  },
  {
    id: "interview-guest",
    label: "访谈嘉宾",
    hint: "清楚从容",
    text: "请扮演访谈嘉宾，说话清楚从容，语气专业但不端着，重点处略强调。",
  },
  {
    id: "essay-reader",
    label: "散文朗读者",
    hint: "偏缓有质感",
    text: "请扮演散文朗读者，说话气息平稳、咬字清晰，语速偏缓，带一点文学质感，不过度煽情。",
  },
  {
    id: "news-anchor",
    label: "资讯主播",
    hint: "中性稳重",
    text: "请扮演资讯主播，说话吐字清楚、节奏稳，语气中性偏认真，少用语气词。",
  },
  {
    id: "warm-companion",
    label: "温暖陪伴",
    hint: "轻柔偏慢",
    text: "请扮演温暖陪伴型说话人，说话温柔轻柔，语速偏慢，语气亲切安抚，不矫揉造作。",
  },
] as const;

export function getStyleInstructionTemplate(
  id: string,
): StyleInstructionTemplate | undefined {
  return STYLE_INSTRUCTION_TEMPLATES.find((t) => t.id === id);
}
