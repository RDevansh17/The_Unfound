import "../styles.css";
import { PROVIDER_DEFAULTS, PROVIDER_MODELS } from "../shared/models";
import { getSettings, saveSettings } from "../shared/settings";
import type { AiProvider, AssistantSettings, ReplyTone } from "../shared/types";

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
const includeEmoji = document.querySelector<HTMLInputElement>("#includeEmoji");
const personalStyle = document.querySelector<HTMLTextAreaElement>("#personalStyle");
const saveStatus = document.querySelector<HTMLElement>("#save-status");

void hydrate();

provider?.addEventListener("change", () => {
  const nextProvider = provider.value as AiProvider;
  const defaults = PROVIDER_DEFAULTS[nextProvider];
  populateModelOptions(nextProvider, defaults.model);
  if (baseUrl) {
    baseUrl.value = defaults.baseUrl;
  }
  updateVisibility();
});

model?.addEventListener("change", () => {
  updateVisibility();
  if (model.value === "custom" && customModel) {
    customModel.focus();
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!provider || !model || !apiKey || !baseUrl || !tone || !replyLength || !includeEmoji || !personalStyle) {
    return;
  }

  const selectedModel =
    model.value === "custom" ? customModel?.value.trim() || PROVIDER_DEFAULTS["openai-compatible"].model : model.value;

  const settings: AssistantSettings = {
    provider: provider.value as AiProvider,
    apiKey: apiKey.value.trim(),
    model: selectedModel,
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

  if (!provider || !model || !apiKey || !baseUrl || !tone || !replyLength || !includeEmoji || !personalStyle) {
    return;
  }

  provider.value = settings.provider;
  populateModelOptions(settings.provider, settings.model);
  apiKey.value = settings.apiKey;
  baseUrl.value = settings.baseUrl || PROVIDER_DEFAULTS[settings.provider].baseUrl;
  tone.value = settings.tone;
  replyLength.value = settings.replyLength;
  includeEmoji.checked = settings.includeEmoji;
  personalStyle.value = settings.personalStyle;
  updateVisibility();
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
