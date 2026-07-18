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
  personalStyle: string;
  includeEmoji: boolean;
}

export type ReplyVariant =
  | "agree"
  | "contrarian"
  | "question"
  | "supportive"
  | "witty"
  | "humorous"
  | "professional";

/** Modes for regenerating a full batch of replies */
export type BatchRegenMode = "fresh" | "shorter" | "questions" | "new_angles" | "natural";

export interface ReplyGenerationRequest {
  targetText: string;
  targetAuthor?: string;
  targetHandle?: string;
  isTargetMine: boolean;
  /** Public HTTPS image URLs attached to the target post (usually pbs.twimg.com). */
  targetImageUrls?: string[];
  rootText?: string;
  rootAuthor?: string;
  rootHandle?: string;
  isRootMine: boolean;
  /** Images on the original/root post when replying in a thread. */
  rootImageUrls?: string[];
  isReply: boolean;
  sourceUrl: string;
  variant?: ReplyVariant;
  batchMode?: BatchRegenMode;
  count?: number;
}

export interface ReplyGenerationResult {
  replies: string[];
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
