# X Reply Assistant

A Chrome Extension MVP for drafting AI-assisted replies on X posts and on replies that other people leave under your posts.

The first version is built for private use: you add your own AI provider API key in the extension settings, open X, and choose an AI-generated draft before posting manually.

## What it does

- Adds a **Reply** button to visible X posts and near reply composers.
- Opens the native X reply composer when possible.
- Reads the nearest post/reply text (plus thread and own-vs-others context) to draft in context.
- Generates a configurable number of distinct reply options (1–6) and marks one as recommended.
- Lets you regenerate a single draft in a specific style, or regenerate the whole set.
- Inserts the selected draft into the reply box for you to review and post.
- Supports OpenAI, Anthropic, Gemini, Groq, and OpenAI-compatible APIs.
- Lets you tune tone, length, reply count, emoji preference, personal writing style, example replies, and words to avoid.

## Local development

```bash
npm install
npm run build
```

Then load the extension in Chrome:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the generated `dist` folder.
5. Open the extension settings and add your API key.
6. Visit `https://x.com` and use **AI Reply** or **AI Draft**.

## Configuration notes

For private use, the API key is stored in Chrome sync storage and AI calls are made directly from the extension background service worker.

Before releasing publicly as a paid product, move AI calls behind a backend service so you can safely handle:

- User accounts and authentication
- Stripe subscriptions
- Usage limits and rate limiting
- Abuse prevention
- Prompt/version management
- Provider routing and cost controls
- Analytics and support tooling

## Safety and platform compliance

This extension drafts text only. It does not auto-post replies. You stay in control and manually review before publishing.