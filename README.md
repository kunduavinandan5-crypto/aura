# Aura AI Study Assistant

React + Vite + Tailwind PWA: students ask questions by text, voice or photo and get step-by-step answers from an AI/RAG backend. Chats sync per user through Supabase.

## Setup

```bash
npm install
cp .env.example .env     # fill in the values (see below)
npm run dev              # http://localhost:5173
```

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase project + **anon** key. Public by design; data is protected by RLS. |
| `NEXT_PUBLIC_API_URL` | Base URL of your RAG backend, no trailing slash (e.g. `https://rag11acc.onrender.com`). Required for production builds. |
| `VITE_SITE_URL` | Public site URL. Drives canonical URL, Open Graph, `sitemap.xml`, `llms.txt`. |

Everything prefixed `VITE_` is shipped to the browser. Never put a Supabase `service_role` key or any Gemini/Anthropic/OpenAI key there; model keys belong on the AI backend, which the app calls with the user's Supabase access token in `Authorization: Bearer`.

Without Supabase variables the app runs in local-only mode (profile and chats stay in the browser).

## Supabase

1. Create a project and run [supabase_schema.sql](supabase_schema.sql) in the SQL editor (idempotent; replaces the old open policies with per-user RLS).
2. Authentication: enable Email (magic link; login is email-only). Add your production URL to Site URL / Redirect URLs.
3. Verify: `npm run check:supabase` checks reachability, key role, and that the anon role cannot read or write any table.

## AI backend contract

`POST {NEXT_PUBLIC_API_URL}/ask` with `{ question, student_class?, subject }` (`subject` is the id picked in the dropdown, see [src/lib/subjects.ts](src/lib/subjects.ts); `student_class` is the number from the profile class, e.g. `12`). The reply is `{ answer_id, answer, sources[{document,page}], flagged, mode, provider, top_score }`. Thumbs up/down call `POST {NEXT_PUBLIC_API_URL}/feedback` with `{ answer_id, rating: "up"|"down" }`. Photo attachments are not sent: the `/ask` endpoint is text only.

## Scripts

`npm run dev` · `npm run typecheck` · `npm run build` · `npm run preview` · `npm run check:supabase`

## Deploying

- Serve `dist/` over HTTPS. [public/_headers](public/_headers) holds the CSP and security headers (Cloudflare Pages / Netlify); replace the AI backend placeholder in `connect-src`, or mirror the headers on your host.
- Your AI backend must allow CORS from the site origin.
- SPA fallback: route unknown paths to `/index.html`.
- Set `VITE_SITE_URL` at build time for SEO files.
