import { PROVIDER_DEFAULTS } from "../shared/models";
import { getSettings } from "../shared/settings";
import type {
  AssistantSettings,
  ReplyGenerationRequest,
  ReplyGenerationResult,
  RuntimeRequest,
  RuntimeResponse
} from "../shared/types";

type VisionImage = {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
};

const SYSTEM_PROMPT = `You are an elite X (Twitter) reply ghostwriter.

Your job is to write replies that feel written by a sharp human, not an AI assistant.

Quality bar:
- React to a specific detail, claim, or angle in the post (text and/or images)
- Sound conversational and natural
- Add value: insight, agreement with a twist, a useful question, or a concrete observation
- Prefer specificity over polish
- Never sound corporate, fake-friendly, or motivational-poster
- When images are attached, notice a concrete visual detail if it matters — do not invent what you cannot see

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
  const model = settings.model || PROVIDER_DEFAULTS[settings.provider].model;
  const visionSupported = providerSupportsVision(settings.provider, model);
  const imageUrls = collectImageUrls(request);
  const images = visionSupported && imageUrls.length > 0 ? await fetchImagesAsBase64(imageUrls) : [];
  const prompt = buildUserPrompt(settings, request, {
    visionSupported,
    attachedImageCount: images.length,
    requestedImageCount: imageUrls.length
  });

  switch (settings.provider) {
    case "anthropic":
      return callAnthropic({ ...settings, model }, prompt, images);
    case "gemini":
      return callGemini({ ...settings, model }, prompt, images);
    case "groq":
      return callOpenAiCompatible(
        {
          ...settings,
          baseUrl: "https://api.groq.com/openai/v1",
          model
        },
        prompt,
        []
      );
    case "openai-compatible":
      return callOpenAiCompatible({ ...settings, model }, prompt, images);
    case "openai":
    default:
      return callOpenAiCompatible(
        {
          ...settings,
          baseUrl: "https://api.openai.com/v1",
          model
        },
        prompt,
        images
      );
  }
}

function collectImageUrls(request: ReplyGenerationRequest): string[] {
  const urls = [...(request.targetImageUrls || []), ...(request.rootImageUrls || [])];
  return Array.from(new Set(urls)).slice(0, 4);
}

function providerSupportsVision(provider: AssistantSettings["provider"], model: string): boolean {
  if (provider === "groq") {
    return false;
  }

  if (provider === "anthropic" || provider === "gemini") {
    return true;
  }

  // OpenAI + openai-compatible: only attach images for known multimodal families.
  return /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4\.5|o4-mini|gemini|claude/i.test(model);
}

function normalizeMediaType(contentType: string | null): VisionImage["mediaType"] {
  const raw = (contentType || "image/jpeg").split(";")[0].trim().toLowerCase();
  if (raw === "image/png") {
    return "image/png";
  }
  if (raw === "image/gif") {
    return "image/gif";
  }
  if (raw === "image/webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function fetchImagesAsBase64(urls: string[]): Promise<VisionImage[]> {
  const images: VisionImage[] = [];

  for (const url of urls.slice(0, 4)) {
    try {
      const response = await fetch(url, { credentials: "omit" });
      if (!response.ok) {
        continue;
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength > 4_000_000) {
        continue;
      }

      images.push({
        mediaType: normalizeMediaType(response.headers.get("content-type")),
        base64: arrayBufferToBase64(buffer)
      });
    } catch {
      // Skip failed media fetches; fall back to text-only context.
    }
  }

  return images;
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

function describeSituation(request: ReplyGenerationRequest): { situation: string; guidance: string } {
  const target = handleOrName(request.targetHandle, request.targetAuthor, "the author");
  const root = handleOrName(request.rootHandle, request.rootAuthor, "the original poster");

  if (!request.isReply) {
    if (request.isTargetMine) {
      return {
        situation: "You are adding a follow-up to your OWN post.",
        guidance: "Extend your original point with a fresh, valuable addition — do not just restate it."
      };
    }
    return {
      situation: `You are replying directly to ${target}'s post.`,
      guidance: "React to their specific point and add something genuinely useful."
    };
  }

  if (request.isRootMine && !request.isTargetMine) {
    return {
      situation: `${target} replied to YOUR post. You are the original author responding to their comment.`,
      guidance:
        "Respond as the host of the thread: acknowledge their point directly, add insight or answer their question, and keep it warm — even if they disagree or criticize."
    };
  }

  if (request.isTargetMine) {
    return {
      situation: "You are continuing your OWN thread (replying under your earlier comment).",
      guidance: "Add the next useful point so the thread keeps building."
    };
  }

  if (!request.isRootMine) {
    return {
      situation: `You are joining a conversation under ${root}'s post by replying to ${target}'s comment.`,
      guidance: `Engage with ${target}'s specific comment and add value to the discussion — do not simply echo the original post.`
    };
  }

  return {
    situation: `You are replying to ${target}.`,
    guidance: "Add a specific, valuable reply."
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function describeBatchMode(mode: NonNullable<ReplyGenerationRequest["batchMode"]>): string[] {
  switch (mode) {
    case "shorter":
      return [
        "Write 3 SHORT reply options.",
        "Hard limit: each reply under ~120 characters, ideally one punchy line.",
        "Still specific to the post — cut filler, not substance."
      ];
    case "questions":
      return [
        "Write 3 reply options that are QUESTIONS.",
        "Each must be a sharp, specific question about something in THIS post — not generic curiosity.",
        "No statements. End with a question mark."
      ];
    case "new_angles":
      return [
        "Write 3 reply options from FRESH ANGLES — different takes than a typical agree / nuance / question set.",
        "Good angles: operator detail, unexpected implication, lived tradeoff, mild pushback, concrete example.",
        "Each option should feel like a different person noticed a different detail."
      ];
    case "natural":
      return [
        "Write 3 MORE NATURAL reply options — like a real person typing on X, not an essay or AI assistant.",
        "Use casual rhythm, contractions, incomplete polish is fine. Sound human and specific.",
        "Avoid stiff openings, corporate phrasing, and over-explained takes."
      ];
    case "fresh":
    default:
      return [
        "Write 3 distinct reply options that fit the context above:",
        "1) A sharp agreement that adds one specific point",
        "2) A thoughtful pushback, nuance, or alternate angle",
        "3) A smart question or a practical takeaway"
      ];
  }
}

function buildUserPrompt(
  settings: AssistantSettings,
  request: ReplyGenerationRequest,
  media: { visionSupported: boolean; attachedImageCount: number; requestedImageCount: number }
): string {
  const batchMode = request.batchMode;
  const forceShort = batchMode === "shorter" || settings.replyLength === "short";
  const length = forceShort
    ? batchMode === "shorter"
      ? "Keep each reply under ~120 characters — one punchy line."
      : "Keep each reply to 1 short sentence, ideally under 180 characters."
    : "Keep each reply to 1-2 natural sentences, under 280 characters.";
  const emojiRule = settings.includeEmoji
    ? "Use at most one emoji, and only if it feels natural."
    : "Do not use emoji.";
  const style = settings.personalStyle.trim()
    ? `Personal writing style to match closely:\n${settings.personalStyle.trim()}`
    : "Write like a thoughtful founder/operator on X: clear, grounded, lightly conversational.";

  const { situation, guidance } = describeSituation(request);
  const targetLabel = request.isReply ? "the comment you are replying to" : "the post you are replying to";
  const target = handleOrName(request.targetHandle, request.targetAuthor, "the author");

  const count = Math.min(Math.max(request.count ?? 3, 1), 3);
  const taskLines = request.variant
    ? [
        "TASK",
        `Write ${count} fresh reply option${count > 1 ? "s" : ""} that fit the context above.`,
        describeVariant(request.variant),
        "Make each option distinct from typical phrasing — vary the angle and wording."
      ]
    : ["TASK", ...describeBatchMode(batchMode ?? "fresh")];

  const lines = [
    "CONTEXT",
    situation,
    guidance,
    "",
    ...taskLines,
    "",
    `Tone: ${describeTone(settings.tone)}`,
    length,
    emojiRule,
    style
  ];

  if (request.rootText && request.rootText.trim()) {
    lines.push(
      "",
      `Original post by ${handleOrName(request.rootHandle, request.rootAuthor, "the original poster")}:`,
      `"""`,
      request.rootText.trim(),
      `"""`
    );
  }

  if (request.rootImageUrls?.length) {
    lines.push(
      "",
      `The original post includes ${request.rootImageUrls.length} image(s)${
        media.attachedImageCount > 0 ? " (attached below)" : ""
      }.`
    );
  }

  const targetText = request.targetText.trim() || "(no text — image-only post)";
  lines.push(
    "",
    `${capitalize(targetLabel)} (by ${target}):`,
    `"""`,
    targetText,
    `"""`
  );

  if (request.targetImageUrls?.length) {
    lines.push(
      "",
      `This post includes ${request.targetImageUrls.length} image(s)${
        media.attachedImageCount > 0 ? " (attached below)" : ""
      }.`,
      "If the images matter, react to a concrete visual detail. Do not invent what you cannot see."
    );
  }

  if (media.requestedImageCount > 0 && media.attachedImageCount === 0) {
    if (!media.visionSupported) {
      lines.push(
        "",
        "Note: this post has images, but the selected model cannot view them. Reply from the text only."
      );
    } else {
      lines.push(
        "",
        "Note: images were detected but could not be loaded. Reply from the text only; do not invent visual details."
      );
    }
  }

  lines.push(
    "",
    media.attachedImageCount > 0
      ? "Reference something concrete from the text and/or images above. Do not invent facts."
      : "Reference something concrete from the text above. Do not invent facts."
  );

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
  prompt: string,
  images: VisionImage[]
): Promise<ReplyGenerationResult> {
  const baseUrl = (settings.baseUrl || PROVIDER_DEFAULTS.openai.baseUrl).replace(/\/$/, "");
  const userContent =
    images.length === 0
      ? prompt
      : [
          { type: "text", text: prompt },
          ...images.map((image) => ({
            type: "image_url",
            image_url: {
              url: `data:${image.mediaType};base64,${image.base64}`,
              detail: "low" as const
            }
          }))
        ];

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
        { role: "user", content: userContent }
      ]
    })
  });

  const data = await parseProviderResponse(response);
  const content = data.choices?.[0]?.message?.content;
  return normalizeReplies(content);
}

async function callAnthropic(
  settings: AssistantSettings,
  prompt: string,
  images: VisionImage[]
): Promise<ReplyGenerationResult> {
  const content =
    images.length === 0
      ? prompt
      : [
          ...images.map((image) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: image.mediaType,
              data: image.base64
            }
          })),
          { type: "text" as const, text: prompt }
        ];

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
      messages: [{ role: "user", content }]
    })
  });

  const data = await parseProviderResponse(response);
  const text = data.content?.find((item: { type?: string }) => item.type === "text")?.text;
  return normalizeReplies(text);
}

async function callGemini(
  settings: AssistantSettings,
  prompt: string,
  images: VisionImage[]
): Promise<ReplyGenerationResult> {
  const model = settings.model;
  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
    { text: prompt },
    ...images.map((image) => ({
      inline_data: {
        mime_type: image.mediaType,
        data: image.base64
      }
    }))
  ];

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
            parts
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
        .map((reply) => dedupeRepeatedText(String(reply).trim().replace(/^["']|["']$/g, "")))
        .filter(Boolean)
    : [];

  if (replies.length === 0) {
    throw new Error("The AI provider did not return any replies.");
  }

  return { replies: replies.slice(0, 3) };
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
