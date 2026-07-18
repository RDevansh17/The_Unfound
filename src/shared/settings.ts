import type { AssistantSettings } from "./types";

const SETTINGS_KEY = "xReplyAssistant.settings";

export const DEFAULT_SETTINGS: AssistantSettings = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o",
  baseUrl: "https://api.openai.com/v1",
  tone: "friendly",
  replyLength: "short",
  personalStyle: "",
  includeEmoji: false
};

export async function getSettings(): Promise<AssistantSettings> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored[SETTINGS_KEY] as Partial<AssistantSettings> | undefined)
  };
}

export async function saveSettings(settings: AssistantSettings): Promise<void> {
  await chrome.storage.sync.set({
    [SETTINGS_KEY]: {
      ...DEFAULT_SETTINGS,
      ...settings
    }
  });
}
