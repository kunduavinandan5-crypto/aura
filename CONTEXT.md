# CONTEXT.md — Aura Edu RAG

> **Read this first.** This file gives any AI assistant (or new developer) enough context to work on this codebase without asking basic questions.

---

## What is this project?

**Aura** is a subject-specific AI tutoring chat app for Indian high school students (Class 11 & 12). Students log in, pick a subject (e.g. Accountancy, Economics), and ask questions. The app sends their question — along with their class, subject, and conversation history — to a deployed RAG (Retrieval-Augmented Generation) backend that answers from curated study material.

- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS v4
- **Backend**: External RAG API at `https://rag11acc.onrender.com` (not in this repo)
- **Database**: Supabase (Postgres + Auth)
- **Deployment**: Vercel (frontend) + Render (backend)
- **PWA**: Yes — installable on mobile

---

## Folder Structure

```
aura-chat-main/
├── src/
│   ├── App.tsx                  # Root: auth hydration, routing desktop vs phone
│   ├── main.tsx                 # Vite entry point
│   ├── styles.css               # Global CSS
│   ├── components/
│   │   ├── chat/                # Message list, input bar, answer extras
│   │   ├── desktop/             # DesktopApp layout (sidebar + chat panel)
│   │   ├── settings/            # SettingsModal (RAG endpoint, profile)
│   │   ├── feedback/            # Thumbs up/down rating
│   │   ├── camera/              # Camera capture for photo questions
│   │   ├── rag/                 # RAG document UI (upload, manage)
│   │   └── ui/                  # Shared UI primitives (button, input…)
│   ├── hooks/
│   │   ├── useChat.ts           # ★ Core chat state: threads, sendMessage, history
│   │   ├── useDevice.ts         # Mobile vs desktop detection
│   │   └── useSpeechInput.ts    # Microphone / speech-to-text
│   ├── lib/
│   │   ├── ai-engine.ts         # ★ generateAiResponse — builds request, calls API, caches
│   │   ├── askBody.ts           # ★ AskBody type + buildAskBody (question, class, subject, history)
│   │   ├── storage.ts           # localStorage + Supabase sync for threads / user
│   │   ├── imageStore.ts        # IndexedDB store for photo attachments (device-local only)
│   │   ├── supabase.ts          # Supabase client, auth helpers, DB queries
│   │   ├── subjects.ts          # Subject list, assignedSubjects(), slug helpers
│   │   ├── rag-engine.ts        # callPrebuiltRagModel (alternative local RAG path)
│   │   ├── attachments.ts       # Image resize / base64 helpers for photo uploads
│   │   ├── feedbackContext.ts   # Context for passing feedback state
│   │   ├── id.ts                # Nano-id generator (newId)
│   │   └── utils.ts             # Generic helpers
│   ├── phone/
│   │   ├── PhoneApp.tsx         # Mobile layout wrapper
│   │   ├── PhoneLogin.tsx       # Login screen (email + password)
│   │   └── pwa.ts               # Service worker registration
│   ├── subjects/
│   │   └── index.ts             # ALL_SUBJECTS array (id + label + description)
│   └── types/
│       └── index.ts             # Shared TypeScript types (Message, Thread, UserProfile…)
├── supabase_schema.sql          # Main DB schema (profiles, threads)
├── supabase_students.sql        # class_11_students / class_12_students tables
├── supabase_searches.sql        # user_searches table
├── supabase_feedback.sql        # answer_feedback table
├── vercel.json                  # Vercel config: /api/rag/* proxied to Render backend
├── vite.config.ts               # Vite + TailwindCSS v4 + path alias (@/)
└── .env.example                 # Required env vars (copy to .env)
```

---

## Authentication Flow

1. User opens app → `App.tsx` calls `supabase.auth.getSession()`
2. **Two login paths** in `signInWithPassword()` (`lib/supabase.ts`):
   - **Class tables first**: checks `class_11_students` or `class_12_students` for email+password match → creates a synthetic `UserProfile`
   - **Supabase Auth fallback**: standard email/password auth
3. `UserProfile` is saved to `localStorage` via `storage.saveUser()`
4. On every launch, student record is re-verified against class tables every hour (`STUDENT_RECHECK_MS = 1h`)

---

## Core Data Flow — Sending a Message

```
useChat.sendMessage(text)
  │
  ├─ Creates userMessage (Message), appends to thread
  ├─ Collects conversationHistory (last 10 messages from thread)
  │
  └─► generateAiResponse({ prompt, subject, studentClass, history, images })   [ai-engine.ts]
        │
        ├─ Gibberish check (looksLikeGibberish)
        ├─ Cache check (localStorage, 7-day TTL; skipped when history present)
        ├─ buildAskBody(prompt, studentClass, subjectId, image, history)        [askBody.ts]
        │     → { question, subject, student_class, image_base64?, history? }
        │
        └─► POST /api/rag/ask  (Vercel proxy → https://rag11acc.onrender.com/ask)
              │
              └─ Response: { answer, answer_id, mode, sources? }
                    → cleanAnswerContent() strips doc filenames / page numbers
                    → writeCachedAnswer() (only for standalone llm-mode answers)
                    → returns AiResult { content, sources, followups, answerId, mode }
```

---

## Key Types (`src/types/index.ts`)

| Type | Description |
|---|---|
| `Message` | `{ id, role: 'user'|'assistant', content, imageUrls?, sources?, createdAt, … }` |
| `Thread` | `{ id, title, createdAt, updatedAt, isPinned?, messages: Message[] }` |
| `UserProfile` | `{ id, email, name, studentClass, subject, isGuest? }` |
| `RagSourceChunk` | `{ documentId, documentTitle, snippet, similarityScore }` |
| `AskBody` | Request body to `/ask` endpoint (see askBody.ts) |
| `HistoryTurn` | `{ role: 'user'|'assistant', content }` — conversation context |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase anon key |
| `NEXT_PUBLIC_API_URL` | Yes (prod) | RAG backend base URL |
| `VITE_ENABLE_DEMO` | No | Show demo button on login (`"true"`) |
| `VITE_SITE_URL` | No | Canonical site URL for SEO |

---

## API — `/ask` Endpoint Contract

**POST** `https://rag11acc.onrender.com/ask`

```json
{
  "question": "What is a partnership deed?",
  "subject": "accountancy",
  "student_class": "12",
  "history": [
    { "role": "user", "content": "What is partnership?" },
    { "role": "assistant", "content": "Partnership is…" }
  ],
  "image_base64": "<optional raw base64>",
  "image_media_type": "image/jpeg"
}
```

**Response:**
```json
{
  "answer": "A partnership deed is…",
  "answer_id": "uuid",
  "mode": "llm",
  "sources": []
}
```

`mode` values: `llm` | `fallback` | `flagged` | `no_results` | `no_question` | `error`

---

## Supabase Tables

| Table | Purpose |
|---|---|
| `profiles` | One row per auth user (name, email, student_class, subject) |
| `class_11_students` | Admin-managed student roster for Class 11 |
| `class_12_students` | Admin-managed student roster for Class 12 |
| `threads` | Synced chat threads (JSON) per user |
| `user_searches` | Search query log (analytics) |
| `answer_feedback` | Thumbs up/down per `answer_id` |

---

## Caching Strategy

- **Answer cache**: `localStorage` key `aura_answer_cache_v2`, keyed by `subjectId|class|normalizedPrompt`
- **TTL**: 7 days (study material rarely changes)
- **Max entries**: 150 (LRU eviction)
- **Skipped when**: image attached OR conversation history present (follow-ups are contextual)
- **Eviction on thumbs-down**: A downvoted answer is removed so the next ask fetches fresh

---

## Conversation History (Context Window)

Added in commit `55c2e86`. Every new message in a thread sends the **last 10 messages** (5 Q&A rounds) as `history` to the backend. This lets the model answer follow-up questions like "explain the second point" correctly.

- **Location**: `useChat.ts` (collects history) → `ai-engine.ts` (passes to buildAskBody) → `askBody.ts` (serializes into request)
- **History is excluded from cache lookups** — follow-ups must always hit the backend fresh

---

## Running Locally

```bash
# 1. Install deps
npm install

# 2. Copy and fill env vars
cp .env.example .env

# 3. Start dev server
npm run dev
```

TypeCheck: `npm run typecheck`
Build: `npm run build`
