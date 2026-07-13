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

  status.textContent = response.data.apiKey
    ? `${formatProvider(response.data.provider)} is configured.`
    : "Add an AI provider API key before using the assistant.";
  status.dataset.state = response.data.apiKey ? "ready" : "warning";
});

function formatProvider(provider: AssistantSettings["provider"]): string {
  return provider
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
