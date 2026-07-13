import { PROVIDER_DEFAULTS } from "../shared/models";
import { getSettings } from "../shared/settings";
import type {
  AssistantSettings,
  ReplyGenerationRequest,
  ReplyGenerationResult,
  RuntimeRequest,
  RuntimeResponse
} from "../shared/types";

const SYSTEM_PROMPT = `You are an elite X (Twitter) reply ghostwriter.

Your job is to write replies that feel written by a sharp human, not an AI assistant.

Quality bar:
- React to a specific detail, claim, or angle in the post
- Sound conversational and natural
- Add value: insight, agreement with a twist, a useful question, or a concrete observation
- Prefer specificity over polish
- Never sound corporate, fake-friendly, or motivational-poster

Hard bans:
- No hashtags
- No "Great post!", "Love this!", "So true!", "This!", "Couldn't agree more"
- No engagement bait ("Following for more", "Thread of the year")
- No generic praise with zero substance
- No em dashes unless the user's style asks for them
- No quotes around the replies
- No markdown

Return ONLY valid JSON:
{"replies":["reply 1","reply 2","reply 3"]}`;

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
  const model = settings.model || PROVIDER_DEFAULTS[settings.provider].model;

  switch (settings.provider) {
    case "anthropic":
      return callAnthropic({ ...settings, model }, prompt);
    case "gemini":
      return callGemini({ ...settings, model }, prompt);
    case "groq":
      return callOpenAiCompatible(
        {
          ...settings,
          baseUrl: "https://api.groq.com/openai/v1",
          model
        },
        prompt
      );
    case "openai-compatible":
      return callOpenAiCompatible({ ...settings, model }, prompt);
    case "openai":
    default:
      return callOpenAiCompatible(
        {
          ...settings,
          baseUrl: "https://api.openai.com/v1",
          model
        },
        prompt
      );
  }
}

function buildUserPrompt(settings: AssistantSettings, request: ReplyGenerationRequest): string {
  const length =
    settings.replyLength === "short"
      ? "Keep each reply to 1 short sentence, ideally under 180 characters."
      : "Keep each reply to 1-2 natural sentences, under 280 characters.";
  const emojiRule = settings.includeEmoji
    ? "Use at most one emoji, and only if it feels natural."
    : "Do not use emoji.";
  const style = settings.personalStyle.trim()
    ? `Personal writing style to match closely:\n${settings.personalStyle.trim()}`
    : "Write like a thoughtful founder/operator on X: clear, grounded, lightly conversational.";

  const author = request.authorName ? `@${request.authorName.replace(/^@/, "")}` : "the author";

  return [
    `Write 3 distinct reply options to ${author}'s post/reply.`,
    "",
    "Make the 3 options meaningfully different:",
    "1) A sharp agreement that adds one specific point",
    "2) A thoughtful pushback, nuance, or alternate angle",
    "3) A smart question or practical takeaway",
    "",
    `Desired tone: ${describeTone(settings.tone)}`,
    length,
    emojiRule,
    style,
    "",
    "Source post/reply text:",
    `"""`,
    request.postText.trim(),
    `"""`,
    "",
    "Remember: reference something concrete from the text. Do not invent facts."
  ].join("\n");
}

function describeTone(tone: AssistantSettings["tone"]): string {
  switch (tone) {
    case "professional":
      return "professional, concise, credible";
    case "witty":
      return "witty, light, clever without being try-hard";
    case "supportive":
      return "supportive and encouraging, still specific";
    case "contrarian":
      return "respectful contrarian; challenge the idea, not the person";
    case "concise":
      return "ultra concise and punchy";
    case "thought-leader":
      return "insightful thought-leadership without sounding pretentious";
    case "question":
      return "curious; favor a sharp question";
    case "friendly":
    default:
      return "friendly, natural, human";
  }
}

async function callOpenAiCompatible(
  settings: AssistantSettings,
  prompt: string
): Promise<ReplyGenerationResult> {
  const baseUrl = (settings.baseUrl || PROVIDER_DEFAULTS.openai.baseUrl).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.85,
      presence_penalty: 0.3,
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
      model: settings.model,
      max_tokens: 700,
      temperature: 0.85,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await parseProviderResponse(response);
  const content = data.content?.find((item: { type?: string }) => item.type === "text")?.text;
  return normalizeReplies(content);
}

async function callGemini(settings: AssistantSettings, prompt: string): Promise<ReplyGenerationResult> {
  const model = settings.model;
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
          temperature: 0.85,
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
    ? parsed.replies
        .map((reply) => String(reply).trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
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
