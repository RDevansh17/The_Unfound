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

export interface ReplyGenerationRequest {
  postText: string;
  authorName?: string;
  sourceUrl: string;
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
