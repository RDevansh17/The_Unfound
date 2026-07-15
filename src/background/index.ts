import { PROVIDER_DEFAULTS } from "../shared/models";
import { getSettings } from "../shared/settings";
import {
  MAX_REPLY_COUNT,
  MIN_REPLY_COUNT,
  type AssistantSettings,
  type ReplyDraft,
  type ReplyGenerationRequest,
  type ReplyGenerationResult,
  type ReplyInsight,
  type RuntimeRequest,
  type RuntimeResponse
} from "../shared/types";

const ANALYSIS_SYSTEM_PROMPT = `You read X conversations and extract what the target message actually means before anyone writes a reply.

Return ONLY valid JSON:
{"post_meaning":"one plain sentence: the specific claim or point, not the topic category","author_intent":"what they're doing: sharing, teaching, venting, joking, choosing, flexing, etc","anchor_phrase":"exact word, number, or short phrase from the target to react to","your_take":"one sentence: what a good reply should ADD (detail, implication, agreement+twist, pushback — never a summary)"}

Rules:
- Reply to the message marked <<< REPLY TO THIS ONE.
- post_meaning must be specific enough that someone could disagree with it.
- anchor_phrase must appear verbatim in the target text (or the nearest interpretable fragment).
- If the target is very short (under ~30 characters) or cryptic ("Second one.", "This.", "Yep"), use the FULL thread to interpret what they mean. post_meaning should explain what the short message refers to.
- Do not write any reply text. Analysis only.`;

const WRITE_SYSTEM_PROMPT = `You ghostwrite X replies for someone building a personal brand. You receive a LOCKED analysis — do not reinterpret the post. Write replies that prove you understood post_meaning by engaging anchor_phrase.

Each reply must:
- Reference anchor_phrase or a specific word/number from the target (or the thing the short message refers to)
- Add your_take — a concrete thought, not a summary or vague praise
- Sound like a human typing fast: plain, direct, no polish theater
- Match the person's voice from the user prompt (their examples override everything)

DEFAULT BATCH (unless user asks for a style like "question"):
- STATEMENTS ONLY. No question marks. No interview curiosity.
- All options share the SAME post_meaning — different angles only (agree+detail, implication, nuance).
- Each option must be impossible without having read this exact post.

NEVER
- Questions, "curious what...", "what made you...", "is there a story...", "how do you..."
- Aphorisms, philosophy, life lessons, LinkedIn voice, motivational tone
- "It's not X, it's Y", "At the end of the day", "The real X is Y", "food for thought", "resonates"
- Empty praise: "Great post", "So true", "Love this", "Well said", "This.", "100%"
- Summarizing the post back, generic takes that fit any post, inventing facts
- "Honestly,", "Absolutely,", "Indeed,", "Ah,", "As someone who..."
- Hashtags, markdown, quotes around the reply

Return ONLY valid JSON:
{"variants":[{"text":"reply","angle":"agree+detail","recommended":true,"rationale":"under 12 words"}]}

JSON rules:
- Each variant needs "angle" (agree+detail, implication, nuance, etc).
- Mark at most one recommended when multiple variants requested.
- "text" is the raw reply only.`;

const RETRY_APPENDIX = `
QUALITY RETRY — previous drafts were too generic or off-topic.
Every reply MUST:
- Reference anchor_phrase or a specific word/number from the target text
- Share the same post_meaning across all options — different angles only
- Sound like a human with a POV, not an assistant or philosopher
- Add a concrete thought, never restate or vaguely praise
No questions. No AI phrases.`;

const BUILTIN_AVOID = [
  "game-changer",
  "unpack",
  "dive in",
  "leverage",
  "synergy",
  "at the end of the day",
  "food for thought",
  "resonates",
  "couldn't agree more",
  "well said",
  "great post",
  "so true",
  "love this",
  "spot on",
  "this is huge",
  "mind blown"
];

const AI_SLOP_PATTERNS = [
  /\bat the end of the day\b/i,
  /\bit'?s not .+ it'?s\b/i,
  /\bthis isn'?t about .+ it'?s about\b/i,
  /\bthe real .+ is\b/i,
  /\bfood for thought\b/i,
  /\bresonates\b/i,
  /\bcouldn'?t agree more\b/i,
  /\bwell said\b/i,
  /\bgreat post\b/i,
  /\bso true\b/i,
  /\blove this\b/i,
  /\bspot on\b/i,
  /\babsolutely\b/i,
  /\bhonestly\b/i,
  /\bas someone who\b/i,
  /\bin today'?s\b/i,
  /\blet'?s unpack\b/i,
  /\bthe key is\b/i,
  /\bthat'?s the difference\b/i,
  /\breminds me\b/i,
  /\bspeaks volumes\b/i,
  /\bpowerful reminder\b/i,
  /\bbeautifully said\b/i,
  /\bwise words\b/i,
  /\bfood for thought\b/i,
  /\bworth noting\b/i,
  /\bin a world where\b/i,
  /\bthe beauty of\b/i,
  /\bhits different\b/i,
  /\bthis resonates\b/i
];

type ParseOptions = {
  allowQuestions?: boolean;
  targetText?: string;
  contextTexts?: string[];
  anchorPhrase?: string;
};

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

function getTargetText(request: ReplyGenerationRequest): string {
  const fromThread = request.thread?.find((item) => item.isTarget)?.text?.trim();
  return fromThread || request.targetText.trim();
}

function getContextTexts(request: ReplyGenerationRequest): string[] {
  const texts: string[] = [];
  const thread = request.thread?.filter((item) => item.text.trim()) ?? [];

  if (thread.length > 0) {
    thread.forEach((item) => texts.push(item.text.trim()));
  } else {
    if (request.rootText?.trim()) {
      texts.push(request.rootText.trim());
    }
    if (request.targetText.trim()) {
      texts.push(request.targetText.trim());
    }
  }

  return [...new Set(texts)];
}

async function generateReplies(
  settings: AssistantSettings,
  request: ReplyGenerationRequest
): Promise<ReplyGenerationResult> {
  const count = resolveReplyCount(settings, request);
  const targetText = getTargetText(request);
  const contextTexts = getContextTexts(request);

  let insight = request.insight;
  if (!insight?.post_meaning?.trim() || !insight.anchor_phrase?.trim()) {
    insight = await analyzePost(settings, request, targetText);
  }

  const prompt = buildWritePrompt(settings, request, count, insight);
  const parseOptions: ParseOptions = {
    allowQuestions: request.variant === "question",
    targetText,
    contextTexts,
    anchorPhrase: insight.anchor_phrase
  };

  let result = await invokeProvider(settings, prompt, WRITE_SYSTEM_PROMPT, request.variant, parseOptions);
  result.insight = insight;

  const minExpected = request.variant ? 1 : Math.min(count, 2);
  if (result.replies.length < minExpected && !request.variant) {
    const retryPrompt = `${prompt}\n${RETRY_APPENDIX}\n\nLOCKED ANCHOR: "${insight.anchor_phrase}"\nLOCKED MEANING: ${insight.post_meaning}`;
    result = await invokeProvider(
      settings,
      retryPrompt,
      WRITE_SYSTEM_PROMPT,
      request.variant,
      parseOptions
    );
    result.insight = insight;
  }

  return result;
}

async function analyzePost(
  settings: AssistantSettings,
  request: ReplyGenerationRequest,
  targetText: string
): Promise<ReplyInsight> {
  const prompt = buildAnalysisPrompt(request, targetText);

  try {
    const raw = await invokeProviderRaw(
      settings,
      prompt,
      ANALYSIS_SYSTEM_PROMPT,
      { temperature: 0.35, maxTokens: 500 }
    );
    const parsed = JSON.parse(extractJsonObject(raw)) as Partial<ReplyInsight>;
    const insight: ReplyInsight = {
      post_meaning: String(parsed.post_meaning ?? "").trim(),
      author_intent: String(parsed.author_intent ?? "").trim(),
      anchor_phrase: String(parsed.anchor_phrase ?? "").trim(),
      your_take: String(parsed.your_take ?? "").trim()
    };

    if (insight.post_meaning && insight.anchor_phrase) {
      return insight;
    }
  } catch {
    // Fall through to heuristic insight.
  }

  return fallbackInsight(request, targetText);
}

function fallbackInsight(request: ReplyGenerationRequest, targetText: string): ReplyInsight {
  const thread = request.thread?.filter((item) => item.text.trim()) ?? [];
  const parent = thread.length > 1 ? thread[thread.length - 2]?.text?.trim() : request.rootText?.trim();
  const short = targetText.length < 30;

  const anchor =
    targetText
      .split(/\s+/)
      .find((word) => word.length >= 2)
      ?.replace(/[^\w'-]/g, "") ||
    targetText.slice(0, 24).trim() ||
    "this";

  const meaning = short && parent
    ? `They're responding to the thread with "${targetText}" — in context of: ${parent.slice(0, 120)}`
    : targetText || "They're making a point in this thread.";

  return {
    post_meaning: meaning,
    author_intent: request.isReply ? "replying in thread" : "posting",
    anchor_phrase: anchor,
    your_take: "Add one specific thought that shows you read their exact words."
  };
}

async function invokeProvider(
  settings: AssistantSettings,
  prompt: string,
  systemPrompt: string,
  variant: ReplyGenerationRequest["variant"],
  parseOptions: ParseOptions
): Promise<ReplyGenerationResult> {
  const model = settings.model || PROVIDER_DEFAULTS[settings.provider].model;
  const configured = { ...settings, model };

  switch (settings.provider) {
    case "anthropic":
      return callAnthropic(configured, prompt, systemPrompt, variant, parseOptions);
    case "gemini":
      return callGemini(configured, prompt, systemPrompt, variant, parseOptions);
    case "groq":
      return callOpenAiCompatible(
        { ...configured, baseUrl: "https://api.groq.com/openai/v1" },
        prompt,
        systemPrompt,
        variant,
        parseOptions
      );
    case "openai-compatible":
      return callOpenAiCompatible(configured, prompt, systemPrompt, variant, parseOptions);
    case "openai":
    default:
      return callOpenAiCompatible(
        { ...configured, baseUrl: "https://api.openai.com/v1" },
        prompt,
        systemPrompt,
        variant,
        parseOptions
      );
  }
}

type ProviderCallOptions = {
  temperature?: number;
  maxTokens?: number;
};

async function invokeProviderRaw(
  settings: AssistantSettings,
  prompt: string,
  systemPrompt: string,
  options: ProviderCallOptions = {}
): Promise<string> {
  const model = settings.model || PROVIDER_DEFAULTS[settings.provider].model;
  const configured = { ...settings, model };
  const temperature = options.temperature ?? 0.35;

  switch (settings.provider) {
    case "anthropic": {
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
          max_tokens: options.maxTokens ?? 500,
          temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await parseProviderResponse(response);
      return data.content?.find((item: { type?: string }) => item.type === "text")?.text ?? "";
    }
    case "gemini": {
      const response = await safeFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generationConfig: {
              temperature,
              responseMimeType: "application/json"
            },
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }]
          })
        }
      );
      const data = await parseProviderResponse(response);
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    }
    case "groq":
      return invokeOpenAiCompatibleRaw(
        { ...configured, baseUrl: "https://api.groq.com/openai/v1" },
        prompt,
        systemPrompt,
        temperature,
        options.maxTokens ?? 500
      );
    case "openai-compatible":
      return invokeOpenAiCompatibleRaw(configured, prompt, systemPrompt, temperature, options.maxTokens ?? 500);
    case "openai":
    default:
      return invokeOpenAiCompatibleRaw(
        { ...configured, baseUrl: "https://api.openai.com/v1" },
        prompt,
        systemPrompt,
        temperature,
        options.maxTokens ?? 500
      );
  }
}

async function invokeOpenAiCompatibleRaw(
  settings: AssistantSettings,
  prompt: string,
  systemPrompt: string,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const baseUrl = (settings.baseUrl || PROVIDER_DEFAULTS.openai.baseUrl).replace(/\/$/, "");
  const response = await safeFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]
    })
  });
  const data = await parseProviderResponse(response);
  return data.choices?.[0]?.message?.content ?? "";
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
      calibration: `${target} commented on YOUR post. Reply to their exact words. Show you understood their point, add something useful. Warm host energy — never defensive, never salesy.`
    };
  }

  if (request.isReply && !request.isRootMine) {
    return {
      kind: "stranger_post",
      calibration: `Reply to ${target}'s comment specifically. The original post is context only — your reply is about what THEY said in their comment.`
    };
  }

  if (request.isTargetMine) {
    return {
      kind: "warm_post",
      calibration: "Your own thread. Add a new point that builds on what you already said — don't repeat yourself."
    };
  }

  return {
    kind: "stranger_post",
    calibration: `Reply to ${target}'s post. Engage their specific claim or story — show you read it, then add your take. This is brand-building: be memorable for being specific, not generic.`
  };
}

function describeVisibility(visibility: ReplyGenerationRequest["visibility"]): string | null {
  if (visibility === "high") {
    return "High visibility — lead with your sharpest specific point in the first few words.";
  }
  if (visibility === "low") {
    return "Lower visibility — a genuine, specific reply beats anything performative.";
  }
  return null;
}

function describeVariant(variant: NonNullable<ReplyGenerationRequest["variant"]>): string {
  switch (variant) {
    case "agree":
      return "Agree with their specific point and add one concrete detail, example, or 'yes, and...' that only fits this post.";
    case "contrarian":
      return "Push back on ONE specific part of what they said with a concrete reason — respectful, never personal.";
    case "question":
      return "One sharp question about something specific they said — not generic curiosity.";
    case "supportive":
      return "Warm encouragement that names something specific they said and adds a small useful point.";
    case "witty":
      return "Witty and light, but still about their specific point — never a random joke.";
    case "humorous":
      return "Playful humor tied to something specific they said — never mean, never random.";
    case "professional":
      return "Credible and concise, engaging their specific claim with a professional take.";
    default:
      return "A natural reply that adds a specific point.";
  }
}

function renderThread(request: ReplyGenerationRequest): string[] {
  const thread = request.thread?.filter((item) => item.text.trim() || item.handle) ?? [];
  if (thread.length === 0) {
    return [];
  }

  const lines = [
    thread.length > 1
      ? "CONVERSATION (oldest first). Reply to the LAST message marked <<< REPLY TO THIS ONE:"
      : "POST YOU ARE REPLYING TO:"
  ];

  thread.forEach((item, index) => {
    const who = item.isMine ? "you" : handleOrName(item.handle, item.author, "someone");
    const role = index === 0 && thread.length > 1 ? "original post" : index === 0 ? "post" : "reply";
    const marker = item.isTarget ? "  <<< REPLY TO THIS ONE" : "";
    lines.push("", `[${role} by ${who}]${marker}`);
    lines.push(item.text.trim() ? `"""${item.text.trim()}"""` : "(text not shown)");
  });

  lines.push("", "Every reply must engage the TARGET message's meaning — not the general topic.");
  return lines;
}

function buildPersona(settings: AssistantSettings): string {
  if (settings.personalStyle.trim()) {
    return settings.personalStyle.trim();
  }
  return "a founder/operator building a personal brand on X: direct, specific, grounded, opinionated when it fits, never hypey or preachy";
}

function buildAnalysisPrompt(request: ReplyGenerationRequest, targetText: string): string {
  const target = handleOrName(request.targetHandle, request.targetAuthor, "the author");
  const lines = [
    "Analyze the target message before any reply is written.",
    "",
    `Target is by ${target}.`,
    `Target text length: ${targetText.length} characters.`
  ];

  if (targetText.length < 30) {
    lines.push(
      "",
      "SHORT MESSAGE — the target alone may not be enough.",
      "Use the full conversation to interpret what they mean (e.g. 'Second one.' refers to something in the thread)."
    );
  }

  const threadLines = renderThread(request);
  if (threadLines.length > 0) {
    lines.push("", ...threadLines);
  } else {
    if (request.rootText?.trim()) {
      lines.push(
        "",
        `Original post by ${handleOrName(request.rootHandle, request.rootAuthor, "the original poster")}:`,
        `"""${request.rootText.trim()}"""`
      );
    }
    lines.push("", `Target message (by ${target}):`, `"""${targetText}"""`);
  }

  lines.push("", "Return post_meaning, author_intent, anchor_phrase, your_take. No reply text.");
  return lines.join("\n");
}

function buildWritePrompt(
  settings: AssistantSettings,
  request: ReplyGenerationRequest,
  count: number,
  insight: ReplyInsight
): string {
  const length =
    settings.replyLength === "short"
      ? "1 short line, under ~180 characters"
      : "1-2 natural lines, under 280 characters";
  const emojiRule = settings.includeEmoji ? "at most one emoji, only if natural" : "no emoji";
  const persona = buildPersona(settings);
  const { kind, calibration } = classifyContext(request);
  const visibilityNote = describeVisibility(request.visibility);
  const examples = parseLines(settings.exampleReplies);
  const avoid = [...BUILTIN_AVOID, ...parseAvoidWords(settings.avoidWords)];

  const lines = [
    `Ghostwrite X replies for: ${persona}`,
    "",
    "BRAND RULE",
    "Every reply is public. It should make readers remember this person for being sharp and specific — not for sounding like AI or a motivational account.",
    "",
    "VOICE",
    `- Tone: ${request.variant ? describeTone(settings.tone) : describeToneForDefaultBatch(settings.tone)}`,
    `- Length: ${length}`,
    `- Emoji: ${emojiRule}`
  ];

  if (examples.length > 0) {
    lines.push(
      "",
      "MATCH THIS VOICE EXACTLY (rhythm, length, word choice — copy the style, not the content):"
    );
    examples.slice(0, 8).forEach((example) => lines.push(`"${example}"`));
    lines.push("If your reply doesn't sound like it could sit next to these examples, rewrite it.");
  } else {
    lines.push("", "No voice examples provided — write plain, direct, human. Short sentences. No filler.");
  }

  if (avoid.length > 0) {
    lines.push("", `NEVER use: ${[...new Set(avoid)].slice(0, 24).join(", ")}`);
  }

  lines.push(
    "",
    "SITUATION",
    `${kind.replace(/_/g, " ")}${request.visibility ? ` · ${request.visibility} visibility` : ""}`,
    calibration
  );

  if (visibilityNote) {
    lines.push(visibilityNote);
  }

  lines.push(
    "",
    "TARGET (reference only — meaning is locked in analysis):",
    `"""${getTargetText(request)}"""`
  );

  lines.push(
    "",
    "LOCKED ANALYSIS (do not reinterpret — write from this):",
    `post_meaning: ${insight.post_meaning}`,
    `author_intent: ${insight.author_intent}`,
    `anchor_phrase: "${insight.anchor_phrase}"`,
    `your_take: ${insight.your_take}`,
    "",
    "Every reply must engage anchor_phrase and add your_take.",
    "",
    "TASK"
  );

  if (request.variant) {
    lines.push(
      `Write ${count} reply option${count > 1 ? "s" : ""}: ${describeVariant(request.variant)}`,
      "Stay locked to the analysis above. Do not mark recommended."
    );
  } else {
    lines.push(
      `Write exactly ${count} reply options.`,
      "",
      "RULES",
      "- STATEMENTS ONLY. No questions. No question marks.",
      "- All options = same post_meaning, different angles (agree+detail, implication, nuance).",
      `- Each must reference "${insight.anchor_phrase}" or a specific word from the target.`,
      "- Each must sound like the same person wrote all of them.",
      "- Convey you understood what they meant, then add YOUR thought.",
      count > 1
        ? "- Mark one recommended — the reply you'd actually send to build your brand."
        : "- Do not mark recommended."
    );
  }

  return lines.join("\n");
}

function describeToneForDefaultBatch(tone: AssistantSettings["tone"]): string {
  switch (tone) {
    case "question":
      return "engaged, but this batch is statements only";
    case "thought-leader":
      return "specific and grounded — add a concrete point, never abstract or preachy";
    case "contrarian":
      return "respectful pushback on one specific detail, not contrarian for its own sake";
    default:
      return describeTone(tone);
  }
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
      return "insightful with a concrete point, never preachy";
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
  systemPrompt: string,
  variant?: ReplyGenerationRequest["variant"],
  parseOptions?: ParseOptions
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
      temperature: variant ? 0.78 : 0.58,
      presence_penalty: variant ? 0.2 : 0.08,
      frequency_penalty: variant ? 0.2 : 0.08,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
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
  systemPrompt: string,
  variant?: ReplyGenerationRequest["variant"],
  parseOptions?: ParseOptions
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
      max_tokens: 1200,
      temperature: variant ? 0.78 : 0.58,
      system: systemPrompt,
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
  systemPrompt: string,
  variant?: ReplyGenerationRequest["variant"],
  parseOptions?: ParseOptions
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
          temperature: variant ? 0.78 : 0.58,
          responseMimeType: "application/json"
        },
        systemInstruction: {
          parts: [{ text: systemPrompt }]
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
  text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
  text = text.replace(/^(?:reply|option|variant)\s*\d*\s*[:.\-]\s*/i, "").trim();
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
  ) || /\b(curious what|wondering if|would love to know|tell me more|any thoughts on)\b/i.test(value);
}

function overlapsWithText(draft: string, source: string): boolean {
  const draftLower = draft.toLowerCase();
  const sourceLower = source.toLowerCase();

  const tokens = sourceLower.split(/\s+/).filter((token) => token.length >= 2);
  if (tokens.some((token) => draftLower.includes(token))) {
    return true;
  }

  const significant = extractSignificantWords(source);
  if (significant.length === 0) {
    return draftLower.length >= 10;
  }

  return significant.some((word) => draftLower.includes(word));
}

function hasContextualOverlap(draft: string, targetText: string, contextTexts?: string[], anchorPhrase?: string): boolean {
  const target = targetText.trim();
  if (!target) {
    return true;
  }

  if (anchorPhrase?.trim()) {
    const anchor = anchorPhrase.trim().toLowerCase();
    if (anchor.length >= 2 && draft.toLowerCase().includes(anchor)) {
      return true;
    }
  }

  if (overlapsWithText(draft, target)) {
    return true;
  }

  if (target.length < 30 && contextTexts?.length) {
    return contextTexts.some((text) => overlapsWithText(draft, text));
  }

  return false;
}

function isLowQualityDraft(text: string, options: ParseOptions): boolean {
  if (!text || text.length < 8) {
    return true;
  }
  if (!options.allowQuestions && looksLikeQuestion(text)) {
    return true;
  }
  if (isAiSlop(text)) {
    return true;
  }
  if (options.targetText && !hasContextualOverlap(text, options.targetText, options.contextTexts, options.anchorPhrase)) {
    return true;
  }
  return false;
}

function isAiSlop(text: string): boolean {
  return AI_SLOP_PATTERNS.some((pattern) => pattern.test(text));
}

const STOP_WORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "they",
  "them",
  "your",
  "have",
  "been",
  "were",
  "what",
  "when",
  "where",
  "about",
  "just",
  "really",
  "very",
  "would",
  "could",
  "should",
  "their",
  "there",
  "these",
  "those",
  "into",
  "over",
  "under",
  "after",
  "before",
  "because",
  "while",
  "doing",
  "being",
  "going",
  "like",
  "more",
  "some",
  "than",
  "then",
  "also",
  "only",
  "even",
  "still",
  "much",
  "many",
  "most",
  "such",
  "here",
  "well",
  "yeah",
  "yep",
  "nope"
]);

function extractSignificantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

function normalizeReplies(content: unknown, options: ParseOptions = {}): ReplyGenerationResult {
  if (typeof content !== "string") {
    throw new Error("The AI provider returned an empty response.");
  }

  const parsed = JSON.parse(extractJsonObject(content)) as {
    variants?: unknown;
    replies?: unknown;
    understanding?: unknown;
    post_meaning?: unknown;
    anchor?: unknown;
    anchor_phrase?: unknown;
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

  const qualityFiltered = drafts.filter((draft) => !isLowQualityDraft(draft.text, options));
  if (qualityFiltered.length > 0) {
    drafts = qualityFiltered;
  }

  if (drafts.length === 0) {
    throw new Error("The AI provider did not return any replies.");
  }

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
