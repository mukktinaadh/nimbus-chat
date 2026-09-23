# Nimbus — General AI Chatbot

A minimal, complete example of how a modern AI chat app is put together: a React UI, a
small Node server that owns the provider key, and a response that streams back token by
token into the conversation.

```
Browser (React + Vite)
        │  POST /api/chat  { messages: [...] }
        ▼
Express API  ── validates, adds the system prompt, caps size
        │  OpenAI-compatible  POST /chat/completions  (stream: true)
        ▼
LLM provider       NVIDIA NIM (cloud, key required)  |  Ollama (local, no key)
        │  Server-Sent Events
        ▼
Express API  ── delta · done · error
        │  fetch + ReadableStream
        ▼
React appends each chunk to the assistant turn
```

## What it does

- Start a conversation, send messages, get streamed replies.
- Full context: the whole conversation is sent with every request.
- New chat resets the conversation, input, error, and generation state.
- Stop generation mid-stream (the upstream request is aborted server-side too).
- Clear error handling for missing keys, bad keys, rate limits, unknown models, an
  unreachable runtime, and interrupted streams.
- Dark and light themes (follows the OS, remembers your choice).
- Markdown answers, copy button, example prompts, keyboard-first composer.

Not in v1, on purpose: auth, accounts, database, RAG, tools, uploads, multi-user. The
conversation lives in React state and resets on reload.

## Requirements

- Node.js 20.6+ (uses the built-in `fetch`, `AbortSignal`, and web streams)
- One of:
  - **Ollama** running locally (no key, nothing to sign up for), or
  - an **NVIDIA API key** from <https://build.nvidia.com>

## Install and run

```bash
cd nimbus-chat
npm install
cp .env.example .env      # then edit .env
npm run dev               # API on :3001, UI on :5173
```

Open <http://localhost:5173>.

Production build (one process serves both the API and the built UI):

```bash
npm run build
npm start                 # http://127.0.0.1:3001
```

Tests and build check:

```bash
npm test                  # 45 unit + API tests, no network access needed
npm run build
```

## Environment variables

Everything is read from `.env` by the server. `.env` is gitignored; `.env.example` is the
documented template. No secret is ever shipped to the browser.

| Variable | Default | Meaning |
| --- | --- | --- |
| `LLM_PROVIDER` | auto | `nvidia` or `ollama`. Empty ⇒ NVIDIA if `NVIDIA_API_KEY` is set, otherwise Ollama. |
| `NVIDIA_API_KEY` | — | Provider key. Server-side only. Never expose with a `VITE_` prefix. |
| `NVIDIA_MODEL` | `meta/llama-3.1-8b-instruct` | Any chat model available to your key. |
| `NVIDIA_BASE_URL` | `https://integrate.api.nvidia.com/v1` | OpenAI-compatible endpoint. |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434/v1` | Local runtime's OpenAI-compatible endpoint. |
| `OLLAMA_MODEL` | `llama3.2:latest` | Any model you have pulled (`ollama list`). |
| `PORT` | `3001` | API port. |
| `SYSTEM_PROMPT` | helpful assistant text | Prepended to every conversation. |
| `MAX_MESSAGE_CHARS` | `8000` | Per-message cap. |
| `MAX_CONTEXT_CHARS` | `24000` | Total conversation cap. |
| `MAX_MESSAGES` | `40` | Conversation length cap. |
| `UPSTREAM_TIMEOUT_MS` | `120000` | Deadline for the provider call. |

### Getting an NVIDIA key

1. Sign in at <https://build.nvidia.com> (free tier).
2. Open any chat model and click **Get API Key**.
3. Put it in `.env` as `NVIDIA_API_KEY`, set `LLM_PROVIDER=nvidia`, restart.

### Using the local models instead

```bash
ollama list                       # models already installed
ollama pull llama3.2              # if you need one
LLM_PROVIDER=ollama OLLAMA_MODEL=llama3.2:latest   # in .env
```

Local generation is slower than the hosted models but needs no account and no key.

## API

### `POST /api/chat`

```json
{ "messages": [{ "role": "user", "content": "Explain React" }] }
```

Responds `200` with `text/event-stream`:

```
event: delta   data: {"delta":"React is "}
event: delta   data: {"delta":"a UI library."}
event: done    data: {"provider":"nvidia","model":"meta/llama-3.1-8b-instruct","latencyMs":1840}
```

or, when something fails:

```
event: error   data: {"code":"rate_limited","message":"The AI service is temporarily rate-limited. Please try again shortly."}
```

`400`/`413`/`429` come back as JSON `{ "error": { "code", "message" } }` before the stream
opens. Codes: `bad_request`, `missing_api_key`, `invalid_api_key`, `rate_limited`,
`model_not_found`, `provider_unavailable`, `network_error`, `stream_interrupted`, `unknown`.

### Other routes

| Route | Purpose |
| --- | --- |
| `GET /api/meta` | Provider, model, and limits the UI displays. No keys, no endpoints. |
| `GET /api/health` | Liveness plus the active provider/model. |
| `/` | Chat UI. `Express` serves `dist/` in production. |
| `/about` | In-app explanation of the architecture. |

## Conversation flow

1. `ChatInput` submits; `useChat` appends the user turn and an empty assistant turn.
2. `chatApi.streamChat` POSTs the full history (user + assistant roles only) to `/api/chat`.
3. The route validates the payload, prepends the system prompt, and calls the provider.
4. The provider streams deltas; the route forwards each one as an SSE `delta` event.
5. Each delta is appended to that assistant turn, so React re-renders progressively.
6. `done` closes the stream and re-enables the composer; `error` shows a banner instead.

If the tab closes or you press **Stop**, the server aborts the upstream request rather than
letting it run to completion.

## Switching providers later

The provider layer is one interface (`server/providers/index.js`):

```js
streamChat(messages, { signal }) -> AsyncGenerator<string>
```

Both `nvidia.js` and `ollama.js` delegate to a shared OpenAI-compatible streaming client,
because both vendors speak the same wire format. To add a provider (Gemini, OpenAI, a
gateway): write one file that implements that interface, register it in `FACTORIES`, and
set `LLM_PROVIDER`. Nothing in the UI or the route changes.

## Security notes

- `NVIDIA_API_KEY` is read from `.env` on the server and sent only to the provider. It is
  not in the bundle, not in `/api/meta`, and not in any error message. Do not prefix it
  with `VITE_`; Vite inlines `VITE_*` values into client JavaScript.
- The browser only ever calls same-origin `/api/*`.
- Requests are validated (shape, roles, trailing user turn, per-message and total length,
  message count) before any provider call. Request bodies are capped at 256 KB.
- Model output is rendered as Markdown with no raw-HTML plugin, so HTML in a response is
  shown as text and never executed. User text is rendered as plain text.
- Provider failures log details server-side; the client receives a mapped code and a fixed,
  user-safe sentence.

## Free-tier behaviour

- No polling, no background generation, no automatic retries.
- Duplicate submits are blocked three ways: the generating flag, an in-flight ref, and a
  15-second cooldown after a `429`.
- The server allows at most two concurrent generations per client and rejects the rest
  instead of queueing them.

## Project layout

```
nimbus-chat/
├── index.html                 # Vite entry
├── vite.config.js             # React plugin, /api dev proxy
├── public/favicon.svg
├── server/
│   ├── index.js               # config -> app, listen, graceful shutdown
│   ├── app.js                 # express app (testable without listening)
│   ├── config.js              # env parsing, provider auto-detection
│   ├── routes/chat.js         # POST /api/chat: validate, guard, stream, abort
│   ├── lib/
│   │   ├── validation.js      # request rules
│   │   ├── errors.js          # codes + user-safe messages
│   │   └── sse.js             # event stream helpers, heartbeat
│   └── providers/
│       ├── index.js           # registry + the provider interface
│       ├── openaiCompat.js    # shared streaming client + SSE parser
│       ├── nvidia.js
│       └── ollama.js
├── src/
│   ├── main.jsx, App.jsx, index.css
│   ├── components/            # Header, ChatWindow, MessageList, Message,
│   │                          # ChatInput, EmptyState, ErrorBanner, CopyButton, About
│   ├── hooks/                 # useChat (state + streaming), useTheme
│   ├── services/chatApi.js    # the only fetch() in the client
│   └── constants/prompts.js
└── test/                      # node:test — validation, SSE, providers, route, config
```

## Dependencies

Runtime: `express` (API + static hosting), `dotenv` (env loading), `react`/`react-dom`,
`react-markdown` + `remark-gfm` (safe Markdown rendering). Dev: `vite`,
`@vitejs/plugin-react`, `concurrently`. Tests use the Node test runner, so they add nothing.

## Known limitations

- No persistence: a reload starts a new conversation.
- No token counting; context length is guarded by character limits.
- One generation at a time per tab by design.
- Streaming Markdown can briefly look odd while a code fence is still open.
- The abort-on-disconnect relies on `res.on('close')`, which works on Node 20 and newer.
