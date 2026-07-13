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
const TEXTBOX_SELECTOR = '[data-testid^="tweetTextarea_"][role="textbox"], div[role="textbox"][contenteditable="true"]';
const BUTTON_CLASS = "xra-ai-reply-button";
const PANEL_ID = "xra-panel";

let scanTimer: number | undefined;
let lastTargetTextbox: HTMLElement | null = null;

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
  const container = findComposerContainer(textbox);
  if (!container || container.querySelector(`.${BUTTON_CLASS}`)) {
    return;
  }

  const button = createAssistantButton("AI Draft");
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    lastTargetTextbox = textbox;
    await openAssistantForComposer(textbox, button);
  });

  const controls = container.querySelector<HTMLElement>('[role="group"]') || container;
  controls.append(button);
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
  const existing = getActiveTextbox();
  const replyButton =
    article.querySelector<HTMLElement>('[data-testid="reply"]') ||
    Array.from(article.querySelectorAll<HTMLElement>('button[aria-label*="Reply"], div[role="button"][aria-label*="Reply"]'))[0];

  replyButton?.click();

  const textbox = await waitForTextbox(existing);
  return textbox;
}

async function waitForTextbox(previous: HTMLElement | null): Promise<HTMLElement | null> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 5000) {
    const textboxes = getEditableTextboxes();
    const fresh = textboxes.find((textbox) => textbox !== previous && isElementVisible(textbox));
    if (fresh) {
      return fresh;
    }

    const active = getActiveTextbox();
    if (active) {
      return active;
    }

    await sleep(150);
  }

  return null;
}

function getActiveTextbox(): HTMLElement | null {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.matches(TEXTBOX_SELECTOR)) {
    return active;
  }

  return lastTargetTextbox && document.contains(lastTargetTextbox) ? lastTargetTextbox : null;
}

function getEditableTextboxes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(TEXTBOX_SELECTOR)).filter(
    (textbox) => textbox.getAttribute("aria-disabled") !== "true"
  );
}

function findComposerContainer(textbox: HTMLElement): HTMLElement | null {
  return (
    textbox.closest<HTMLElement>('[data-testid="tweetTextarea_0"]')?.parentElement?.parentElement?.parentElement ||
    textbox.closest<HTMLElement>('form, [role="dialog"], [data-testid="toolBar"]') ||
    textbox.parentElement
  );
}

function insertReply(textbox: HTMLElement, reply: string): void {
  const target = document.contains(textbox) ? textbox : getActiveTextbox();
  if (!target) {
    showPanel(null, {
      status: "error",
      message: "Open a reply box first, then choose a draft."
    });
    return;
  }

  target.focus();
  document.execCommand("selectAll", false);
  document.execCommand("insertText", false, reply);
  target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: reply }));
  lastTargetTextbox = target;
  closePanelAfterDelay();
}

function showPanel(
  anchor: HTMLElement | null,
  state:
    | { status: "loading"; message: string }
    | { status: "error"; message: string }
    | { status: "ready"; replies: string[]; onSelect: (reply: string) => void }
): void {
  document.getElementById(PANEL_ID)?.remove();

  const panel = document.createElement("div");
  panel.id = PANEL_ID;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "xra-panel-close";
  close.textContent = "x";
  close.addEventListener("click", () => panel.remove());
  panel.append(close);

  const title = document.createElement("div");
  title.className = "xra-panel-title";
  title.textContent = "X Reply Assistant";
  panel.append(title);

  if (state.status === "ready") {
    const list = document.createElement("div");
    list.className = "xra-reply-list";

    state.replies.forEach((reply) => {
      const replyButton = document.createElement("button");
      replyButton.type = "button";
      replyButton.className = "xra-reply-choice";
      replyButton.textContent = reply;
      replyButton.addEventListener("click", () => state.onSelect(reply));
      list.append(replyButton);
    });

    panel.append(list);
  } else {
    const message = document.createElement("p");
    message.className = state.status === "error" ? "xra-error" : "xra-loading";
    message.textContent = state.message;
    panel.append(message);
  }

  document.body.append(panel);
  positionPanel(panel, anchor);
}

function positionPanel(panel: HTMLElement, anchor: HTMLElement | null): void {
  const anchorRect = anchor?.getBoundingClientRect();
  const top = anchorRect ? Math.min(anchorRect.bottom + 8, window.innerHeight - 260) : 80;
  const left = anchorRect ? Math.min(anchorRect.left, window.innerWidth - 380) : window.innerWidth - 400;

  panel.style.top = `${Math.max(16, top)}px`;
  panel.style.left = `${Math.max(16, left)}px`;
}

function closePanelAfterDelay(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) {
    return;
  }

  panel.classList.add("xra-panel-success");
  window.setTimeout(() => panel.remove(), 700);
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
      background: linear-gradient(135deg, #1d9bf0, #8b5cf6);
      border: 0;
      border-radius: 999px;
      color: #fff;
      cursor: pointer;
      display: inline-flex;
      font: 700 12px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      margin: 0 8px;
      padding: 7px 12px;
      white-space: nowrap;
    }

    .${BUTTON_CLASS}:hover {
      filter: brightness(1.08);
    }

    .xra-article-button-wrap {
      align-items: center;
      display: flex;
    }

    #${PANEL_ID} {
      background: #0f1419;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 18px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      color: #f7f9f9;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      max-width: 360px;
      padding: 16px;
      position: fixed;
      width: min(360px, calc(100vw - 32px));
      z-index: 2147483647;
    }

    .xra-panel-title {
      font-size: 15px;
      font-weight: 800;
      margin: 0 32px 12px 0;
    }

    .xra-panel-close {
      background: transparent;
      border: 0;
      color: #8b98a5;
      cursor: pointer;
      font-size: 16px;
      position: absolute;
      right: 12px;
      top: 10px;
    }

    .xra-loading,
    .xra-error {
      color: #cfd9de;
      font-size: 14px;
      line-height: 1.4;
      margin: 0;
    }

    .xra-error {
      color: #ffb4b4;
    }

    .xra-reply-list {
      display: grid;
      gap: 10px;
    }

    .xra-reply-choice {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 14px;
      color: #f7f9f9;
      cursor: pointer;
      font: 500 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 12px;
      text-align: left;
    }

    .xra-reply-choice:hover {
      background: rgba(29, 155, 240, 0.22);
      border-color: rgba(29, 155, 240, 0.5);
    }

    .xra-panel-success {
      outline: 2px solid rgba(29, 155, 240, 0.75);
    }
  `;
  document.documentElement.append(style);
}
