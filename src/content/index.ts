type RuntimeResponse<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

type ReplyGenerationResult = {
  replies: string[];
};

type ReplyContext = {
  postText: string;
  authorName?: string;
  sourceUrl: string;
};

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
  button.textContent = label;
  button.title = "Draft an AI-assisted reply";
  return button;
}

async function openAssistantForArticle(article: HTMLElement, anchor: HTMLElement): Promise<void> {
  const context = getContextFromArticle(article);
  if (!context.postText) {
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
  const article = findNearestContextArticle(textbox);
  const context = article ? getContextFromArticle(article) : getFallbackContext();
  await generateAndShowReplies(context, anchor, textbox);
}

async function generateAndShowReplies(
  context: ReplyContext,
  anchor: HTMLElement,
  textbox: HTMLElement
): Promise<void> {
  if (!context.postText.trim()) {
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
      onSelect: (reply) => insertReply(textbox, reply)
    });
  } catch (error) {
    showPanel(anchor, {
      status: "error",
      message: error instanceof Error ? error.message : "Could not generate replies."
    });
  }
}

function getContextFromArticle(article: HTMLElement): ReplyContext {
  const textNodes = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'));
  const postText = textNodes
    .map((node) => node.innerText.trim())
    .filter(Boolean)
    .join("\n\n");
  const authorName = article
    .querySelector<HTMLElement>('[data-testid="User-Name"] span')
    ?.innerText.trim();

  return {
    postText,
    authorName,
    sourceUrl: location.href
  };
}

function getFallbackContext(): ReplyContext {
  const article = getVisibleArticles().at(-1);
  return article ? getContextFromArticle(article) : { postText: document.title, sourceUrl: location.href };
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
    | { status: "ready"; replies: string[]; onSelect: (reply: string) => void }
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
  mark.textContent = "XR";

  const titleWrap = document.createElement("div");
  const title = document.createElement("div");
  title.className = "xra-panel-title";
  title.textContent = "Reply drafts";
  const subtitle = document.createElement("div");
  subtitle.className = "xra-panel-subtitle";
  subtitle.textContent =
    state.status === "ready"
      ? "Pick a draft, edit it here, then insert or copy."
      : "Crafting replies that feel human.";
  titleWrap.append(title, subtitle);
  header.append(mark, titleWrap);
  panel.append(header);

  const body = document.createElement("div");
  body.className = "xra-panel-body";

  if (state.status === "ready") {
    renderReadyState(body, subtitle, state.replies, state.onSelect);
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
}

function renderReadyState(
  body: HTMLElement,
  subtitle: HTMLElement,
  replies: string[],
  onInsert: (reply: string) => void
): void {
  const labels = ["Agree + add", "Nuance", "Question"];

  const showList = (): void => {
    body.innerHTML = "";
    subtitle.textContent = "Pick a draft, edit it here, then insert or copy.";

    const list = document.createElement("div");
    list.className = "xra-reply-list";

    replies.forEach((reply, index) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "xra-reply-choice";

      const topRow = document.createElement("div");
      topRow.className = "xra-reply-top";

      const label = document.createElement("span");
      label.className = "xra-reply-label";
      label.textContent = labels[index] || `Option ${index + 1}`;

      const action = document.createElement("span");
      action.className = "xra-reply-action";
      action.textContent = "Edit / Insert";

      topRow.append(label, action);

      const bodyText = document.createElement("span");
      bodyText.className = "xra-reply-body";
      bodyText.textContent = reply;

      card.append(topRow, bodyText);
      card.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        showEditor(reply, labels[index] || `Option ${index + 1}`);
      });
      list.append(card);
    });

    body.append(list);
  };

  const showEditor = (reply: string, label: string): void => {
    body.innerHTML = "";
    subtitle.textContent = "Edit freely here, then Insert into X or Copy.";

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
      background: #1d9bf0;
      border: 0;
      border-radius: 999px;
      box-shadow: 0 8px 20px rgba(29, 155, 240, 0.28);
      color: #fff;
      cursor: pointer;
      display: inline-flex;
      flex-shrink: 0;
      font: 700 12px/1.2 "Avenir Next", "Segoe UI", sans-serif;
      margin: 0 8px;
      padding: 8px 14px;
      position: relative;
      white-space: nowrap;
      z-index: 5;
    }

    .${BUTTON_CLASS}:hover {
      background: #1a8cd8;
    }

    .xra-article-button-wrap {
      align-items: center;
      display: flex;
      flex-shrink: 0;
    }

    .xra-composer-button-host {
      align-items: center;
      display: flex;
      justify-content: flex-start;
      margin: 0 8px 0 0;
      position: relative;
      z-index: 6;
    }

    .xra-composer-button-host--action {
      margin: 0 10px 0 0;
    }

    .xra-composer-button {
      margin: 0;
    }

    #${PANEL_ID} {
      backdrop-filter: blur(18px);
      background:
        radial-gradient(circle at top right, rgba(29, 155, 240, 0.18), transparent 34%),
        linear-gradient(180deg, rgba(10, 16, 26, 0.98), rgba(7, 11, 18, 0.98));
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 24px;
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);
      color: #f7f9f9;
      display: flex;
      flex-direction: column;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      opacity: 0;
      overflow: hidden;
      position: fixed;
      transform: translateY(10px) scale(0.98);
      transition: opacity 160ms ease, transform 160ms ease;
      width: min(420px, calc(100vw - 32px));
      z-index: 2147483647;
    }

    #${PANEL_ID}.xra-panel-visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }

    .xra-panel-header {
      align-items: center;
      display: flex;
      gap: 12px;
      padding: 18px 48px 14px 18px;
    }

    .xra-panel-mark {
      align-items: center;
      background: linear-gradient(145deg, #1d9bf0, #0b5f9e);
      border-radius: 12px;
      color: #fff;
      display: grid;
      flex-shrink: 0;
      font-size: 11px;
      font-weight: 800;
      height: 36px;
      justify-content: center;
      letter-spacing: 0.04em;
      width: 36px;
    }

    .xra-panel-title {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.03em;
    }

    .xra-panel-subtitle {
      color: #8b98a5;
      font-size: 12px;
      line-height: 1.4;
      margin-top: 3px;
    }

    .xra-panel-close {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      color: #cfd9de;
      cursor: pointer;
      font-size: 20px;
      height: 32px;
      line-height: 1;
      position: absolute;
      right: 12px;
      top: 12px;
      width: 32px;
    }

    .xra-panel-close:hover {
      background: rgba(255, 255, 255, 0.12);
    }

    .xra-panel-body {
      flex: 1 1 auto;
      overflow: auto;
      padding: 0 14px 14px;
    }

    .xra-panel-footer {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      color: #8b98a5;
      font-size: 11px;
      letter-spacing: 0.02em;
      padding: 12px 18px 14px;
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
      border: 2px solid rgba(255, 255, 255, 0.12);
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
      color: #cfd9de;
      font-size: 14px;
      line-height: 1.45;
      margin: 0;
    }

    .xra-error {
      color: #ffb4b4;
      padding: 12px 6px;
    }

    .xra-reply-list {
      display: grid;
      gap: 10px;
    }

    .xra-reply-choice {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 18px;
      color: #f7f9f9;
      cursor: pointer;
      display: grid;
      gap: 8px;
      padding: 14px;
      text-align: left;
      transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
    }

    .xra-reply-choice:hover {
      background: rgba(29, 155, 240, 0.14);
      border-color: rgba(29, 155, 240, 0.55);
      transform: translateY(-1px);
    }

    .xra-reply-top {
      align-items: center;
      display: flex;
      justify-content: space-between;
    }

    .xra-reply-label {
      color: #7dd3fc;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .xra-reply-action {
      background: rgba(29, 155, 240, 0.16);
      border-radius: 999px;
      color: #e8f6ff;
      font-size: 11px;
      font-weight: 800;
      padding: 4px 10px;
    }

    .xra-reply-body {
      font: 500 14px/1.45 "Avenir Next", "Segoe UI", sans-serif;
    }

    .xra-editor-wrap {
      display: grid;
      gap: 10px;
    }

    .xra-editor-label {
      color: #7dd3fc;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .xra-editor-textarea {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 14px;
      color: #f7f9f9;
      font: 500 14px/1.5 "Avenir Next", "Segoe UI", sans-serif;
      min-height: 132px;
      padding: 12px 14px;
      resize: vertical;
      width: 100%;
    }

    .xra-editor-textarea:focus {
      border-color: rgba(29, 155, 240, 0.7);
      box-shadow: 0 0 0 3px rgba(29, 155, 240, 0.2);
      outline: 0;
    }

    .xra-editor-counter {
      color: #8b98a5;
      font-size: 12px;
      font-weight: 700;
      text-align: right;
    }

    .xra-editor-counter--over {
      color: #ffb4b4;
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
      font: 700 13px/1 "Avenir Next", "Segoe UI", sans-serif;
      padding: 10px 16px;
      transition: filter 120ms ease, background 120ms ease;
    }

    .xra-btn-primary {
      background: #1d9bf0;
      color: #fff;
    }

    .xra-btn-primary:hover {
      background: #1a8cd8;
    }

    .xra-btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #f7f9f9;
    }

    .xra-btn-secondary:hover {
      background: rgba(255, 255, 255, 0.18);
    }

    .xra-btn-ghost {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #cfd9de;
      margin-right: auto;
    }

    .xra-btn-ghost:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .xra-editor-hint {
      color: #8b98a5;
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
