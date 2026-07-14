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

export interface AssistantSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  baseUrl: string;
  tone: ReplyTone;
  replyLength: "short" | "medium";
  replyCount: number;
  personalStyle: string;
  exampleReplies: string;
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
}

export interface ReplyDraft {
  text: string;
  recommended: boolean;
  rationale?: string;
}

export interface ReplyGenerationResult {
  replies: ReplyDraft[];
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
