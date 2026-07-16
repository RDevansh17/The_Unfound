import "../styles.css";
import { countExampleReplies, isVoiceReady, type AssistantSettings, type RuntimeResponse } from "../shared/types";

const status = document.querySelector<HTMLElement>("#status");
const statusText = document.querySelector<HTMLElement>(".status-text");
const statusPill = document.querySelector<HTMLElement>("#status-pill");
const voiceStrip = document.querySelector<HTMLElement>("#voice-strip");
const voiceTitle = document.querySelector<HTMLElement>("#voice-title");
const voiceMeta = document.querySelector<HTMLElement>("#voice-meta");
const optionsButton = document.querySelector<HTMLButtonElement>("#open-options");

optionsButton?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function setStatus(message: string, state: "ready" | "warning"): void {
  if (statusText) {
    statusText.textContent = message;
  }
  if (status) {
    status.dataset.state = state;
  }
}

function setVoiceState(settings: AssistantSettings): void {
  const examples = countExampleReplies(settings.exampleReplies);
  const ready = isVoiceReady(settings);

  if (!voiceStrip || !voiceTitle || !voiceMeta || !statusPill) {
    return;
  }

  if (ready) {
    voiceStrip.dataset.state = "ready";
    voiceTitle.textContent = "Voice ready";
    voiceMeta.textContent =
      examples > 0
        ? `${examples} example replies loaded · drafts will match your rhythm`
        : "Niche + style set · add example replies for even sharper voice";
    if (settings.apiKey) {
      statusPill.textContent = "Ready";
      statusPill.className = "pill pill-live";
    }
  } else {
    voiceStrip.dataset.state = "warn";
    voiceTitle.textContent = "Voice incomplete";
    voiceMeta.textContent =
      examples === 0
        ? "Add 3+ of your real replies in settings — biggest quality jump."
        : `${examples}/3 example replies · add a few more for stronger voice match`;
    statusPill.textContent = settings.apiKey ? "Voice" : "Setup";
    statusPill.className = "pill pill-warn";
  }
}

chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response: RuntimeResponse<AssistantSettings>) => {
  if (chrome.runtime.lastError || !response?.ok || !response.data) {
    setStatus("Open settings to finish setup.", "warning");
    return;
  }

  const settings = response.data;
  setVoiceState(settings);

  if (settings.apiKey) {
    setStatus(`Ready · ${formatProvider(settings.provider)} · ${settings.model}`, "ready");
  } else {
    setStatus("Add your API key in settings to start.", "warning");
  }
});

function formatProvider(provider: AssistantSettings["provider"]): string {
  switch (provider) {
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "gemini":
      return "Gemini";
    case "groq":
      return "Groq";
    case "openai-compatible":
      return "Custom API";
    default:
      return provider;
  }
}
