# CHANGES.md — Aura Change Log

> Reverse-chronological list of all meaningful changes. Update this whenever you make a code change.

---

## [2026-11-02] — Conversation History / Context Window

**Commit**: `55c2e86`
**Branch**: `main`

### Problem
When a student asked a follow-up question in the same chat (e.g. "explain the second point"), the AI had no memory of the prior exchange and could not answer correctly. Each question was sent to the backend in isolation.

### Solution
Implemented a **per-thread context window** — the last 10 messages (5 Q&A rounds) from the active thread are collected and sent to the backend as a `history` array alongside every new question.

### Files Changed

| File | Change |
|---|---|
| `src/lib/askBody.ts` | Added `HistoryTurn` interface (`{ role, content }`). Added `history?: HistoryTurn[]` field to `AskBody`. `buildAskBody()` now accepts and serializes history. |
| `src/lib/ai-engine.ts` | `generateAiResponse()` now accepts `history?: HistoryTurn[]`. History is passed to `buildAskBody()`. Cache lookups are **skipped when history is present** (follow-ups are context-dependent and must never be served from cache). |
| `src/hooks/useChat.ts` | Before calling `generateAiResponse`, collects existing thread messages, filters to text-only turns, slices last 10, maps to `HistoryTurn[]`, and passes as `history`. |

### API Impact
The `/ask` request body now optionally includes:
```json
"history": [
  { "role": "user", "content": "..." },
  { "role": "assistant", "content": "..." }
]
```
The backend at `rag11acc.onrender.com` must read `history` from the request and include it in its LLM prompt for follow-up answers to work end-to-end.

---

## [Prior] — Initial Build

- React 18 + Vite + TypeScript + TailwindCSS v4 frontend
- Supabase Auth + class_11/12 student table login
- RAG backend integration (`/api/rag/ask` Vercel proxy → Render)
- Desktop sidebar + mobile PWA layouts
- Photo/image question support (camera + file upload)
- Answer caching (7-day localStorage, max 150 entries)
- Thumbs up/down feedback sent to `/feedback` endpoint
- Speech-to-text input (`useSpeechInput`)
- Multi-device chat sync via Supabase
- Gibberish detection (rejects random keysmash inputs)
- Suggested follow-up chips below assistant messages
- Subject selector (per-student assignment from admin)
- Search analytics (every question logged to `user_searches`)
