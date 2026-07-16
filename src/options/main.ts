import "../styles.css";
import { PROVIDER_DEFAULTS, PROVIDER_MODELS } from "../shared/models";
import { getSettings, saveSettings } from "../shared/settings";
import {
  MAX_REPLY_COUNT,
  MIN_REPLY_COUNT,
  countExampleReplies,
  isVoiceReady,
  type AiProvider,
  type AssistantSettings,
  type BrandGoal,
  type ReplyTone
} from "../shared/types";

const form = document.querySelector<HTMLFormElement>("#settings-form");
const provider = document.querySelector<HTMLSelectElement>("#provider");
const model = document.querySelector<HTMLSelectElement>("#model");
const customModel = document.querySelector<HTMLInputElement>("#customModel");
const customModelRow = document.querySelector<HTMLElement>("#customModelRow");
const apiKey = document.querySelector<HTMLInputElement>("#apiKey");
const baseUrl = document.querySelector<HTMLInputElement>("#baseUrl");
const baseUrlRow = document.querySelector<HTMLElement>("#baseUrlRow");
const tone = document.querySelector<HTMLSelectElement>("#tone");
const replyLength = document.querySelector<HTMLSelectElement>("#replyLength");
const replyCount = document.querySelector<HTMLSelectElement>("#replyCount");
const includeEmoji = document.querySelector<HTMLInputElement>("#includeEmoji");
const personalStyle = document.querySelector<HTMLTextAreaElement>("#personalStyle");
const exampleReplies = document.querySelector<HTMLTextAreaElement>("#exampleReplies");
const niche = document.querySelector<HTMLInputElement>("#niche");
const brandGoal = document.querySelector<HTMLSelectElement>("#brandGoal");
const expertise = document.querySelector<HTMLTextAreaElement>("#expertise");
const beliefs = document.querySelector<HTMLTextAreaElement>("#beliefs");
const signaturePhrases = document.querySelector<HTMLTextAreaElement>("#signaturePhrases");
const avoidWords = document.querySelector<HTMLTextAreaElement>("#avoidWords");
const saveStatus = document.querySelector<HTMLElement>("#save-status");
const summaryProvider = document.querySelector<HTMLElement>("#summaryProvider");
const summaryModel = document.querySelector<HTMLElement>("#summaryModel");
const summaryTone = document.querySelector<HTMLElement>("#summaryTone");
const summaryKey = document.querySelector<HTMLElement>("#summaryKey");
const summaryVoice = document.querySelector<HTMLElement>("#summaryVoice");
const setupScore = document.querySelector<HTMLElement>("#setup-score");
const setupBarFill = document.querySelector<HTMLElement>("#setup-bar-fill");

const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  groq: "Groq",
  "openai-compatible": "Custom API"
};

void hydrate();

provider?.addEventListener("change", () => {
  const nextProvider = provider.value as AiProvider;
  const defaults = PROVIDER_DEFAULTS[nextProvider];
  populateModelOptions(nextProvider, defaults.model);
  if (baseUrl) {
    baseUrl.value = defaults.baseUrl;
  }
  updateVisibility();
  updateSummary();
});

model?.addEventListener("change", () => {
  updateVisibility();
  updateSummary();
  if (model.value === "custom" && customModel) {
    customModel.focus();
  }
});

[
  customModel,
  tone,
  apiKey,
  personalStyle,
  exampleReplies,
  niche,
  brandGoal,
  expertise,
  beliefs,
  signaturePhrases
].forEach((el) => {
  el?.addEventListener("input", updateSummary);
  el?.addEventListener("change", updateSummary);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!allControlsReady()) {
    return;
  }

  const selectedModel =
    model!.value === "custom"
      ? customModel!.value.trim() || PROVIDER_DEFAULTS["openai-compatible"].model
      : model!.value;

  const settings: AssistantSettings = {
    provider: provider!.value as AiProvider,
    apiKey: apiKey!.value.trim(),
    model: selectedModel,
    baseUrl: baseUrl!.value.trim(),
    tone: tone!.value as ReplyTone,
    replyLength: replyLength!.value as AssistantSettings["replyLength"],
    replyCount: clampReplyCount(replyCount!.value),
    includeEmoji: includeEmoji!.checked,
    personalStyle: personalStyle!.value.trim(),
    exampleReplies: exampleReplies!.value.trim(),
    niche: niche!.value.trim(),
    brandGoal: brandGoal!.value as BrandGoal,
    expertise: expertise!.value.trim(),
    beliefs: beliefs!.value.trim(),
    signaturePhrases: signaturePhrases!.value.trim(),
    avoidWords: avoidWords!.value.trim()
  };

  await saveSettings(settings);
  updateSummary();
  flashStatus("Saved.");
});

async function hydrate(): Promise<void> {
  const settings = await getSettings();
  if (!allControlsReady()) {
    return;
  }

  provider!.value = settings.provider;
  populateModelOptions(settings.provider, settings.model);
  apiKey!.value = settings.apiKey;
  baseUrl!.value = settings.baseUrl || PROVIDER_DEFAULTS[settings.provider].baseUrl;
  tone!.value = settings.tone;
  replyLength!.value = settings.replyLength;
  replyCount!.value = String(clampReplyCount(settings.replyCount));
  includeEmoji!.checked = settings.includeEmoji;
  personalStyle!.value = settings.personalStyle;
  exampleReplies!.value = settings.exampleReplies;
  niche!.value = settings.niche;
  brandGoal!.value = settings.brandGoal;
  expertise!.value = settings.expertise;
  beliefs!.value = settings.beliefs;
  signaturePhrases!.value = settings.signaturePhrases;
  avoidWords!.value = settings.avoidWords;
  updateVisibility();
  updateSummary();
}

function allControlsReady(): boolean {
  return Boolean(
    provider &&
      model &&
      apiKey &&
      baseUrl &&
      tone &&
      replyLength &&
      replyCount &&
      includeEmoji &&
      personalStyle &&
      exampleReplies &&
      niche &&
      brandGoal &&
      expertise &&
      beliefs &&
      signaturePhrases &&
      avoidWords
  );
}

function clampReplyCount(value: string | number): number {
  const parsed = typeof value === "number" ? value : parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 3;
  }
  return Math.min(Math.max(Math.round(parsed), MIN_REPLY_COUNT), MAX_REPLY_COUNT);
}

function currentModelValue(): string {
  if (!model) {
    return "—";
  }
  if (model.value === "custom") {
    return customModel?.value.trim() || "Custom model";
  }
  const selectedOption = model.options[model.selectedIndex];
  return selectedOption?.textContent?.trim() || model.value;
}

function updateSummary(): void {
  if (summaryProvider && provider) {
    summaryProvider.textContent = PROVIDER_LABELS[provider.value as AiProvider] || provider.value;
  }
  if (summaryModel) {
    summaryModel.textContent = currentModelValue();
  }
  if (summaryTone && tone) {
    const toneOption = tone.options[tone.selectedIndex];
    summaryTone.textContent = toneOption?.textContent?.trim() || tone.value;
  }
  if (summaryKey) {
    const hasKey = Boolean(apiKey?.value.trim());
    summaryKey.textContent = hasKey ? "Configured" : "Not set";
    summaryKey.dataset.state = hasKey ? "set" : "unset";
  }

  const examples = countExampleReplies(exampleReplies?.value || "");
  const voiceReady = isVoiceReady({
    exampleReplies: exampleReplies?.value || "",
    personalStyle: personalStyle?.value || "",
    niche: niche?.value || ""
  });

  if (summaryVoice) {
    summaryVoice.textContent = voiceReady
      ? examples > 0
        ? `${examples} examples`
        : "Style + niche"
      : examples > 0
        ? `${examples}/3 examples`
        : "Incomplete";
    summaryVoice.dataset.state = voiceReady ? "set" : "warn";
  }

  updateSetupMeter();
}

function updateSetupMeter(): void {
  let score = 0;
  if (apiKey?.value.trim()) score += 25;
  if (countExampleReplies(exampleReplies?.value || "") >= 3) score += 35;
  else if (countExampleReplies(exampleReplies?.value || "") > 0) score += 15;
  if (niche?.value.trim()) score += 15;
  if (personalStyle?.value.trim()) score += 10;
  if ((expertise?.value || "").trim() || (beliefs?.value || "").trim()) score += 15;

  if (setupScore) {
    setupScore.textContent = `${score}%`;
  }
  if (setupBarFill) {
    setupBarFill.style.width = `${score}%`;
  }
}

function populateModelOptions(nextProvider: AiProvider, selectedModel: string): void {
  if (!model) {
    return;
  }

  const options = PROVIDER_MODELS[nextProvider];
  const knownValues = new Set(options.map((option) => option.value));
  const useCustom = nextProvider === "openai-compatible" && selectedModel && !knownValues.has(selectedModel);

  model.innerHTML = "";
  options.forEach((option) => {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    model.append(element);
  });

  if (useCustom) {
    model.value = "custom";
    if (customModel) {
      customModel.value = selectedModel;
    }
  } else if (knownValues.has(selectedModel)) {
    model.value = selectedModel;
  } else {
    model.value = PROVIDER_DEFAULTS[nextProvider].model;
  }
}

function updateVisibility(): void {
  if (!provider || !baseUrlRow || !customModelRow) {
    return;
  }

  const needsBaseUrl = provider.value === "openai-compatible";
  baseUrlRow.hidden = !needsBaseUrl;
  customModelRow.hidden = !(provider.value === "openai-compatible" && model?.value === "custom");
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
