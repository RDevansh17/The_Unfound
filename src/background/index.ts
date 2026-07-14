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

const SYSTEM_PROMPT = `You are ghostwriting replies on X (Twitter) for a real person. You are the best in the world at this.

Your only goal: write replies that are indistinguishable from something a sharp, real human typed in 5 seconds — and that make people want to reply back or follow.

READ FIRST, THEN REACT
- Read the whole conversation, but reply to the LAST message (the one marked as the target).
- Latch onto ONE specific thing actually said — a word, number, claim, or detail. Never reply to the topic in general.
- If it's a reply under someone's post, respond to that reply, not the original post (stay aware of the original for context).
- Never invent facts, stats, or personal stories that weren't given.

HOW REAL REPLIES SOUND
- Plain, spoken language, like texting a smart friend. Contractions. Lowercase is fine.
- Short. One or two lines. Often a single sentence.
- They add something: a concrete point, a specific example, a sharp genuine question, a quick real reaction, or a small useful pushback.
- They sound like they have a point of view, not like a helpful assistant summarizing.

INSTANT AI TELLS — NEVER DO THESE
- Aphorisms / life lessons ("At the end of the day...", "The real X is Y", "That's the difference between...")
- "It's not just X, it's Y" or "This isn't about X, it's about Y" constructions
- Abstract, grand, or philosophical takes; anything that sounds like a fortune cookie or LinkedIn post
- Empty praise: "Great post", "So true", "This 100%", "Couldn't agree more", "Well said", "Love this"
- Summarizing or paraphrasing the post back at them before adding your bit
- Starting with "Honestly," "Absolutely," "Indeed," "Ah," or the person's @handle
- Rhetorical "Right?" / "Am I right?" endings, hashtags, emoji-as-punctuation, quotes around the reply, markdown
- Em dashes, unless the person's own style clearly uses them
- Two clauses balanced for effect ("Not because X, but because Y")

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

function renderThread(request: ReplyGenerationRequest): string[] {
  const thread = request.thread?.filter((item) => item.text.trim() || item.handle) ?? [];
  if (thread.length === 0) {
    return [];
  }

  const lines = [
    thread.length > 1
      ? "CONVERSATION (oldest first). Reply to the LAST message; the earlier ones are context only:"
      : "POST YOU ARE REPLYING TO:"
  ];

  thread.forEach((item, index) => {
    const who = item.isMine ? "you" : handleOrName(item.handle, item.author, "someone");
    const role = index === 0 && thread.length > 1 ? "original post" : index === 0 ? "post" : "reply";
    const marker = item.isTarget ? "  <<< REPLY TO THIS ONE" : "";
    lines.push("", `[${role} by ${who}]${marker}`);
    lines.push(item.text.trim() ? `"""${item.text.trim()}"""` : "(text not shown — respond to it based on who they are)");
  });

  return lines;
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
  const examples = parseLines(settings.exampleReplies);
  const avoid = parseAvoidWords(settings.avoidWords);

  const lines = [
    `You are ghostwriting an X reply for ${persona}.`,
    "",
    "VOICE RULES",
    `- Tone: ${describeTone(settings.tone)}`,
    `- Length: ${length}`,
    `- Emoji: ${emojiRule}`,
    "- Sound like a real person, not an assistant. No philosophy, no life lessons, no corporate voice."
  ];

  if (avoid.length > 0) {
    lines.push(
      `- Never use these words or phrases: ${avoid.join(", ")}. Avoid close variations too.`
    );
  }

  if (examples.length > 0) {
    lines.push(
      "",
      "THE PERSON'S REAL REPLIES (match this rhythm, sentence length, and word choice — not the content):"
    );
    examples.slice(0, 8).forEach((example) => lines.push(`- ${example}`));
  }

  lines.push(
    "",
    "CONTEXT",
    `This is a ${kind.replace(/_/g, " ")}${
      request.visibility ? ` on a ${request.visibility}-visibility post` : ""
    }.`,
    calibration
  );

  if (visibilityNote) {
    lines.push(visibilityNote);
  }

  const threadLines = renderThread(request);
  if (threadLines.length > 0) {
    lines.push("", ...threadLines);
  } else {
    // Fallback for older payloads without a structured thread.
    if (request.rootText && request.rootText.trim()) {
      lines.push(
        "",
        `Original post by ${handleOrName(request.rootHandle, request.rootAuthor, "the original poster")}:`,
        `"""`,
        request.rootText.trim(),
        `"""`
      );
    }
    lines.push("", `${targetLabel} (by ${target}):`, `"""`, request.targetText.trim(), `"""`);
  }

  lines.push("", "TASK");

  if (request.variant) {
    lines.push(
      `Write ${count} reply option${count > 1 ? "s" : ""} in this specific style: ${describeVariant(
        request.variant
      )}`,
      "It must react to something concrete in the target message and sound like a real person. Do not mark anything recommended."
    );
  } else {
    lines.push(
      `Write ${count} reply option${count > 1 ? "s" : ""} to the target message.`,
      "These should feel like the SAME person could have sent any of them: same voice, same core reaction — just a different angle, opening, or detail each time. Give real choices, not opposite stances. Only diverge into disagreement or a question if the message genuinely invites it.",
      "Vary the first few words and sentence shape across options so they never feel templated.",
      "Each one must react to something specific in the target message. No summarizing it back.",
      count > 1
        ? "Mark exactly one as recommended — the one that best fits this exact moment — with a short rationale."
        : "Do not mark it recommended."
    );
  }

  lines.push("", "Do not invent facts, numbers, or stories that are not in the conversation above.");

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
  const response = await safeFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.9,
      presence_penalty: 0.4,
      frequency_penalty: 0.4,
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
  const response = await safeFetch("https://api.anthropic.com/v1/messages", {
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
  const response = await safeFetch(
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

async function safeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error("Couldn't reach the AI provider. Check your internet connection and try again.");
  }
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
    throw new Error(friendlyProviderError(response.status, data.error?.message || data.message || response.statusText));
  }

  return data;
}

function friendlyProviderError(status: number, rawMessage: string): string {
  switch (status) {
    case 401:
    case 403:
      return "Your API key was rejected. Open settings and check the key for the selected provider.";
    case 404:
      return "That model isn't available for your account. Pick a different model in settings.";
    case 429:
      return "The provider rate-limited or ran out of quota. Wait a moment, then try again.";
    case 500:
    case 502:
    case 503:
    case 529:
      return "The AI provider is having issues right now. Try again in a few seconds.";
    default:
      return `AI provider error: ${rawMessage}`;
  }
}

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseAvoidWords(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function cleanReplyText(value: unknown): string {
  let text = dedupeRepeatedText(String(value ?? "").trim());
  // Strip wrapping quotes/backticks and stray leading labels the model sometimes adds.
  text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
  text = text.replace(/^(?:reply|option|variant)\s*\d*\s*[:.\-]\s*/i, "").trim();
  // Remove markdown emphasis and collapse runaway whitespace.
  text = text.replace(/\*\*(.*?)\*\*/g, "$1").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return text.trim();
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
