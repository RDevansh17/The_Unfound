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

const SYSTEM_PROMPT = `You ghostwrite X (Twitter) replies for a real person. Every reply must sound like they read the post, got it, and typed a quick human reaction.

WORKFLOW — follow in order:
1. Read the full conversation. Reply to the message marked as the target; use earlier messages only for context.
2. State internally what the target message actually means in plain English (not the topic category — the specific point).
3. Pick one concrete anchor from the target text: a word, number, claim, or detail you will react to.
4. Write replies that engage that meaning. Never drift to a different topic.

HOW GOOD REPLIES SOUND
- Plain spoken language. Contractions OK. Lowercase OK.
- Short: one or two lines, often one sentence.
- They ADD something: a specific agreement with a new detail, a practical implication, a small nuance, a quick real reaction, or light pushback on one part.
- They have a point of view. They do not summarize, coach, or philosophize.

DEFAULT BATCH (unless the user prompt asks for a specific style like "question"):
- Write STATEMENTS, not questions. No question marks. No "curious what...", "what made you...", "is there a story...", "how do you...", "did you...".
- All options must address the SAME understanding of the target — same meaning, same anchor — with different angles (e.g. agree+add, practical takeaway, small nuance). Not opposite unrelated takes.
- Every option must be impossible to write without having read this specific post.

NEVER
- Generic curiosity or interview-style questions when not explicitly requested
- Aphorisms, life lessons, LinkedIn voice, motivational tone
- "It's not X, it's Y" / "This isn't about X, it's about Y"
- Empty praise: "Great post", "So true", "Love this", "Well said"
- Restating the post back at them, inventing facts, or replying to a topic not in the text
- Starting with "Honestly," "Absolutely," "Indeed," "Ah,"
- Hashtags, markdown, quotes around the reply

Return ONLY valid JSON:
{"understanding":"one plain sentence: what the target message means","anchor":"the exact word/phrase/detail you reacted to","variants":[{"text":"reply","recommended":false},{"text":"reply","recommended":true,"rationale":"under 15 words"}]}

JSON rules:
- "understanding" and "anchor" are required — they keep replies grounded.
- Mark at most one variant "recommended" when multiple variants are requested.
- "text" is the raw reply only.`;

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
  const parseOptions = { allowQuestions: request.variant === "question" };

  switch (settings.provider) {
    case "anthropic":
      return callAnthropic({ ...settings, model }, prompt, request.variant, parseOptions);
    case "gemini":
      return callGemini({ ...settings, model }, prompt, request.variant, parseOptions);
    case "groq":
      return callOpenAiCompatible(
        {
          ...settings,
          baseUrl: "https://api.groq.com/openai/v1",
          model
        },
        prompt,
        request.variant,
        parseOptions
      );
    case "openai-compatible":
      return callOpenAiCompatible({ ...settings, model }, prompt, request.variant, parseOptions);
    case "openai":
    default:
      return callOpenAiCompatible(
        {
          ...settings,
          baseUrl: "https://api.openai.com/v1",
          model
        },
        prompt,
        request.variant,
        parseOptions
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
      calibration: `${target} commented on YOUR post. Respond to what they actually said in their comment — acknowledge their specific point, answer it if they asked something, add value. You are the thread host: direct, warm, never defensive.`
    };
  }

  if (request.isReply && !request.isRootMine) {
    return {
      kind: "stranger_post",
      calibration: `You are replying to ${target}'s comment in someone else's thread. Respond to their comment's specific point. The original post is background only — do not reply as if the original post was the target.`
    };
  }

  if (request.isTargetMine) {
    return {
      kind: "warm_post",
      calibration:
        "This is your own post or thread. Add a genuinely new point that extends what you already said — never repeat yourself."
    };
  }

  return {
    kind: "stranger_post",
    calibration: `You are replying to ${target}'s post. Read what they actually claimed or shared, not the general topic. React to their specific point like a real reader who understood it.`
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
      return "Write a reply that clearly agrees with their specific point and adds one concrete supporting detail or example from your own experience — not generic praise.";
    case "contrarian":
      return "Write a respectful reply that pushes back on ONE specific part of what they said, with a concrete reason — never attack the person.";
    case "question":
      return "Write a reply that is a single sharp, genuinely curious QUESTION about something specific they said.";
    case "supportive":
      return "Write a warm, encouraging reply that references something specific they said and adds a small useful point.";
    case "witty":
      return "Write a witty, clever reply that still engages their specific point — light, not corny.";
    case "humorous":
      return "Write a humorous reply about something specific they said — playful, never mean.";
    case "professional":
      return "Write a professional, credible reply that engages their specific claim or point.";
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

  lines.push("", "Your reply must engage the meaning of the target message — not the general topic, not a different message.");
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
    `- Tone: ${request.variant ? describeTone(settings.tone) : describeToneForDefaultBatch(settings.tone)}`,
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
      "Stay locked to the target message's actual meaning. React to your anchor detail. Do not mark anything recommended."
    );
  } else {
    const angleGuide =
      count === 1
        ? "Write one grounded reply that adds a specific point."
        : count === 2
        ? "Write 2 options: (1) agree and add one concrete detail or example, (2) a practical implication or small nuance on the same point."
        : "Write options that share the same read of the post but vary the angle — e.g. agree+add a detail, practical 'this is why it matters', small nuance or light pushback on one part. Only use angles that fit; do not force disagreement.";

    lines.push(
      `Write exactly ${count} reply option${count > 1 ? "s" : ""} to the target message.`,
      "",
      "HARD RULES FOR THIS BATCH",
      "- STATEMENTS ONLY. No questions. No question marks. No curious/interview phrasing.",
      "- All options must respond to the SAME meaning of the target — not different topics, not generic reactions.",
      "- Each option must reference something concrete from the target (use your anchor).",
      "- Options should feel like the same person wrote them — same voice, different angle or emphasis.",
      "- Convey you understood what they meant, then add something useful.",
      "",
      angleGuide,
      count > 1
        ? "Mark exactly one as recommended — the most natural fit for this exact post — with a short rationale."
        : "Do not mark it recommended."
    );
  }

  lines.push(
    "",
    "Fill understanding and anchor in the JSON before writing variants. Do not invent facts not in the conversation."
  );

  return lines.join("\n");
}

function describeToneForDefaultBatch(tone: AssistantSettings["tone"]): string {
  if (tone === "question") {
    return "curious and engaged, but this batch is statements only — no question marks";
  }
  return describeTone(tone);
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
  variant?: ReplyGenerationRequest["variant"],
  parseOptions?: { allowQuestions?: boolean }
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
      temperature: variant ? 0.82 : 0.72,
      presence_penalty: variant ? 0.25 : 0.1,
      frequency_penalty: variant ? 0.25 : 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ]
    })
  });

  const data = await parseProviderResponse(response);
  const content = data.choices?.[0]?.message?.content;
  return normalizeReplies(content, parseOptions);
}

async function callAnthropic(
  settings: AssistantSettings,
  prompt: string,
  variant?: ReplyGenerationRequest["variant"],
  parseOptions?: { allowQuestions?: boolean }
): Promise<ReplyGenerationResult> {
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
      temperature: variant ? 0.82 : 0.72,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await parseProviderResponse(response);
  const content = data.content?.find((item: { type?: string }) => item.type === "text")?.text;
  return normalizeReplies(content, parseOptions);
}

async function callGemini(
  settings: AssistantSettings,
  prompt: string,
  variant?: ReplyGenerationRequest["variant"],
  parseOptions?: { allowQuestions?: boolean }
): Promise<ReplyGenerationResult> {
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
          temperature: variant ? 0.82 : 0.72,
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
  return normalizeReplies(content, parseOptions);
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

function looksLikeQuestion(text: string): boolean {
  const value = text.trim();
  if (!value) {
    return false;
  }
  if (value.includes("?")) {
    return true;
  }
  return /^(what|how|why|when|where|who|which|did|do|does|is|are|can|could|would|will|have you|curious|wondering)\b/i.test(
    value
  );
}

function normalizeReplies(
  content: unknown,
  options: { allowQuestions?: boolean } = {}
): ReplyGenerationResult {
  if (typeof content !== "string") {
    throw new Error("The AI provider returned an empty response.");
  }

  const parsed = JSON.parse(extractJsonObject(content)) as {
    variants?: unknown;
    replies?: unknown;
    understanding?: unknown;
    anchor?: unknown;
  };

  const rawList = Array.isArray(parsed.variants)
    ? parsed.variants
    : Array.isArray(parsed.replies)
    ? parsed.replies
    : [];

  let drafts: ReplyDraft[] = rawList
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

  if (!options.allowQuestions) {
    const statements = drafts.filter((draft) => !looksLikeQuestion(draft.text));
    if (statements.length > 0) {
      drafts = statements;
    }
  }

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
