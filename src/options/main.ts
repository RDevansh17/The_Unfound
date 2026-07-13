import "../styles.css";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../shared/settings";
import type { AiProvider, AssistantSettings, ReplyTone } from "../shared/types";

const form = document.querySelector<HTMLFormElement>("#settings-form");
const provider = document.querySelector<HTMLSelectElement>("#provider");
const apiKey = document.querySelector<HTMLInputElement>("#apiKey");
const model = document.querySelector<HTMLInputElement>("#model");
const baseUrl = document.querySelector<HTMLInputElement>("#baseUrl");
const baseUrlRow = document.querySelector<HTMLElement>("#baseUrlRow");
const tone = document.querySelector<HTMLSelectElement>("#tone");
const replyLength = document.querySelector<HTMLSelectElement>("#replyLength");
const includeEmoji = document.querySelector<HTMLInputElement>("#includeEmoji");
const personalStyle = document.querySelector<HTMLTextAreaElement>("#personalStyle");
const saveStatus = document.querySelector<HTMLElement>("#save-status");

const providerDefaults: Record<AiProvider, Pick<AssistantSettings, "model" | "baseUrl">> = {
  openai: { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" },
  anthropic: { model: "claude-3-5-haiku-latest", baseUrl: "" },
  gemini: { model: "gemini-1.5-flash", baseUrl: "" },
  groq: { model: "llama-3.1-70b-versatile", baseUrl: "https://api.groq.com/openai/v1" },
  "openai-compatible": { model: "gpt-4o-mini", baseUrl: "https://api.openai.com/v1" }
};

void hydrate();

provider?.addEventListener("change", () => {
  if (!provider || !model || !baseUrl) {
    return;
  }

  const defaults = providerDefaults[provider.value as AiProvider];
  model.value = defaults.model;
  baseUrl.value = defaults.baseUrl;
  updateBaseUrlVisibility();
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!provider || !apiKey || !model || !baseUrl || !tone || !replyLength || !includeEmoji || !personalStyle) {
    return;
  }

  const settings: AssistantSettings = {
    provider: provider.value as AiProvider,
    apiKey: apiKey.value.trim(),
    model: model.value.trim(),
    baseUrl: baseUrl.value.trim(),
    tone: tone.value as ReplyTone,
    replyLength: replyLength.value as AssistantSettings["replyLength"],
    includeEmoji: includeEmoji.checked,
    personalStyle: personalStyle.value.trim()
  };

  await saveSettings(settings);
  flashStatus("Saved.");
});

async function hydrate(): Promise<void> {
  const settings = await getSettings();

  if (!provider || !apiKey || !model || !baseUrl || !tone || !replyLength || !includeEmoji || !personalStyle) {
    return;
  }

  provider.value = settings.provider;
  apiKey.value = settings.apiKey;
  model.value = settings.model || providerDefaults[settings.provider].model;
  baseUrl.value = settings.baseUrl || providerDefaults[settings.provider].baseUrl;
  tone.value = settings.tone;
  replyLength.value = settings.replyLength;
  includeEmoji.checked = settings.includeEmoji;
  personalStyle.value = settings.personalStyle;
  updateBaseUrlVisibility();
}

function updateBaseUrlVisibility(): void {
  if (!provider || !baseUrlRow) {
    return;
  }

  const needsBaseUrl = provider.value === "openai-compatible";
  baseUrlRow.hidden = !needsBaseUrl;
}

function flashStatus(message: string): void {
  if (!saveStatus) {
    return;
  }

  saveStatus.textContent = message;
  window.setTimeout(() => {
    saveStatus.textContent = "";
  }, 2500);
}

void DEFAULT_SETTINGS;
