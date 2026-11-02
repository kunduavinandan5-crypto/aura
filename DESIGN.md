# DESIGN.md — Aura UI / Design System

> Design tokens, component conventions, and layout patterns. Read before touching any UI.

---

## Visual Identity

| Property | Value |
|---|---|
| **Brand name** | Aura |
| **Mood** | Dark, calm, premium, academic |
| **Primary bg** | `#07080e` (near-black) |
| **Font** | System UI stack via TailwindCSS (`font-sans`) |
| **Theme** | Dark only (no light mode toggle) |
| **Toasts** | `sonner` — dark theme, top-center, 1 visible at a time, 3.5s |

---

## Layout — Responsive Split

### Desktop (`!isMobileOrTablet`)
- **Sidebar** (left, fixed width): thread list, new chat button, subject selector, user info
- **Chat panel** (right, fills remaining space): message list + input bar at bottom
- Component: `src/components/desktop/DesktopApp.tsx`

### Mobile / Tablet (`isMobileOrTablet`)
- Full-screen single-panel layout
- Component: `src/phone/PhoneApp.tsx`
- **PWA installable** — `src/phone/pwa.ts` registers service worker

Detection hook: `useDevice()` → `src/hooks/useDevice.ts`

---

## Component Map

```
src/components/
├── SubjectSelect.tsx         # Dropdown to choose subject (accountancy, economics…)
├── ErrorBoundary.tsx         # Full-page error fallback
├── chat/
│   ├── MessageList           # Scrollable conversation history
│   ├── InputBar              # Text input + send + mic + camera buttons
│   └── AnswerExtras.tsx      # Sources, suggested follow-ups, feedback buttons
├── desktop/
│   ├── DesktopApp.tsx        # Root desktop shell
│   ├── Sidebar.tsx           # Thread list + controls
│   └── ChatPanel.tsx         # Right panel with messages + input
├── settings/
│   └── SettingsModal.tsx     # RAG endpoint config, profile display
├── feedback/                 # Thumbs up / thumbs down on AI answers
├── camera/                   # Capture photo for question with image
├── rag/                      # Document upload / manage UI (optional RAG path)
└── ui/                       # Primitives: Button, Input, Modal, etc.
```

---

## Chat Message Structure

Each message bubble renders from a `Message` object:

```ts
{
  id: string
  role: 'user' | 'assistant'
  content: string           // markdown rendered via react-markdown + remark-gfm
  imageUrls?: string[]      // photos attached by the student
  sources?: RagSourceChunk[]
  suggestedFollowups?: string[]
  answerId?: string         // for feedback API
  mode?: AnswerMode         // 'llm' | 'fallback' | 'no_results' | ...
  createdAt: string
}
```

- **User messages**: right-aligned, plain text or thumbnail
- **Assistant messages**: left-aligned, Markdown rendered
- **Follow-up chips**: shown below assistant message when `suggestedFollowups` is set
- **Feedback**: thumbs up/down shown below assistant messages (via `AnswerExtras.tsx`)

---

## Subject Selector

- Renders only the subjects assigned to the signed-in student (`assignedSubjects()`)
- If the student has only 1 subject, it is auto-selected and the selector may be hidden
- Subject id is persisted in `localStorage` (`aura_subject_v2`)
- Component: `SubjectSelect.tsx`

---

## Animation & Motion

- **Library**: GSAP 3 (`gsap` + `@gsap/react`)
- Used for: message entrance animations, loading states, transitions
- Keep animations subtle — this is a study tool, not a game

---

## Icons

- **Library**: `lucide-react`
- Use only Lucide icons — do not add a second icon library

---

## CSS Conventions

- **Framework**: TailwindCSS v4 (via `@tailwindcss/vite` plugin)
- No custom CSS classes unless in `styles.css` — use Tailwind utilities inline
- `clsx` + `tailwind-merge` used for conditional class composition
- `class-variance-authority` (CVA) for component variants (e.g. button sizes)

---

## Accessibility

- `role` and `aria-live` on loading states (see `Splash` in `App.tsx`)
- Interactive elements must have unique, descriptive `id` attributes
- Toasts use `richColors` for contrast

---

## PWA

- Manifest + icons in `public/`
- Service worker registered via `src/phone/pwa.ts`
- Cache-control headers set in `vercel.json` (`sw.js` and `index.html` → `no-cache`)

---

## Colours (quick reference)

| Token | Hex | Usage |
|---|---|---|
| App background | `#07080e` | Root shell, sidebar, panels |
| Zinc-500 | Tailwind `zinc-500` | Muted text, placeholder |
| Zinc-800/900 | Tailwind | Card / message bubble backgrounds |
| White | `#ffffff` | Primary text on dark bg |

> All colours are set via Tailwind utilities. Avoid hard-coding hex values in new components — prefer `bg-zinc-900`, `text-zinc-400`, etc.
