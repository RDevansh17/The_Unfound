type RuntimeResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type ReplyGenerationResult = {
  replies: string[];
};

type ReplyContext = {
  targetText: string;
  targetAuthor?: string;
  targetHandle?: string;
  isTargetMine: boolean;
  rootText?: string;
  rootAuthor?: string;
  rootHandle?: string;
  isRootMine: boolean;
  isReply: boolean;
  sourceUrl: string;
};

type ArticleInfo = {
  text: string;
  name?: string;
  handle?: string;
};

type RegenVariant = "agree" | "contrarian" | "question" | "supportive" | "witty" | "professional";

const REGEN_OPTIONS: { value: RegenVariant; label: string }[] = [
  { value: "agree", label: "Agree" },
  { value: "contrarian", label: "Contrarian" },
  { value: "question", label: "Question" },
  { value: "supportive", label: "Supportive" },
  { value: "witty", label: "Witty" },
  { value: "professional", label: "Professional" }
];

let cachedOwnHandle: string | null = null;

const ARTICLE_SELECTOR = 'article[data-testid="tweet"]';
const TEXTBOX_SELECTOR =
  '[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]';
const BUTTON_CLASS = "xra-ai-reply-button";
const PANEL_ID = "xra-panel";

let scanTimer: number | undefined;
let lastTargetTextbox: HTMLElement | null = null;
let panelAnchor: HTMLElement | null = null;
let repositionHandler: (() => void) | null = null;
let isInsertingReply = false;
let sentWatchCleanup: (() => void) | null = null;
let watchedComposer: HTMLElement | null = null;
let regenOutsideHandler: ((event: MouseEvent) => void) | null = null;

injectStyles();
scheduleScan();

const observer = new MutationObserver(scheduleScan);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

document.addEventListener(
  "focusin",
  (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.matches(TEXTBOX_SELECTOR)) {
      lastTargetTextbox = target;
      addButtonToComposer(target);
    }
  },
  true
);

function scheduleScan(): void {
  window.clearTimeout(scanTimer);
  scanTimer = window.setTimeout(scanPage, 300);
}

function scanPage(): void {
  document.querySelectorAll<HTMLElement>(ARTICLE_SELECTOR).forEach(addButtonToArticle);
  document.querySelectorAll<HTMLElement>(TEXTBOX_SELECTOR).forEach(addButtonToComposer);
}

function addButtonToArticle(article: HTMLElement): void {
  if (article.dataset.xraAttached === "true") {
    return;
  }

  const actionBar = article.querySelector<HTMLElement>('[role="group"]');
  if (!actionBar) {
    return;
  }

  const button = createAssistantButton("AI Reply");
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await openAssistantForArticle(article, button);
  });

  const wrapper = document.createElement("div");
  wrapper.className = "xra-article-button-wrap";
  wrapper.append(button);
  actionBar.append(wrapper);
  article.dataset.xraAttached = "true";
}

function addButtonToComposer(textbox: HTMLElement): void {
  const host = findComposerButtonHost(textbox);
  if (!host || host.querySelector(`.${BUTTON_CLASS}`)) {
    return;
  }

  const button = createAssistantButton("AI Draft");
  button.classList.add("xra-composer-button");
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    lastTargetTextbox = textbox;
    await openAssistantForComposer(textbox, button);
  });

  host.append(button);
}

function createAssistantButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = BUTTON_CLASS;
  button.title = "Draft an AI-assisted reply";
  button.innerHTML =
    '<svg class="xra-btn-spark" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 2.75c.27 3.53 2.72 5.98 6.25 6.25-3.53.27-5.98 2.72-6.25 6.25-.27-3.53-2.72-5.98-6.25-6.25 3.53-.27 5.98-2.72 6.25-6.25Z"/><path d="M18.5 14.5c.13 1.6 1.15 2.62 2.75 2.75-1.6.13-2.62 1.15-2.75 2.75-.13-1.6-1.15-2.62-2.75-2.75 1.6-.13 2.62-1.15 2.75-2.75Z" opacity="0.7"/></svg>';
  const text = document.createElement("span");
  text.className = "xra-btn-text";
  text.textContent = label;
  button.append(text);
  return button;
}

async function openAssistantForArticle(article: HTMLElement, anchor: HTMLElement): Promise<void> {
  watchedComposer = null;
  const context = gatherReplyContext(article);
  if (!context.targetText) {
    showPanel(anchor, {
      status: "error",
      message: "I could not read this post yet. Try opening the post detail page and click AI Reply again."
    });
    return;
  }

  showPanel(anchor, { status: "loading", message: "Opening the reply composer..." });
  const textbox = await openReplyComposer(article);
  if (!textbox) {
    showPanel(anchor, {
      status: "error",
      message: "I could not open the X reply box. Open it manually, then use AI Draft near the composer."
    });
    return;
  }

  lastTargetTextbox = textbox;
  await generateAndShowReplies(context, anchor, textbox);
}

async function openAssistantForComposer(textbox: HTMLElement, anchor: HTMLElement): Promise<void> {
  watchedComposer = textbox;
  const article = findNearestContextArticle(textbox);
  const context = article ? gatherReplyContext(article) : getFallbackContext();
  await generateAndShowReplies(context, anchor, textbox);
}

async function generateAndShowReplies(
  context: ReplyContext,
  anchor: HTMLElement,
  textbox: HTMLElement
): Promise<void> {
  watchedComposer = textbox;
  if (!context.targetText.trim()) {
    showPanel(anchor, {
      status: "error",
      message: "I need visible post text to draft a useful reply."
    });
    return;
  }

  showPanel(anchor, { status: "loading", message: "Drafting thoughtful replies..." });

  try {
    const result = await sendRuntimeMessage<ReplyGenerationResult>({
      type: "GENERATE_REPLIES",
      payload: context
    });

    showPanel(anchor, {
      status: "ready",
      replies: result.replies,
      contextLabel: describeContextLabel(context),
      onSelect: (reply) => insertReply(textbox, reply),
      regenerate: async (variant) => {
        const regen = await sendRuntimeMessage<ReplyGenerationResult>({
          type: "GENERATE_REPLIES",
          payload: { ...context, variant, count: 1 }
        });
        return regen.replies[0] || "";
      }
    });
  } catch (error) {
    showPanel(anchor, {
      status: "error",
      message: error instanceof Error ? error.message : "Could not generate replies."
    });
  }
}

function getOwnHandle(): string | null {
  if (cachedOwnHandle) {
    return cachedOwnHandle;
  }

  const profileLink = document.querySelector<HTMLAnchorElement>('a[data-testid="AppTabBar_Profile_Link"]');
  const href = profileLink?.getAttribute("href");
  if (href && href.startsWith("/")) {
    cachedOwnHandle = href.slice(1).split("/")[0].toLowerCase();
    return cachedOwnHandle;
  }

  const accountSwitcher = document.querySelector<HTMLElement>('[data-testid="SideNav_AccountSwitcher_Button"]');
  const match = accountSwitcher?.innerText.match(/@([A-Za-z0-9_]{1,15})/);
  if (match) {
    cachedOwnHandle = match[1].toLowerCase();
    return cachedOwnHandle;
  }

  return null;
}

function getArticleInfo(article: HTMLElement): ArticleInfo {
  const text = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'))
    .map((node) => node.innerText.trim())
    .filter(Boolean)
    .join("\n\n");

  const userName = article.querySelector<HTMLElement>('[data-testid="User-Name"]');
  const nameText = userName?.innerText || "";
  const handleMatch = nameText.match(/@([A-Za-z0-9_]{1,15})/);
  const handle = handleMatch ? handleMatch[1].toLowerCase() : undefined;
  const name = nameText.split("\n")[0]?.trim() || undefined;

  return { text, name, handle };
}

function getReplyingToHandles(article: HTMLElement): string[] {
  const text = article.innerText || "";
  const marker = text.indexOf("Replying to");
  if (marker === -1) {
    return [];
  }

  const slice = text.slice(marker, marker + 160);
  return Array.from(slice.matchAll(/@([A-Za-z0-9_]{1,15})/g)).map((match) => match[1].toLowerCase());
}

function getConversationArticles(): HTMLElement[] {
  const column = document.querySelector<HTMLElement>('[data-testid="primaryColumn"]') || document.body;
  return Array.from(column.querySelectorAll<HTMLElement>(ARTICLE_SELECTOR));
}

function findMatchingPageArticle(info: ArticleInfo): HTMLElement | null {
  if (!info.text) {
    return null;
  }

  const needle = info.text.slice(0, 40);
  return (
    getConversationArticles().find((article) => {
      const candidate = getArticleInfo(article);
      return candidate.text.slice(0, 40) === needle && candidate.handle === info.handle;
    }) || null
  );
}

function gatherReplyContext(targetArticle: HTMLElement): ReplyContext {
  const own = getOwnHandle();
  const target = getArticleInfo(targetArticle);

  const onStatusPage = location.pathname.includes("/status/");
  const conversation = getConversationArticles();

  // When the target came from the compose dialog, map it back to the page article for thread context.
  const pageArticle = conversation.includes(targetArticle)
    ? targetArticle
    : findMatchingPageArticle(target);

  let rootInfo: ArticleInfo | undefined;
  let isReply = false;

  const targetIndex = pageArticle ? conversation.indexOf(pageArticle) : -1;

  if (onStatusPage && conversation.length > 0 && targetIndex > 0) {
    // Ancestors render above the target; the first article is the original post.
    rootInfo = getArticleInfo(conversation[0]);
    isReply = true;
  } else {
    // Timeline / dialog: a reply tweet shows a "Replying to @handle" line.
    const replyingTo = getReplyingToHandles(pageArticle || targetArticle).filter(
      (handle) => handle !== target.handle
    );
    if (replyingTo.length > 0) {
      isReply = true;
      rootInfo = { text: "", handle: replyingTo[0] };
    }
  }

  const rootHandle = rootInfo?.handle;

  return {
    targetText: target.text,
    targetAuthor: target.name,
    targetHandle: target.handle,
    isTargetMine: Boolean(own && target.handle && target.handle === own),
    rootText: rootInfo?.text || undefined,
    rootAuthor: rootInfo?.name,
    rootHandle,
    isRootMine: Boolean(own && rootHandle && rootHandle === own),
    isReply,
    sourceUrl: location.href
  };
}

function describeContextLabel(context: ReplyContext): string {
  const target = context.targetHandle ? `@${context.targetHandle}` : "a post";
  const root = context.rootHandle ? `@${context.rootHandle}` : "the original poster";

  if (!context.isReply) {
    return context.isTargetMine ? "Adding to your own post" : `Replying to ${target}'s post`;
  }

  if (context.isRootMine && !context.isTargetMine) {
    return `Replying to ${target}'s comment on your post`;
  }

  if (context.isTargetMine) {
    return "Continuing your own thread";
  }

  return `Replying to ${target}'s comment under ${root}`;
}

function getFallbackContext(): ReplyContext {
  const article = getVisibleArticles().at(-1);
  if (article) {
    return gatherReplyContext(article);
  }

  return {
    targetText: document.title,
    isTargetMine: false,
    isRootMine: false,
    isReply: false,
    sourceUrl: location.href
  };
}

function findNearestContextArticle(textbox: HTMLElement): HTMLElement | null {
  const dialogArticle = textbox.closest('[role="dialog"]')?.querySelector<HTMLElement>(ARTICLE_SELECTOR);
  if (dialogArticle) {
    return dialogArticle;
  }

  const textboxTop = textbox.getBoundingClientRect().top;
  const candidates = getVisibleArticles()
    .map((article) => ({
      article,
      distance: Math.abs(article.getBoundingClientRect().top - textboxTop)
    }))
    .sort((a, b) => a.distance - b.distance);

  return candidates[0]?.article || null;
}

function getVisibleArticles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(ARTICLE_SELECTOR)).filter((article) => {
    const rect = article.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  });
}

async function openReplyComposer(article: HTMLElement): Promise<HTMLElement | null> {
  const replyButton =
    article.querySelector<HTMLElement>('[data-testid="reply"]') ||
    Array.from(
      article.querySelectorAll<HTMLElement>('button[aria-label*="Reply"], div[role="button"][aria-label*="Reply"]')
    )[0];

  if (!replyButton) {
    return null;
  }

  replyButton.click();
  return waitForReplyTextbox();
}

async function waitForReplyTextbox(): Promise<HTMLElement | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 6000) {
    const replyBox = findReplyTextbox();
    if (replyBox) {
      replyBox.focus();
      lastTargetTextbox = replyBox;
      return replyBox;
    }

    await sleep(120);
  }

  return null;
}

function findReplyTextbox(): HTMLElement | null {
  const dialog =
    document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]') ||
    document.querySelector<HTMLElement>('[role="dialog"]');

  if (dialog) {
    const dialogBox = Array.from(dialog.querySelectorAll<HTMLElement>(TEXTBOX_SELECTOR)).find(
      (textbox) => isElementVisible(textbox) && textbox.getAttribute("aria-disabled") !== "true"
    );
    if (dialogBox) {
      return dialogBox;
    }
  }

  // Fallback for inline reply composers that are labeled as replies.
  return getEditableTextboxes().find((textbox) => isReplyComposer(textbox) && !isPrimaryComposeBox(textbox)) || null;
}

function isReplyComposer(textbox: HTMLElement): boolean {
  if (textbox.closest('[role="dialog"]')) {
    return true;
  }

  const label = `${textbox.getAttribute("aria-label") || ""}`.toLowerCase();
  if (label.includes("reply")) {
    return true;
  }

  // Inline reply composers can appear under a tweet outside a dialog.
  return Boolean(textbox.closest(ARTICLE_SELECTOR));
}

function isPrimaryComposeBox(textbox: HTMLElement): boolean {
  // The homepage / global "new post" composer is outside dialogs and outside tweet articles.
  if (textbox.closest('[role="dialog"]')) {
    return false;
  }

  if (textbox.closest(ARTICLE_SELECTOR)) {
    return false;
  }

  const label = `${textbox.getAttribute("aria-label") || ""}`.toLowerCase();
  if (label.includes("reply")) {
    return false;
  }

  return true;
}

function getActiveTextbox(): HTMLElement | null {
  const replyBox = findReplyTextbox();
  if (replyBox) {
    return replyBox;
  }

  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches(TEXTBOX_SELECTOR) && !isPrimaryComposeBox(active)) {
    return active;
  }

  if (lastTargetTextbox && document.contains(lastTargetTextbox) && !isPrimaryComposeBox(lastTargetTextbox)) {
    return lastTargetTextbox;
  }

  return null;
}

function getEditableTextboxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(TEXTBOX_SELECTOR)).filter(
    (textbox) => textbox.getAttribute("aria-disabled") !== "true" && isElementVisible(textbox)
  );
}

function findComposerButtonHost(textbox: HTMLElement): HTMLElement | null {
  // Keep AI Draft off the homepage "new post" composer so drafts don't get mixed into posts.
  if (isPrimaryComposeBox(textbox) && !isReplyComposer(textbox)) {
    return null;
  }

  const dialog =
    textbox.closest<HTMLElement>('[role="dialog"]') ||
    document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');

  // Mount beside the Reply/Post button, never inside the text editor chrome.
  const tweetButton =
    dialog?.querySelector<HTMLElement>('[data-testid="tweetButton"]') ||
    dialog?.querySelector<HTMLElement>('[data-testid="tweetButtonInline"]') ||
    document.querySelector<HTMLElement>('[role="dialog"] [data-testid="tweetButton"]') ||
    document.querySelector<HTMLElement>('[role="dialog"] [data-testid="tweetButtonInline"]');

  const mountParent = tweetButton?.parentElement;
  if (!mountParent) {
    return null;
  }

  if (mountParent.isContentEditable || mountParent.closest('[contenteditable="true"]')) {
    return null;
  }

  const existingHost = mountParent.querySelector<HTMLElement>(".xra-composer-button-host");
  if (existingHost) {
    return existingHost;
  }

  const host = document.createElement("div");
  host.className = "xra-composer-button-host xra-composer-button-host--action";
  mountParent.insertBefore(host, tweetButton);
  return host;
}

function insertReply(textbox: HTMLElement, reply: string): void {
  if (isInsertingReply) {
    return;
  }

  const target =
    findReplyTextbox() ||
    (document.contains(textbox) && !isPrimaryComposeBox(textbox) ? textbox : null) ||
    getActiveTextbox();

  if (!target || isPrimaryComposeBox(target)) {
    showPanel(null, {
      status: "error",
      message: "Open the reply box for that post first, then choose a draft."
    });
    return;
  }

  isInsertingReply = true;
  void (async () => {
    try {
      await setComposerText(target, reply);
      lastTargetTextbox = target;
      watchedComposer = target;
      closePanelAfterDelay();
    } finally {
      window.setTimeout(() => {
        isInsertingReply = false;
      }, 500);
    }
  })();
}

function normalizeReplyText(text: string): string {
  const value = text.replace(/\u00a0/g, " ").trim();
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

function getEditableRoot(target: HTMLElement): HTMLElement {
  if (target.isContentEditable) {
    return target;
  }

  return target.querySelector<HTMLElement>('[contenteditable="true"]') || target;
}

function readComposerText(editable: HTMLElement): string {
  return (editable.innerText || editable.textContent || "").replace(/\u00a0/g, " ").replace(/\n+$/g, "");
}

function isExactDuplicate(text: string, expected: string): boolean {
  const value = text.trim();
  return value === `${expected}${expected}` || (normalizeReplyText(value) === expected && value !== expected);
}

function selectAllInEditable(editable: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(editable);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function setComposerText(target: HTMLElement, reply: string): Promise<void> {
  const clean = normalizeReplyText(reply);
  const editable = getEditableRoot(target);

  // Canonical contenteditable insert that keeps X's editor in sync (backspace/typing work):
  // focus, select existing content, then a single native insertText.
  // Do NOT paste, dispatch synthetic input events, or blur/refocus afterwards —
  // any of those desync the editor selection and break editing.
  editable.focus();
  await sleep(30);

  selectAllInEditable(editable);
  const inserted = document.execCommand("insertText", false, clean);

  if (!inserted) {
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, clean);
  }

  await sleep(30);

  // Only repair if X mirrored the text into two copies. One more single insert, nothing else.
  if (isExactDuplicate(readComposerText(editable).trim(), clean)) {
    editable.focus();
    selectAllInEditable(editable);
    document.execCommand("insertText", false, clean);
  }
}

function showPanel(
  anchor: HTMLElement | null,
  state:
    | { status: "loading"; message: string }
    | { status: "error"; message: string }
    | {
        status: "ready";
        replies: string[];
        contextLabel?: string;
        onSelect: (reply: string) => void;
        regenerate?: (variant: RegenVariant) => Promise<string>;
      }
): void {
  closePanel(false);
  panelAnchor = anchor;

  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "AI reply drafts");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "xra-panel-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", () => closePanel());
  panel.append(close);

  const header = document.createElement("div");
  header.className = "xra-panel-header";

  const mark = document.createElement("div");
  mark.className = "xra-panel-mark";
  mark.innerHTML =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true"><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v8A2.5 2.5 0 0 1 18.5 16H9l-4.2 3.6A1 1 0 0 1 3 18.8V5.5Z" fill="currentColor"/></svg>';

  const titleWrap = document.createElement("div");
  const title = document.createElement("div");
  title.className = "xra-panel-title";
  title.textContent = "Reply drafts";
  const subtitle = document.createElement("div");
  subtitle.className = "xra-panel-subtitle";
  subtitle.textContent =
    state.status === "ready" ? "Select a draft to edit and insert." : "Writing a few options…";
  titleWrap.append(title, subtitle);
  header.append(mark, titleWrap);
  panel.append(header);

  const body = document.createElement("div");
  body.className = "xra-panel-body";
  body.addEventListener("click", (event) => {
    if (!(event.target as HTMLElement)?.closest(".xra-regen")) {
      closeAllRegenMenus();
    }
  });

  if (state.status === "ready") {
    renderReadyState(panel, body, subtitle, state.replies, state.onSelect, state.contextLabel, state.regenerate);
  } else if (state.status === "loading") {
    const loading = document.createElement("div");
    loading.className = "xra-loading-block";

    const spinner = document.createElement("div");
    spinner.className = "xra-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const message = document.createElement("p");
    message.className = "xra-loading";
    message.textContent = state.message;

    loading.append(spinner, message);
    body.append(loading);
  } else {
    const message = document.createElement("p");
    message.className = "xra-error";
    message.textContent = state.message;
    body.append(message);
  }

  panel.append(body);

  const footer = document.createElement("div");
  footer.className = "xra-panel-footer";
  footer.textContent = "Review before posting · Esc to close";
  panel.append(footer);

  document.body.append(panel);
  positionPanel(panel);
  requestAnimationFrame(() => panel.classList.add("xra-panel-visible"));

  window.addEventListener("keydown", handlePanelEscape, true);
  repositionHandler = () => positionPanel(panel);
  window.addEventListener("resize", repositionHandler);
  window.addEventListener("scroll", repositionHandler, true);

  regenOutsideHandler = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (target.closest(".xra-regen") || target.closest(".xra-regen-menu"))) {
      return;
    }
    closeAllRegenMenus();
  };
  document.addEventListener("click", regenOutsideHandler, true);

  startSentWatcher();
}

function startSentWatcher(): void {
  stopSentWatcher();

  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const submitButton = target.closest<HTMLElement>(
      '[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'
    );

    if (submitButton && submitButton.getAttribute("aria-disabled") !== "true") {
      confirmSendThenClose();
    }
  };

  const onKeydown = (event: KeyboardEvent): void => {
    // X posts a reply with Cmd/Ctrl + Enter.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      const active = document.activeElement;
      if (active instanceof HTMLElement && (active.matches(TEXTBOX_SELECTOR) || active.closest('[role="dialog"]'))) {
        confirmSendThenClose();
      }
    }
  };

  // Close the panel if the reply composer/dialog is dismissed (e.g. the X close button).
  let dismissTimer: number | undefined;
  const observer = new MutationObserver(() => {
    window.clearTimeout(dismissTimer);
    dismissTimer = window.setTimeout(() => {
      if (!watchedComposer) {
        return;
      }
      if (!document.contains(watchedComposer) && !findReplyTextbox()) {
        closePanel();
      }
    }, 200);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown, true);

  sentWatchCleanup = () => {
    window.clearTimeout(dismissTimer);
    observer.disconnect();
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeydown, true);
  };
}

function stopSentWatcher(): void {
  if (sentWatchCleanup) {
    sentWatchCleanup();
    sentWatchCleanup = null;
  }
}

function confirmSendThenClose(): void {
  // Only auto-close once the reply actually goes through:
  // the composer clears or the reply dialog/textbox is removed.
  const target = findReplyTextbox() || lastTargetTextbox;
  const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
  const hadText = target ? readComposerText(target).trim().length > 0 : true;
  const startedAt = Date.now();

  const poll = (): void => {
    const dialogGone = dialog ? !document.contains(dialog) : false;
    const textboxGone = target ? !document.contains(target) : false;
    const emptied =
      hadText && target && document.contains(target) ? readComposerText(target).trim().length === 0 : false;

    if (dialogGone || textboxGone || emptied) {
      closePanel();
      return;
    }

    if (Date.now() - startedAt < 4000) {
      window.setTimeout(poll, 150);
    }
  };

  window.setTimeout(poll, 150);
}

function renderReadyState(
  panel: HTMLElement,
  body: HTMLElement,
  subtitle: HTMLElement,
  replies: string[],
  onInsert: (reply: string) => void,
  contextLabel?: string,
  regenerate?: (variant: RegenVariant) => Promise<string>
): void {
  const labels = ["Agree + add", "Nuance", "Question"];

  const showList = (): void => {
    body.innerHTML = "";
    subtitle.textContent = "Select a draft to edit and insert.";

    const list = document.createElement("div");
    list.className = "xra-reply-list";

    if (contextLabel) {
      const context = document.createElement("div");
      context.className = "xra-context-chip";
      context.innerHTML =
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true"><path d="M12 2 4 6v6c0 5 3.4 8.3 8 10 4.6-1.7 8-5 8-10V6l-8-4Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      const label = document.createElement("span");
      label.textContent = contextLabel;
      context.append(label);
      list.append(context);
    }

    replies.forEach((reply, index) => {
      const label = labels[index] || `Option ${index + 1}`;
      let current = reply;

      const card = document.createElement("div");
      card.className = "xra-reply-choice";

      const topRow = document.createElement("div");
      topRow.className = "xra-reply-top";

      const meta = document.createElement("span");
      meta.className = "xra-reply-meta";

      const num = document.createElement("span");
      num.className = "xra-reply-num";
      num.textContent = String(index + 1).padStart(2, "0");

      const labelEl = document.createElement("span");
      labelEl.className = "xra-reply-label";
      labelEl.textContent = label;

      meta.append(num, labelEl);
      topRow.append(meta);

      const bodyText = document.createElement("span");
      bodyText.className = "xra-reply-body";
      bodyText.textContent = current;

      const actions = document.createElement("div");
      actions.className = "xra-reply-actions";

      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "xra-chip";
      copyBtn.innerHTML = actionIcon("copy") + "<span>Copy</span>";
      copyBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const ok = await copyToClipboard(current);
        const textEl = copyBtn.querySelector("span");
        if (textEl) {
          textEl.textContent = ok ? "Copied" : "Failed";
          window.setTimeout(() => {
            textEl.textContent = "Copy";
          }, 1300);
        }
      });

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "xra-chip";
      editBtn.innerHTML = actionIcon("edit") + "<span>Edit</span>";
      editBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showEditor(current, labelEl.textContent || label);
      });

      const insertBtn = document.createElement("button");
      insertBtn.type = "button";
      insertBtn.className = "xra-chip xra-chip-primary";
      insertBtn.innerHTML = actionIcon("insert") + "<span>Insert</span>";
      insertBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        onInsert(current);
      });

      actions.append(copyBtn, editBtn);

      if (regenerate) {
        const regenWrap = document.createElement("div");
        regenWrap.className = "xra-regen";

        const regenBtn = document.createElement("button");
        regenBtn.type = "button";
        regenBtn.className = "xra-chip";
        regenBtn.innerHTML = actionIcon("regen") + "<span>Regenerate</span>";

        const menu = document.createElement("div");
        menu.className = "xra-regen-menu";
        menu.hidden = true;
        panel.append(menu);

        REGEN_OPTIONS.forEach((option) => {
          const item = document.createElement("button");
          item.type = "button";
          item.className = "xra-regen-item";
          item.textContent = option.label;
          item.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            menu.hidden = true;

            card.classList.add("xra-reply-loading");
            const previous = bodyText.textContent;
            bodyText.textContent = `Writing a ${option.label.toLowerCase()} reply…`;

            try {
              const next = (await regenerate(option.value)).trim();
              if (next) {
                current = next;
                bodyText.textContent = next;
                labelEl.textContent = option.label;
              } else {
                bodyText.textContent = previous;
              }
            } catch {
              bodyText.textContent = previous;
            } finally {
              card.classList.remove("xra-reply-loading");
            }
          });
          menu.append(item);
        });

        regenBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const willOpen = menu.hidden;
          closeAllRegenMenus();
          if (!willOpen) {
            return;
          }

          menu.hidden = false;
          const buttonRect = regenBtn.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const menuHeight = menu.offsetHeight;
          const menuWidth = menu.offsetWidth;

          let top = buttonRect.top - panelRect.top - menuHeight - 6;
          if (top < 8) {
            top = buttonRect.bottom - panelRect.top + 6;
          }

          let left = buttonRect.left - panelRect.left;
          left = Math.min(left, panelRect.width - menuWidth - 8);
          left = Math.max(8, left);

          menu.style.top = `${top}px`;
          menu.style.left = `${left}px`;
        });

        regenWrap.append(regenBtn);
        actions.append(regenWrap);
      }

      actions.append(insertBtn);
      card.append(topRow, bodyText, actions);
      list.append(card);
    });

    body.append(list);
  };

  const showEditor = (reply: string, label: string): void => {
    body.innerHTML = "";
    subtitle.textContent = "Edit, then insert or copy.";

    const editorWrap = document.createElement("div");
    editorWrap.className = "xra-editor-wrap";

    const editorLabel = document.createElement("div");
    editorLabel.className = "xra-editor-label";
    editorLabel.textContent = label;

    const textarea = document.createElement("textarea");
    textarea.className = "xra-editor-textarea";
    textarea.value = reply;
    textarea.spellcheck = true;
    textarea.rows = 6;

    const counter = document.createElement("div");
    counter.className = "xra-editor-counter";
    const updateCounter = (): void => {
      const length = textarea.value.length;
      counter.textContent = `${length} / 280`;
      counter.classList.toggle("xra-editor-counter--over", length > 280);
    };
    updateCounter();
    textarea.addEventListener("input", updateCounter);

    const actions = document.createElement("div");
    actions.className = "xra-editor-actions";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "xra-btn xra-btn-ghost";
    backBtn.textContent = "Back";
    backBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showList();
    });

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "xra-btn xra-btn-secondary";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const ok = await copyToClipboard(textarea.value);
      copyBtn.textContent = ok ? "Copied" : "Copy failed";
      window.setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1400);
    });

    const insertBtn = document.createElement("button");
    insertBtn.type = "button";
    insertBtn.className = "xra-btn xra-btn-primary";
    insertBtn.textContent = "Insert into X";
    insertBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onInsert(textarea.value.trim());
    });

    actions.append(backBtn, copyBtn, insertBtn);

    const hint = document.createElement("p");
    hint.className = "xra-editor-hint";
    hint.textContent = "If X won't let you edit after inserting, use Copy and paste with Cmd/Ctrl + V.";

    editorWrap.append(editorLabel, textarea, counter, actions, hint);
    body.append(editorWrap);

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  };

  showList();
}

function actionIcon(kind: "copy" | "edit" | "insert" | "regen"): string {
  const icons: Record<typeof kind, string> = {
    copy: '<path d="M9 9V5.5A1.5 1.5 0 0 1 10.5 4h8A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H15" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="9" width="11" height="11" rx="1.5" stroke="currentColor" stroke-width="1.6"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M13.5 6.5l4 4" stroke="currentColor" stroke-width="1.6"/>',
    insert: '<path d="M12 4v12m0 0 4-4m-4 4-4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    regen: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 4v4h-4M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20v-4h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">${icons[kind]}</svg>`;
}

function closeAllRegenMenus(): void {
  document.querySelectorAll<HTMLElement>(`#${PANEL_ID} .xra-regen-menu`).forEach((menu) => {
    menu.hidden = true;
  });
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const helper = document.createElement("textarea");
      helper.value = text;
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.focus();
      helper.select();
      const ok = document.execCommand("copy");
      helper.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function handlePanelEscape(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closePanel();
  }
}

function closePanel(animate = true): void {
  window.removeEventListener("keydown", handlePanelEscape, true);
  if (regenOutsideHandler) {
    document.removeEventListener("click", regenOutsideHandler, true);
    regenOutsideHandler = null;
  }
  stopSentWatcher();
  if (repositionHandler) {
    window.removeEventListener("resize", repositionHandler);
    window.removeEventListener("scroll", repositionHandler, true);
    repositionHandler = null;
  }

  const panel = document.getElementById(PANEL_ID);
  if (!panel) {
    return;
  }

  if (!animate) {
    panel.remove();
    return;
  }

  panel.classList.remove("xra-panel-visible");
  window.setTimeout(() => panel.remove(), 160);
}

function positionPanel(panel: HTMLElement): void {
  const panelWidth = Math.min(420, window.innerWidth - 32);
  const maxHeight = Math.min(window.innerHeight - 32, 720);
  panel.style.width = `${panelWidth}px`;
  panel.style.maxHeight = `${maxHeight}px`;

  const dialog =
    document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]') ||
    document.querySelector<HTMLElement>('[role="dialog"]') ||
    panelAnchor?.closest<HTMLElement>('[role="dialog"]') ||
    null;

  const dialogRect = dialog?.getBoundingClientRect();
  const gap = 20;
  const pad = 16;

  let left = window.innerWidth - panelWidth - pad;
  let top = pad;

  if (dialogRect && dialogRect.width > 0) {
    const spaceRight = window.innerWidth - dialogRect.right - gap - pad;
    const spaceLeft = dialogRect.left - gap - pad;

    if (spaceRight >= panelWidth) {
      left = Math.round(dialogRect.right + gap);
      top = clamp(Math.round(dialogRect.top), pad, window.innerHeight - maxHeight - pad);
    } else if (spaceLeft >= panelWidth) {
      left = Math.round(dialogRect.left - gap - panelWidth);
      top = clamp(Math.round(dialogRect.top), pad, window.innerHeight - maxHeight - pad);
    } else {
      // Not enough side room: dock top-right of the viewport so the compose controls stay free.
      left = window.innerWidth - panelWidth - pad;
      top = pad;
    }
  }

  panel.style.top = `${top}px`;
  panel.style.left = `${left}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function closePanelAfterDelay(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) {
    return;
  }

  panel.classList.add("xra-panel-success");
  window.setTimeout(() => closePanel(), 420);
}

function sendRuntimeMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<T> | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok) {
        reject(new Error(response?.error || "Extension background service unavailable."));
        return;
      }

      resolve(response.data as T);
    });
  });
}

function isElementVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function injectStyles(): void {
  if (document.getElementById("xra-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "xra-styles";
  style.textContent = `
    .${BUTTON_CLASS} {
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      color: #e7e9ea;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      font: 600 12.5px/1 "Manrope", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
      gap: 5px;
      height: 30px;
      letter-spacing: 0.01em;
      margin: 0;
      padding: 0 13px;
      position: relative;
      transition: background 140ms ease, border-color 140ms ease, transform 120ms ease;
      white-space: nowrap;
      z-index: 5;
    }

    .${BUTTON_CLASS}:hover {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.3);
    }

    .${BUTTON_CLASS}:active {
      transform: scale(0.97);
    }

    .xra-btn-spark {
      color: #4fa8f5;
      flex-shrink: 0;
    }

    .${BUTTON_CLASS} .xra-btn-text {
      background: linear-gradient(180deg, #ffffff, #c9d3de);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .xra-article-button-wrap {
      align-items: center;
      display: inline-flex;
      flex-shrink: 0;
      margin-left: 4px;
    }

    .xra-composer-button-host {
      align-items: center;
      display: inline-flex;
      justify-content: flex-start;
      margin: 0 10px 0 0;
      position: relative;
      z-index: 6;
    }

    .xra-composer-button-host--action {
      margin: 0 12px 0 0;
    }

    .xra-composer-button {
      margin: 0;
    }

    #${PANEL_ID} {
      -webkit-font-smoothing: antialiased;
      backdrop-filter: blur(20px);
      background: linear-gradient(180deg, rgba(15, 20, 30, 0.98), rgba(9, 12, 19, 0.98));
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.05);
      color: #eef3f8;
      display: flex;
      flex-direction: column;
      font-family: "Manrope", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      opacity: 0;
      overflow: hidden;
      position: fixed;
      transform: translateY(8px) scale(0.99);
      transition: opacity 150ms ease, transform 150ms ease;
      width: min(408px, calc(100vw - 32px));
      z-index: 2147483647;
    }

    #${PANEL_ID}.xra-panel-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .xra-panel-header {
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      display: flex;
      gap: 11px;
      padding: 16px 48px 15px 18px;
    }

    .xra-panel-mark {
      align-items: center;
      background: linear-gradient(150deg, #1d9bf0, #0b5f9e);
      border-radius: 10px;
      box-shadow: 0 6px 16px rgba(29, 155, 240, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.25);
      color: #fff;
      display: grid;
      flex-shrink: 0;
      height: 32px;
      place-items: center;
      width: 32px;
    }

    .xra-panel-title {
      font-size: 15px;
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .xra-panel-subtitle {
      color: #6b7787;
      font-size: 12px;
      line-height: 1.4;
      margin-top: 2px;
    }

    .xra-panel-close {
      align-items: center;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 9px;
      color: #9aa7b6;
      cursor: pointer;
      display: grid;
      font-size: 18px;
      height: 30px;
      line-height: 1;
      place-items: center;
      position: absolute;
      right: 14px;
      top: 14px;
      transition: background 120ms ease, color 120ms ease;
      width: 30px;
    }

    .xra-panel-close:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #eef3f8;
    }

    .xra-panel-body {
      flex: 1 1 auto;
      overflow: auto;
      padding: 14px;
    }

    .xra-panel-footer {
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      color: #6b7787;
      font-size: 11px;
      letter-spacing: 0.01em;
      padding: 11px 18px 13px;
    }

    .xra-loading-block {
      align-items: center;
      display: grid;
      gap: 12px;
      justify-items: start;
      min-height: 120px;
      padding: 18px 8px;
    }

    .xra-spinner {
      animation: xra-spin 0.8s linear infinite;
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 999px;
      border-top-color: #1d9bf0;
      height: 22px;
      width: 22px;
    }

    @keyframes xra-spin {
      to {
        transform: rotate(360deg);
      }
    }

    .xra-loading,
    .xra-error {
      color: #9aa7b6;
      font-size: 14px;
      line-height: 1.5;
      margin: 0;
    }

    .xra-error {
      color: #fb7185;
      padding: 12px 6px;
    }

    .xra-reply-list {
      display: grid;
      gap: 9px;
    }

    .xra-context-chip {
      align-items: center;
      background: rgba(29, 155, 240, 0.1);
      border: 1px solid rgba(29, 155, 240, 0.22);
      border-radius: 10px;
      color: #7dd3fc;
      display: flex;
      font-size: 12px;
      font-weight: 700;
      gap: 7px;
      margin-bottom: 3px;
      padding: 8px 11px;
    }

    .xra-context-chip svg {
      flex-shrink: 0;
    }

    .xra-reply-choice {
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      color: #eef3f8;
      display: grid;
      gap: 10px;
      padding: 14px 15px;
      position: relative;
      text-align: left;
      transition: background 140ms ease, border-color 140ms ease;
    }

    .xra-reply-choice::before {
      background: #1d9bf0;
      border-radius: 0 3px 3px 0;
      content: "";
      left: 0;
      opacity: 0;
      position: absolute;
      top: 14px;
      bottom: 14px;
      transition: opacity 140ms ease;
      width: 3px;
    }

    .xra-reply-choice:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.16);
    }

    .xra-reply-choice:hover::before,
    .xra-reply-choice:focus-within::before {
      opacity: 1;
    }

    .xra-reply-top {
      align-items: center;
      display: flex;
      justify-content: space-between;
    }

    .xra-reply-meta {
      align-items: baseline;
      display: flex;
      gap: 8px;
    }

    .xra-reply-num {
      color: #4a5768;
      font-size: 11px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.05em;
    }

    .xra-reply-label {
      color: #9aa7b6;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .xra-reply-body {
      color: #dbe3ec;
      font: 500 14px/1.5 "Manrope", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
    }

    .xra-reply-actions {
      display: flex;
      gap: 7px;
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      transform: translateY(-4px);
      transition: opacity 150ms ease, max-height 150ms ease, transform 150ms ease;
    }

    .xra-reply-choice:hover .xra-reply-actions,
    .xra-reply-choice:focus-within .xra-reply-actions {
      max-height: 48px;
      opacity: 1;
      transform: translateY(0);
    }

    .xra-chip {
      align-items: center;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 9px;
      color: #cdd7e1;
      cursor: pointer;
      display: inline-flex;
      font: 700 12px/1 "Manrope", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
      gap: 6px;
      padding: 7px 11px;
      transition: background 130ms ease, border-color 130ms ease, color 130ms ease;
    }

    .xra-chip svg {
      flex-shrink: 0;
    }

    .xra-chip:hover {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
    }

    .xra-chip-primary {
      background: rgba(29, 155, 240, 0.16);
      border-color: rgba(29, 155, 240, 0.45);
      color: #6aa8ff;
      margin-left: auto;
    }

    .xra-chip-primary:hover {
      background: rgba(29, 155, 240, 0.26);
      color: #eaf5ff;
    }

    .xra-regen {
      position: relative;
    }

    .xra-regen-menu {
      background: #141b28;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
      display: grid;
      gap: 2px;
      min-width: 150px;
      padding: 6px;
      position: absolute;
      z-index: 10;
    }

    .xra-regen-menu[hidden] {
      display: none;
    }

    .xra-regen-item {
      background: transparent;
      border: 0;
      border-radius: 8px;
      color: #cdd7e1;
      cursor: pointer;
      font: 600 13px/1 "Manrope", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
      padding: 9px 10px;
      text-align: left;
      transition: background 120ms ease, color 120ms ease;
    }

    .xra-regen-item:hover {
      background: rgba(29, 155, 240, 0.16);
      color: #eaf5ff;
    }

    .xra-reply-loading .xra-reply-body {
      color: #8b98a5;
      font-style: italic;
    }

    .xra-reply-loading {
      opacity: 0.85;
    }

    .xra-editor-wrap {
      display: grid;
      gap: 10px;
    }

    .xra-editor-label {
      color: #9aa7b6;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    .xra-editor-textarea {
      background: rgba(0, 0, 0, 0.28);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 13px;
      color: #eef3f8;
      font: 500 14px/1.55 "Manrope", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
      min-height: 132px;
      padding: 12px 14px;
      resize: vertical;
      width: 100%;
    }

    .xra-editor-textarea:focus {
      background: rgba(0, 0, 0, 0.34);
      border-color: rgba(29, 155, 240, 0.7);
      box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.18);
      outline: 0;
    }

    .xra-editor-counter {
      color: #6b7787;
      font-size: 12px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      text-align: right;
    }

    .xra-editor-counter--over {
      color: #fb7185;
    }

    .xra-editor-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .xra-btn {
      border: 0;
      border-radius: 999px;
      cursor: pointer;
      font: 700 13px/1 "Manrope", ui-sans-serif, system-ui, "Segoe UI", sans-serif;
      padding: 11px 17px;
      transition: transform 120ms ease, background 120ms ease, border-color 120ms ease;
    }

    .xra-btn:active {
      transform: translateY(1px);
    }

    .xra-btn-primary {
      background: linear-gradient(135deg, #1d9bf0, #0b5f9e);
      box-shadow: 0 10px 22px rgba(29, 155, 240, 0.28);
      color: #fff;
    }

    .xra-btn-primary:hover {
      box-shadow: 0 14px 28px rgba(29, 155, 240, 0.4);
    }

    .xra-btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: #eef3f8;
    }

    .xra-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.14);
    }

    .xra-btn-ghost {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #9aa7b6;
      margin-right: auto;
    }

    .xra-btn-ghost:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #eef3f8;
    }

    .xra-editor-hint {
      color: #6b7787;
      font-size: 11px;
      line-height: 1.45;
      margin: 2px 0 0;
    }

    .xra-panel-success {
      outline: 2px solid rgba(29, 155, 240, 0.75);
    }
  `;
  document.documentElement.append(style);
}
