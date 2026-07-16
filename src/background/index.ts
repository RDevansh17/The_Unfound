import { PROVIDER_DEFAULTS } from "../shared/models";
import { getSettings } from "../shared/settings";
import {
  MAX_REPLY_COUNT,
  MIN_REPLY_COUNT,
  countExampleReplies,
  isVoiceReady,
  type AssistantSettings,
  type ReplyDraft,
  type ReplyGenerationRequest,
  type ReplyGenerationResult,
  type ReplyInsight,
  type RuntimeRequest,
  type RuntimeResponse
} from "../shared/types";

const ANALYSIS_SYSTEM_PROMPT = `You are the reading brain of a personal-brand ghostwriter on X.

Your job: understand the target message so the next step can write a reply that makes people think "this person gets it — and has a point of view."

Return ONLY valid JSON:
{"post_meaning":"one plain sentence: the specific claim or point, not the topic category","author_intent":"what they're doing: sharing, teaching, venting, joking, choosing, flexing, asking, etc","anchor_phrase":"exact word, number, or short phrase from the target to react to","your_take":"one sentence: the sharpest thing THIS brand should add, grounded in their niche/expertise/beliefs when provided — never a summary, never generic advice"}

Rules:
- Reply to the message marked <<< REPLY TO THIS ONE.
- post_meaning must be specific enough that someone could disagree with it.
- anchor_phrase must appear in the target text (or the nearest fragment if short/cryptic).
- If the target is very short ("Second one.", "This.", "Yep"), use the FULL thread. post_meaning must explain what it refers to.
- When BRAND CONTEXT is provided, your_take must come from THEIR lens (niche, expertise, beliefs) — not a random polite take.
- Do not write any reply text. Analysis only.`;

const WRITE_SYSTEM_PROMPT = `You are an elite personal-brand ghostwriter for X. You write the replies that grow accounts: specific, memorable, human, impossible to confuse with AI.

You receive LOCKED analysis. Do not reinterpret the post. Write from post_meaning + anchor_phrase + your_take.

WHAT MAKES A REPLY WIN ON X
- It proves you read THIS post (anchor or a concrete detail only this post has)
- It adds a take someone in this person's niche would actually say
- It sounds like a sharp human typing fast — not a coach, not LinkedIn, not ChatGPT
- It would look natural next to the voice examples provided
- Someone scrolling would remember the person who wrote it

DEFAULT BATCH (unless style is "question"):
- STATEMENTS ONLY. No question marks. No interview curiosity.
- Same post_meaning across all options — different angles:
  agree+detail | implication | nuance | operator-lens | mild-pushback
- Each option must be impossible without reading this exact post.
- Prefer concrete language: numbers, tradeoffs, lived detail, crisp judgments.
- Vary sentence rhythm across options (one punchy, one slightly longer, one dry).

NEVER
- Questions, "curious what...", "what made you...", "is there a story...", "how do you..."
- Aphorisms, philosophy, life lessons, motivational tone, LinkedIn voice
- "It's not X, it's Y", "At the end of the day", "The real X is Y", "food for thought", "resonates"
- Empty praise: "Great post", "So true", "Love this", "Well said", "This.", "100%", "Facts."
- Summarizing the post back, generic takes that fit any post, inventing facts
- "Honestly,", "Absolutely,", "Indeed,", "Ah,", "As someone who...", "In my experience,"
- Hashtags, markdown, quotes around the reply

Return ONLY valid JSON:
{"variants":[{"text":"reply","angle":"agree+detail","recommended":true,"rationale":"under 12 words"}]}

JSON rules:
- Each variant needs "angle".
- Mark at most one recommended when multiple variants requested — pick the one that best builds the brand.
- "text" is the raw reply only.`;

const RETRY_APPENDIX = `
QUALITY RETRY — previous drafts were dull, generic, or off-topic.
Rewrite like a top personal brand account would:
- Lead with a specific reaction to anchor_phrase
- Add a sharp take from the brand's niche/expertise/beliefs
- Sound like their example replies (rhythm + word choice)
- Zero filler, zero philosophy, zero AI phrases
- STATEMENTS ONLY unless a question was requested
Every option must feel sendable as-is.`;

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
  const voiceReady = isVoiceReady(settings);

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
  result.voiceReady = voiceReady;

  const minExpected = request.variant ? 1 : Math.min(count, 2);
  const needsRetry =
    result.replies.length < minExpected ||
    (!request.variant && result.replies.every((draft) => isBlandDraft(draft.text)));

  if (needsRetry && !request.variant) {
    const retryPrompt = `${prompt}\n${RETRY_APPENDIX}\n\nLOCKED ANCHOR: "${insight.anchor_phrase}"\nLOCKED MEANING: ${insight.post_meaning}\nLOCKED TAKE: ${insight.your_take}`;
    result = await invokeProvider(
      settings,
      retryPrompt,
      WRITE_SYSTEM_PROMPT,
      request.variant,
      parseOptions
    );
    result.insight = insight;
    result.voiceReady = voiceReady;
  }

  return result;
}

async function analyzePost(
  settings: AssistantSettings,
  request: ReplyGenerationRequest,
  targetText: string
): Promise<ReplyInsight> {
  const prompt = buildAnalysisPrompt(settings, request, targetText);

  try {
    const raw = await invokeProviderRaw(
      settings,
      prompt,
      ANALYSIS_SYSTEM_PROMPT,
      { temperature: 0.3, maxTokens: 550 }
    );
    const parsed = JSON.parse(extractJsonObject(raw)) as Partial<ReplyInsight>;
    const insight: ReplyInsight = {
      post_meaning: String(parsed.post_meaning ?? "").trim(),
      author_intent: String(parsed.author_intent ?? "").trim(),
      anchor_phrase: String(parsed.anchor_phrase ?? "").trim(),
      your_take: String(parsed.your_take ?? "").trim()
    };

    if (insight.post_meaning && insight.anchor_phrase) {
      if (!insight.your_take) {
        insight.your_take = brandFallbackTake(settings);
      }
      return insight;
    }
  } catch {
    // Fall through to heuristic insight.
  }

  return fallbackInsight(settings, request, targetText);
}

function brandFallbackTake(settings: AssistantSettings): string {
  const niche = settings.niche.trim();
  const belief = parseLines(settings.beliefs)[0];
  if (belief) {
    return `Connect their point to this belief: ${belief}`;
  }
  if (niche) {
    return `Add one concrete ${niche} operator detail that only someone in the space would notice.`;
  }
  return "Add one specific thought that shows you read their exact words.";
}

function fallbackInsight(
  settings: AssistantSettings,
  request: ReplyGenerationRequest,
  targetText: string
): ReplyInsight {
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
    your_take: brandFallbackTake(settings)
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

function describeBrandGoal(goal: AssistantSettings["brandGoal"]): string {
  switch (goal) {
    case "grow":
      return "Optimize for reach and follows — sharp, quotable, scroll-stopping specificity.";
    case "network":
      return "Optimize for relationship — warm, specific, leave room for a conversation later.";
    case "engage":
      return "Optimize for replies back — add a take that invites a thoughtful response without asking a question.";
    case "authority":
    default:
      return "Optimize for authority — sound like someone who has done the work; concrete and credible.";
  }
}

function buildBrandContext(settings: AssistantSettings): string[] {
  const lines: string[] = ["BRAND CONTEXT"];
  const niche = settings.niche.trim();
  const style = settings.personalStyle.trim();
  const expertise = parseLines(settings.expertise);
  const beliefs = parseLines(settings.beliefs);
  const signatures = parseLines(settings.signaturePhrases);

  if (style) {
    lines.push(`Voice: ${style}`);
  } else {
    lines.push(
      "Voice: direct personal-brand operator on X — specific, grounded, opinionated when earned, never hypey or preachy"
    );
  }
  if (niche) {
    lines.push(`Niche / known for: ${niche}`);
  }
  if (expertise.length > 0) {
    lines.push(`Expertise: ${expertise.slice(0, 8).join("; ")}`);
  }
  if (beliefs.length > 0) {
    lines.push(`Beliefs / hot takes to draw from: ${beliefs.slice(0, 6).join("; ")}`);
  }
  if (signatures.length > 0) {
    lines.push(`Signature phrases (use sparingly, only if natural): ${signatures.slice(0, 5).join("; ")}`);
  }
  lines.push(`Brand goal: ${describeBrandGoal(settings.brandGoal)}`);
  return lines;
}

function buildAnalysisPrompt(
  settings: AssistantSettings,
  request: ReplyGenerationRequest,
  targetText: string
): string {
  const target = handleOrName(request.targetHandle, request.targetAuthor, "the author");
  const lines = [
    "Analyze the target message before any reply is written.",
    "",
    `Target is by ${target}.`,
    `Target text length: ${targetText.length} characters.`,
    "",
    ...buildBrandContext(settings)
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

  lines.push(
    "",
    "your_take MUST reflect this brand's niche/expertise/beliefs when available.",
    "Return post_meaning, author_intent, anchor_phrase, your_take. No reply text."
  );
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
  const { kind, calibration } = classifyContext(request);
  const visibilityNote = describeVisibility(request.visibility);
  const examples = parseLines(settings.exampleReplies);
  const avoid = [...BUILTIN_AVOID, ...parseAvoidWords(settings.avoidWords)];
  const exampleCount = countExampleReplies(settings.exampleReplies);

  const lines = [
    "Ghostwrite premium X replies for a personal brand.",
    "",
    ...buildBrandContext(settings),
    "",
    "OUTPUT RULE",
    "Every reply is public brand equity. Prefer one sharp specific line over a polished generic paragraph.",
    "",
    "VOICE CONTROLS",
    `- Tone: ${request.variant ? describeTone(settings.tone) : describeToneForDefaultBatch(settings.tone)}`,
    `- Length: ${length}`,
    `- Emoji: ${emojiRule}`
  ];

  if (examples.length > 0) {
    lines.push(
      "",
      `MATCH THIS VOICE EXACTLY (${exampleCount} examples — rhythm, length, slang, punctuation):`
    );
    examples.slice(0, 10).forEach((example) => lines.push(`"${example}"`));
    lines.push(
      "Hard rule: if a draft wouldn't sit next to these examples in the same feed, rewrite it."
    );
  } else {
    lines.push(
      "",
      "No voice examples yet — write plain, punchy, human. Short sentences. Zero filler. Still specific to the post."
    );
  }

  if (avoid.length > 0) {
    lines.push("", `NEVER use: ${[...new Set(avoid)].slice(0, 28).join(", ")}`);
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
    `"""${getTargetText(request)}"""`,
    "",
    "LOCKED ANALYSIS (do not reinterpret — write from this):",
    `post_meaning: ${insight.post_meaning}`,
    `author_intent: ${insight.author_intent}`,
    `anchor_phrase: "${insight.anchor_phrase}"`,
    `your_take: ${insight.your_take}`,
    "",
    "Every reply must engage anchor_phrase and deliver your_take in this brand's voice.",
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
      "- Same post_meaning; different angles: agree+detail, implication, nuance, operator-lens, mild-pushback.",
      `- Each must reference "${insight.anchor_phrase}" or a concrete detail from the target.`,
      "- Each must sound like the same person wrote all of them.",
      "- Sound like someone building a personal brand — memorable, not polite.",
      count > 1
        ? "- Mark one recommended — the reply you'd actually send."
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
      temperature: variant ? 0.82 : 0.68,
      presence_penalty: variant ? 0.25 : 0.12,
      frequency_penalty: variant ? 0.25 : 0.12,
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
      max_tokens: 1400,
      temperature: variant ? 0.82 : 0.68,
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
          temperature: variant ? 0.82 : 0.68,
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
  const significant = extractSignificantWords(source);
  if (significant.length === 0) {
    const tokens = source
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length >= 3);
    return tokens.some((token) => draftLower.includes(token)) || draftLower.length >= 12;
  }

  const hits = significant.filter((word) => draftLower.includes(word)).length;
  return hits >= Math.min(2, significant.length);
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
  if (isBlandDraft(text)) {
    return true;
  }
  if (options.targetText && !hasContextualOverlap(text, options.targetText, options.contextTexts, options.anchorPhrase)) {
    return true;
  }
  return false;
}

function isBlandDraft(text: string): boolean {
  const value = text.trim().toLowerCase();
  if (!value) {
    return true;
  }
  if (
    /^(this|that|yeah|yep|true|facts|agree|same|exactly|needed this|so good|well put)\b/.test(value) &&
    value.length < 40
  ) {
    return true;
  }
  if (/^(great|amazing|awesome|incredible|powerful|important)\b/.test(value)) {
    return true;
  }
  // Too many soft openers → dull AI cadence
  if (/^(i think|i feel|i believe|it seems|it feels|interesting)\b/.test(value)) {
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
      const angle = record.angle ? String(record.angle).trim() : undefined;
      return {
        text: cleanReplyText(record.text),
        recommended: Boolean(record.recommended),
        rationale: rationale || undefined,
        angle: angle || undefined
      };
    })
    .filter((draft) => draft.text);

  const qualityFiltered = drafts.filter((draft) => !isLowQualityDraft(draft.text, options));
  if (qualityFiltered.length > 0) {
    drafts = qualityFiltered;
  } else {
    // Prefer nothing bland over shipping all low-quality drafts when possible
    const nonSlop = drafts.filter((draft) => !isAiSlop(draft.text) && (!options.allowQuestions ? !looksLikeQuestion(draft.text) : true));
    if (nonSlop.length > 0) {
      drafts = nonSlop;
    }
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
