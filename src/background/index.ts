import { PROVIDER_DEFAULTS } from "../shared/models";
import { getSettings } from "../shared/settings";
import {
  MAX_REPLY_COUNT,
  MIN_REPLY_COUNT,
  type AssistantSettings,
  type ReplyDraft,
  type ReplyGenerationRequest,
  type ReplyGenerationResult,
  type RuntimeRequest,
  type RuntimeResponse
} from "../shared/types";

const SYSTEM_PROMPT = `You are ghostwriting replies on X (Twitter) for a real person.

Everything you write must read like it was typed by a sharp, busy human — never like an AI, a brand, or a philosopher.

How real replies actually sound:
- They react to ONE specific thing in the post, not the whole topic
- Plain, spoken language, the way you'd text a smart friend
- Short. Most good replies are one or two lines.
- They add a concrete point, a real example, or a genuine question — they don't summarize what the person already said

Never do these (they instantly read as AI):
- Aphorisms or life-lesson energy ("At the end of the day...", "The real X is Y")
- "It's not just X, it's Y" or "This isn't about X, it's about Y" constructions
- Grand, abstract, or philosophical takes
- Motivational-poster, LinkedIn, or corporate voice
- Empty praise: "Great post", "So true", "This 100%", "Couldn't agree more", "Love this"
- Engagement bait, hashtags, quotes around the reply, markdown
- Em dashes, unless the person's own style clearly uses them
- Restating the post back to them

Return ONLY valid JSON in exactly this shape:
{"variants":[{"text":"the reply","recommended":false},{"text":"the reply","recommended":true,"rationale":"one short line on why this one fits best"}]}

Rules for the JSON:
- Mark at most one variant "recommended", and only when more than one variant is requested.
- "rationale" belongs only on the recommended variant and stays under 15 words.
- "text" is the raw reply only: no quotes, no labels, no numbering.`;

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

function resolveReplyCount(settings: AssistantSettings, request: ReplyGenerationRequest): number {
  const raw = request.count ?? settings.replyCount ?? 3;
  if (!Number.isFinite(raw)) {
    return 3;
  }
  return Math.min(Math.max(Math.round(raw), MIN_REPLY_COUNT), MAX_REPLY_COUNT);
}

async function generateReplies(
  settings: AssistantSettings,
  request: ReplyGenerationRequest
): Promise<ReplyGenerationResult> {
  const count = resolveReplyCount(settings, request);
  const prompt = buildUserPrompt(settings, request, count);
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

function handleOrName(handle?: string, name?: string, fallback = "them"): string {
  if (handle) {
    return `@${handle.replace(/^@/, "")}`;
  }
  if (name) {
    return name;
  }
  return fallback;
}

type ContextKind = "stranger_post" | "warm_post" | "own_thread_reply";

function classifyContext(request: ReplyGenerationRequest): { kind: ContextKind; calibration: string } {
  const target = handleOrName(request.targetHandle, request.targetAuthor, "them");

  if (request.isReply && request.isRootMine && !request.isTargetMine) {
    return {
      kind: "own_thread_reply",
      calibration: `${target} replied under YOUR post. You are the host of this thread — answer their point directly, add something useful, and stay warm even if they push back. Never sound defensive or salesy.`
    };
  }

  if (request.isTargetMine) {
    return {
      kind: "warm_post",
      calibration:
        "This is your own post or thread. Extend your original thought with a genuinely new point — never restate what you already said."
    };
  }

  return {
    kind: "stranger_post",
    calibration:
      "You do not know this person. Skip flattery and over-familiarity. Just react like a real reader who found it interesting or worth pushing back on."
  };
}

function describeVisibility(visibility: ReplyGenerationRequest["visibility"]): string | null {
  if (visibility === "high") {
    return "This post already has a lot of eyes on it, so replies get buried fast. Lead with the most interesting or useful thing and earn the read in the first few words.";
  }
  if (visibility === "low") {
    return "This is not a huge post. A specific, genuine, human reply lands better here than anything clever or performative.";
  }
  return null;
}

function describeVariant(variant: NonNullable<ReplyGenerationRequest["variant"]>): string {
  switch (variant) {
    case "agree":
      return "Write a reply that clearly AGREES and adds one specific supporting point or example.";
    case "contrarian":
      return "Write a respectful CONTRARIAN reply that challenges the idea (never the person) with a concrete reason.";
    case "question":
      return "Write a reply that is a single SHARP, genuinely curious QUESTION.";
    case "supportive":
      return "Write a warm, SUPPORTIVE and encouraging reply that still adds something specific.";
    case "witty":
      return "Write a WITTY, clever reply that lands lightly and still adds value (not corny).";
    case "humorous":
      return "Write a HUMOROUS reply — playful, funny, and human. Keep it light, never mean or try-hard.";
    case "professional":
      return "Write a PROFESSIONAL, credible, concise reply.";
    default:
      return "Write a natural, human reply that adds value.";
  }
}

function buildUserPrompt(
  settings: AssistantSettings,
  request: ReplyGenerationRequest,
  count: number
): string {
  const length =
    settings.replyLength === "short"
      ? "1 short line, under ~180 characters"
      : "1-2 natural lines, under 280 characters";
  const emojiRule = settings.includeEmoji ? "at most one emoji, and only if it feels natural" : "no emoji";
  const persona = settings.personalStyle.trim()
    ? settings.personalStyle.trim()
    : "a thoughtful founder/operator who is active on X: clear, grounded, a little conversational, never hypey";

  const { kind, calibration } = classifyContext(request);
  const visibilityNote = describeVisibility(request.visibility);
  const target = handleOrName(request.targetHandle, request.targetAuthor, "the author");
  const targetLabel = request.isReply ? "Reply you are responding to" : "Post you are replying to";

  const lines = [
    `You are ghostwriting an X reply for ${persona}.`,
    "",
    "VOICE RULES",
    `- Tone: ${describeTone(settings.tone)}`,
    `- Length: ${length}`,
    `- Emoji: ${emojiRule}`,
    "- Sound like a real person, not an assistant. No philosophy, no life lessons, no corporate voice.",
    "",
    "CONTEXT",
    `This is a ${kind.replace(/_/g, " ")}${
      request.visibility ? ` on a ${request.visibility}-visibility post` : ""
    }.`,
    calibration
  ];

  if (visibilityNote) {
    lines.push(visibilityNote);
  }

  if (request.rootText && request.rootText.trim()) {
    lines.push(
      "",
      `Original post by ${handleOrName(request.rootHandle, request.rootAuthor, "the original poster")}:`,
      `"""`,
      request.rootText.trim(),
      `"""`
    );
  }

  lines.push(
    "",
    `${targetLabel} (by ${target}):`,
    `"""`,
    request.targetText.trim(),
    `"""`,
    "",
    "TASK"
  );

  if (request.variant) {
    lines.push(
      `Write ${count} reply option${count > 1 ? "s" : ""} in this specific style: ${describeVariant(
        request.variant
      )}`,
      "Make it sound human and specific to the post above. Do not mark anything recommended."
    );
  } else {
    lines.push(
      `Generate exactly ${count} distinct reply variant${count > 1 ? "s" : ""} as JSON.`,
      "Pick genuinely different angles based on what THIS specific post calls for — do not force a fixed agree / contrarian / question structure. Some posts want agreement with a new detail, some a sharp question, some a light disagreement, some just a quick real reaction.",
      count > 1
        ? "Mark exactly one variant as recommended and give a short rationale for why it fits best."
        : "Do not mark it recommended."
    );
  }

  lines.push("", "Reference something concrete from the text above. Do not invent facts.");

  return lines.join("\n");
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
      max_tokens: 1024,
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

function cleanReplyText(value: unknown): string {
  return dedupeRepeatedText(String(value ?? "").trim().replace(/^["']|["']$/g, ""));
}

function normalizeReplies(content: unknown): ReplyGenerationResult {
  if (typeof content !== "string") {
    throw new Error("The AI provider returned an empty response.");
  }

  const parsed = JSON.parse(extractJsonObject(content)) as {
    variants?: unknown;
    replies?: unknown;
  };

  const rawList = Array.isArray(parsed.variants)
    ? parsed.variants
    : Array.isArray(parsed.replies)
    ? parsed.replies
    : [];

  const drafts: ReplyDraft[] = rawList
    .map((item): ReplyDraft => {
      if (typeof item === "string") {
        return { text: cleanReplyText(item), recommended: false };
      }
      const record = (item ?? {}) as Record<string, unknown>;
      const rationale = record.rationale ? String(record.rationale).trim() : undefined;
      return {
        text: cleanReplyText(record.text),
        recommended: Boolean(record.recommended),
        rationale: rationale || undefined
      };
    })
    .filter((draft) => draft.text);

  if (drafts.length === 0) {
    throw new Error("The AI provider did not return any replies.");
  }

  // Keep at most one recommended flag so the UI has a single clear pick.
  let recommendedSeen = false;
  for (const draft of drafts) {
    if (draft.recommended && !recommendedSeen) {
      recommendedSeen = true;
    } else {
      draft.recommended = false;
      draft.rationale = undefined;
    }
  }

  return { replies: drafts.slice(0, MAX_REPLY_COUNT) };
}

function dedupeRepeatedText(value: string): string {
  if (value.length < 16) {
    return value;
  }

  if (value.length % 2 === 0) {
    const mid = value.length / 2;
    if (value.slice(0, mid) === value.slice(mid)) {
      return value.slice(0, mid).trim();
    }
  }

  for (let len = Math.floor(value.length / 2); len >= 16; len -= 1) {
    const first = value.slice(0, len);
    if (value.slice(len).startsWith(first)) {
      return first.trim();
    }
  }

  return value;
}

function extractJsonObject(content: string): string {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("The AI provider did not return valid JSON.");
  }

  return content.slice(start, end + 1);
}
