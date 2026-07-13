import { getSettings } from "../shared/settings";
import type {
  AssistantSettings,
  ReplyGenerationRequest,
  ReplyGenerationResult,
  RuntimeRequest,
  RuntimeResponse
} from "../shared/types";

const SYSTEM_PROMPT = `You are a premium social media reply assistant for X.
Write replies that sound natural, specific, and human. Avoid engagement bait, spam, generic praise, hashtags, and over-selling.
Return only valid JSON in this exact shape: {"replies":["reply 1","reply 2","reply 3"]}.`;

chrome.runtime.onMessage.addListener(
  (request: RuntimeRequest, _sender, sendResponse: (response: RuntimeResponse) => void) => {
    handleRequest(request)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Something went wrong."
        });
      });

    return true;
  }
);

async function handleRequest(request: RuntimeRequest): Promise<unknown> {
  if (request.type === "GET_SETTINGS") {
    const settings = await getSettings();
    return {
      ...settings,
      apiKey: settings.apiKey ? "configured" : ""
    };
  }

  if (request.type === "GENERATE_REPLIES") {
    const settings = await getSettings();
    if (!settings.apiKey.trim()) {
      throw new Error("Add your AI provider API key in the extension settings first.");
    }

    return generateReplies(settings, request.payload);
  }

  throw new Error("Unsupported request.");
}

async function generateReplies(
  settings: AssistantSettings,
  request: ReplyGenerationRequest
): Promise<ReplyGenerationResult> {
  const prompt = buildUserPrompt(settings, request);

  switch (settings.provider) {
    case "anthropic":
      return callAnthropic(settings, prompt);
    case "gemini":
      return callGemini(settings, prompt);
    case "groq":
      return callOpenAiCompatible(
        {
          ...settings,
          baseUrl: "https://api.groq.com/openai/v1",
          model: settings.model || "llama-3.1-70b-versatile"
        },
        prompt
      );
    case "openai-compatible":
      return callOpenAiCompatible(settings, prompt);
    case "openai":
    default:
      return callOpenAiCompatible(
        {
          ...settings,
          baseUrl: "https://api.openai.com/v1",
          model: settings.model || "gpt-4o-mini"
        },
        prompt
      );
  }
}

function buildUserPrompt(settings: AssistantSettings, request: ReplyGenerationRequest): string {
  const length = settings.replyLength === "short" ? "1 sentence, under 220 characters" : "1-2 sentences";
  const emojiRule = settings.includeEmoji ? "Emoji is allowed if it feels natural." : "Do not use emoji.";
  const style = settings.personalStyle.trim()
    ? `Match this personal writing style: ${settings.personalStyle.trim()}`
    : "Use clear, direct language.";

  return [
    `Draft 3 possible X replies to ${request.authorName ? `${request.authorName}'s` : "this"} post or reply.`,
    `Tone: ${settings.tone}.`,
    `Length: ${length}.`,
    emojiRule,
    style,
    `Current page URL: ${request.sourceUrl}`,
    "Post/reply text:",
    request.postText
  ].join("\n");
}

async function callOpenAiCompatible(
  settings: AssistantSettings,
  prompt: string
): Promise<ReplyGenerationResult> {
  const baseUrl = settings.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await parseProviderResponse(response);
  const content = data.choices?.[0]?.message?.content;
  return normalizeReplies(content);
}

async function callAnthropic(settings: AssistantSettings, prompt: string): Promise<ReplyGenerationResult> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: settings.model || "claude-3-5-haiku-latest",
      max_tokens: 500,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await parseProviderResponse(response);
  const content = data.content?.find((item: { type?: string }) => item.type === "text")?.text;
  return normalizeReplies(content);
}

async function callGemini(settings: AssistantSettings, prompt: string): Promise<ReplyGenerationResult> {
  const model = settings.model || "gemini-1.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.7,
          responseMimeType: "application/json"
        },
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ]
      })
    }
  );

  const data = await parseProviderResponse(response);
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return normalizeReplies(content);
}

async function parseProviderResponse(response: Response): Promise<any> {
  const text = await response.text();
  let data: any;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data.error?.message || data.message || response.statusText;
    throw new Error(`AI provider error: ${message}`);
  }

  return data;
}

function normalizeReplies(content: unknown): ReplyGenerationResult {
  if (typeof content !== "string") {
    throw new Error("The AI provider returned an empty response.");
  }

  const parsed = JSON.parse(extractJsonObject(content)) as Partial<ReplyGenerationResult>;
  const replies = Array.isArray(parsed.replies)
    ? parsed.replies.map((reply) => String(reply).trim()).filter(Boolean)
    : [];

  if (replies.length === 0) {
    throw new Error("The AI provider did not return any replies.");
  }

  return { replies: replies.slice(0, 3) };
}

function extractJsonObject(content: string): string {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("The AI provider did not return valid JSON.");
  }

  return content.slice(start, end + 1);
}
