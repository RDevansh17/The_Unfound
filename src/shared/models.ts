import type { AiProvider } from "./types";

export interface ModelOption {
  value: string;
  label: string;
}

export const PROVIDER_MODELS: Record<AiProvider, ModelOption[]> = {
  openai: [
    { value: "gpt-4o", label: "GPT-4o — best all-round" },
    { value: "gpt-4o-mini", label: "GPT-4o mini — fast + cheap" },
    { value: "gpt-4.1", label: "GPT-4.1 — strong writing" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    { value: "gpt-4.1-nano", label: "GPT-4.1 nano — cheapest" },
    { value: "gpt-4.5-preview", label: "GPT-4.5 (preview)" },
    { value: "o3", label: "o3 — deep reasoning" },
    { value: "o3-mini", label: "o3-mini — reasoning, fast" },
    { value: "o4-mini", label: "o4-mini — reasoning, fast" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo — legacy" }
  ],
  anthropic: [
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
    { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku (fast)" },
    { value: "claude-3-opus-latest", label: "Claude 3 Opus" }
  ],
  gemini: [
    { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }
  ],
  groq: [
    { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
    { value: "llama-3.1-70b-versatile", label: "Llama 3.1 70B" },
    { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant" },
    { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B" }
  ],
  "openai-compatible": [
    { value: "gpt-4o", label: "gpt-4o" },
    { value: "gpt-4o-mini", label: "gpt-4o-mini" },
    { value: "custom", label: "Custom model name..." }
  ]
};

export const PROVIDER_DEFAULTS: Record<AiProvider, { model: string; baseUrl: string }> = {
  openai: { model: "gpt-4o", baseUrl: "https://api.openai.com/v1" },
  anthropic: { model: "claude-3-5-sonnet-latest", baseUrl: "" },
  gemini: { model: "gemini-2.0-flash", baseUrl: "" },
  groq: { model: "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" },
  "openai-compatible": { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" }
};
