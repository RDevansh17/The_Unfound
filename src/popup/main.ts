import "../styles.css";
import type { AssistantSettings, RuntimeResponse } from "../shared/types";

const status = document.querySelector<HTMLElement>("#status");
const statusText = document.querySelector<HTMLElement>(".status-text");
const optionsButton = document.querySelector<HTMLButtonElement>("#open-options");

optionsButton?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function setStatus(message: string, state: "ready" | "warning"): void {
  if (statusText) {
    statusText.textContent = message;
  } else if (status) {
    status.textContent = message;
  }
  if (status) {
    status.dataset.state = state;
  }
}

chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response: RuntimeResponse<AssistantSettings>) => {
  if (chrome.runtime.lastError || !response?.ok || !response.data) {
    setStatus("Open settings to finish setup.", "warning");
    return;
  }

  if (response.data.apiKey) {
    setStatus(`Ready · ${formatProvider(response.data.provider)} · ${response.data.model}`, "ready");
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
