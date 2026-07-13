import "../styles.css";
import type { AssistantSettings, RuntimeResponse } from "../shared/types";

const status = document.querySelector<HTMLElement>("#status");
const optionsButton = document.querySelector<HTMLButtonElement>("#open-options");

optionsButton?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response: RuntimeResponse<AssistantSettings>) => {
  if (!status) {
    return;
  }

  if (chrome.runtime.lastError || !response?.ok || !response.data) {
    status.textContent = "Open settings to finish setup.";
    status.dataset.state = "warning";
    return;
  }

  if (response.data.apiKey) {
    status.textContent = `Ready · ${formatProvider(response.data.provider)} · ${response.data.model}`;
    status.dataset.state = "ready";
  } else {
    status.textContent = "Add your API key in Settings to start drafting replies.";
    status.dataset.state = "warning";
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
