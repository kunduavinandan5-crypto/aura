# Aura – Concurrent User Load Test Report

Date: 2026-10-11 · Target: local production build (`dist/`), mock RAG backend · Run on the dev laptop (16 logical CPUs)

## What was tested (and what was not)

| Component | Tested? | How |
|---|---|---|
| Frontend static delivery (HTML/JS/CSS) | Yes, locally | Single-process Node static server, gzip, all assets fetched per new user |
| Chat request flow | Yes, with a **mock** backend | Fixed 1.5 s response time, 3 s average think time per user |
| Real RAG backend / AI provider | **No** | Not tested (cost, rate limits). Its capacity is unknown |
| Supabase (auth, sync) | **No** | Third-party service; capacity depends on your Supabase plan |
| Vercel production site | **No** | Not load-tested |

Each virtual user loads the app once, then sends a question every ~3 s. The load generator, the static server and the mock backend all ran on one machine and in single-threaded Node processes, so the numbers below are a **conservative floor for this rig**, not the real production ceiling. Use them for relative comparison (text vs photos), not as absolute capacity.

## Results – text questions only

| Concurrent users | Errors | Chat p50 | Chat p95 | App load p95 |
|---|---|---|---|---|
| 50 | 0 % | 1.5 s | 1.6 s | 0.2 s |
| 200 | 0 % | 1.5 s | 3.0 s | 3.2 s |
| 500 | 0 % | 1.5 s | 3.4 s | 5.5 s |
| 1,000 | 0 % | 2.0 s | 8.6 s | 14.9 s |
| 2,000 | 95 % | 5.8 s | 12.8 s | 82 s (timeouts) |

## Results – questions with 5 photos (~1.7 MB request each)

| Concurrent users | Errors | Chat p50 | Chat p95 |
|---|---|---|---|
| 50 | 0 % | 1.5 s | 1.7 s |
| 200 | 0 % | 1.5 s | 3.2 s |
| 500 | 5.5 % | 3.4 s | 5.5 s |
| 1,000 | 43 % | 15.7 s | 16.7 s |

## Findings

1. **Comfortable range on this rig: up to ~500 simultaneous users** with text questions (no errors, responses stay ~1.5 s). Degradation starts at ~1,000 and the rig fails by 2,000.
2. **Photos cut capacity by roughly half.** With 5 photos per question, errors begin at ~500 users and reach 43 % at 1,000. Each question with 5 photos sends ~1.7 MB of JSON (base64), against under 1 KB for text.
3. **Photos are not compressed or resized before upload.** The test used 250 KB photos (similar to camera captures). Photos uploaded from a phone gallery are commonly 3–5 MB each, so a 5-photo question could exceed 20 MB. This can also hit request-size limits on the backend or hosting (often 4.5–10 MB). Resizing photos in the browser (e.g. max 1280 px, JPEG ~0.8) before sending is the highest-value fix.
4. **The first page load is light:** about 0.9 MB uncompressed (~250 KB gzipped) across 9 files, so the real Vercel CDN should handle page loads far beyond this rig's limit.
5. **Real capacity will be set by the RAG backend and its AI provider**, which this test did not measure. Their rate limits and concurrency cap are the most likely bottleneck. Run the same load script against a staging backend to get that number.

## Recommendations

- Compress/resize photos client-side before upload (largest improvement, also saves users' mobile data).
- Confirm the backend request-body size limit supports 5 photos, or reduce the per-photo size.
- Load-test a staging copy of the RAG backend, and check the AI-provider and Supabase plan limits for concurrent requests.
- Add server-side rate limiting per user on the chat endpoint.

## Reproduce

Scripts used: `server.mjs` (static server + mock backend) and `load.mjs` (virtual users), kept in the session scratchpad. Run `npm run build`, start `server.mjs dist 1500`, then `node load.mjs 50,200,500,1000 12 <photos> 250`.
