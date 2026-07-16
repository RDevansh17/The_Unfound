export type AiProvider = "openai" | "anthropic" | "gemini" | "groq" | "openai-compatible";

export type ReplyTone =
  | "friendly"
  | "professional"
  | "witty"
  | "supportive"
  | "contrarian"
  | "concise"
  | "thought-leader"
  | "question";

export type BrandGoal = "grow" | "authority" | "network" | "engage";

export interface AssistantSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  tone: ReplyTone;
  replyLength: "short" | "medium";
  replyCount: number;
  /** Who you are on X — role, energy, what you never sound like */
  personalStyle: string;
  /** Real replies you've posted — primary voice signal */
  exampleReplies: string;
  /** Niche / domain you want to be known for */
  niche: string;
  /** Expertise bullets or topics you speak from */
  expertise: string;
  /** Beliefs / hot takes that shape your POV */
  beliefs: string;
  /** Phrases you often use (optional brand fingerprints) */
  signaturePhrases: string;
  /** What you're optimizing replies for */
  brandGoal: BrandGoal;
  avoidWords: string;
  includeEmoji: boolean;
}

export const MIN_REPLY_COUNT = 1;
export const MAX_REPLY_COUNT = 6;

export type ReplyVariant =
  | "agree"
  | "contrarian"
  | "question"
  | "supportive"
  | "witty"
  | "humorous"
  | "professional";

export interface ThreadItem {
  author?: string;
  handle?: string;
  text: string;
  isMine: boolean;
  isTarget: boolean;
}

export interface ReplyInsight {
  post_meaning: string;
  author_intent: string;
  anchor_phrase: string;
  your_take: string;
}

export interface ReplyGenerationRequest {
  targetText: string;
  targetAuthor?: string;
  targetHandle?: string;
  isTargetMine: boolean;
  rootText?: string;
  rootAuthor?: string;
  rootHandle?: string;
  isRootMine: boolean;
  isReply: boolean;
  thread?: ThreadItem[];
  visibility?: "high" | "low";
  sourceUrl: string;
  variant?: ReplyVariant;
  count?: number;
  insight?: ReplyInsight;
}

export interface ReplyDraft {
  text: string;
  recommended: boolean;
  rationale?: string;
  angle?: string;
}

export interface ReplyGenerationResult {
  replies: ReplyDraft[];
  insight?: ReplyInsight;
  voiceReady?: boolean;
}

export type RuntimeRequest =
  | {
      type: "GENERATE_REPLIES";
      payload: ReplyGenerationRequest;
    }
  | {
      type: "GET_SETTINGS";
    };

export interface RuntimeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export function countExampleReplies(value: string): number {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export function isVoiceReady(settings: Pick<AssistantSettings, "exampleReplies" | "personalStyle" | "niche">): boolean {
  return countExampleReplies(settings.exampleReplies) >= 3 || Boolean(settings.personalStyle.trim() && settings.niche.trim());
}
