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
  | "professional";

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
  sourceUrl: string;
  variant?: ReplyVariant;
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
