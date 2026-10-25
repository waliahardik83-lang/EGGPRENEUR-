# Eggpreneur — Ambala Restaurant Business Command Center

A private, cloud-hosted website (not an app-store app) for a family planning and running an
egg-special restaurant in Ambala, Haryana. Two people (e.g. you and your father) can share one
business workspace with the same data. This README reflects the **Phase 1 website conversion**:
shared workspace access, persistent multi-conversation AI chat, a decisions log, and real
deployment instructions — built on top of the existing MVP (locations, menu costing, break-even,
budget, actions, evidence uploads), which is unchanged and still works.

## Honest status — read this before telling your father the site is ready

I have **no internet access in the environment I built this in**. That means, concretely:

- I have not run `npm install`, and have not built or served this app.
- I have not created a Supabase project, applied the SQL migrations, or deployed anything.
- I have not deployed the AI edge function or spent a single rupee/cent calling the Anthropic API.
- Nothing here has a live HTTPS URL yet. **Do not send your father a link until you've done the
  deployment steps below and opened the link yourself first.**

What I *have* done: written complete, internally-consistent source code and SQL against a real
schema, checked every file for syntax balance and that every import matches an export, and written
down exactly how to deploy and verify it. Follow `TESTING.md` and don't skip the two-account
isolation test — that one actually matters for privacy, not just correctness.

---

## 1. What's new in this Phase 1 conversion vs. the original MVP

| Area | Before | Now |
|---|---|---|
| Access | One owner per business, no sharing | `business_members` table: owner + invited members share one workspace (`supabase/migrations/0002_workspace_and_conversations.sql`) |
| Inviting a second person | Not possible | Owner creates an invitation by email (Settings page); it's consumed automatically the moment that email signs up — see "Inviting your father" below |
| AI assistant | Single question → single answer, not saved as a thread | Persistent `conversations` + `conversation_messages` tables; sidebar of named, resumable, renameable, archivable conversations (`src/pages/Conversations.tsx`) |
| Message durability | N/A | User message is saved to the database *before* the AI is called; assistant reply is only ever saved *after* a successful model response — a failed call never fakes a saved answer |
| Decisions | Not tracked | `decisions` table + page: what was decided, what was rejected, and why (`src/pages/Decisions.tsx`) |
| Deployment | PWA/installable-app framing | Reframed as an ordinary HTTPS website; PWA installability still works as a bonus but is no longer the point |

Everything from the original MVP (auth, RLS, Dashboard, Capital Budget, Locations + footfall
survey + weighted scoring, Menu & Recipe Costing, Break-even Calculator, Action Register, evidence
file uploads) is preserved and now operates on the shared workspace automatically, because every
one of those tables' Row Level Security policies calls a single `owns_business()` function —
redefining that one function in migration 0002 to check membership instead of solo ownership is
what extends sharing to all of them without touching each policy individually.

## 2. Architecture (unchanged, confirmed still the right fit)

React + TypeScript + Vite frontend, Supabase for Postgres + Auth + Storage + Edge Functions. This
is already an ordinary web app — the earlier delivery's PWA manifest doesn't make it an "app you
install," it just means a browser *may* offer "Add to Home Screen" as a convenience. Deploying it
to Vercel/Netlify/Cloudflare Pages gives you a normal HTTPS website your father opens in Chrome,
nothing more. I kept this stack because it already satisfies every requirement in your new brief
(private auth, RLS, real database, file storage, edge functions for server-side AI calls) — there
was no technical reason to change it.

## 3. Setup (same as before — repeated here for a single source of truth)

### Prerequisites
- Node.js 18+, npm
- A free Supabase account (supabase.com)
- Supabase CLI: `npm install -g supabase`
- (Optional, for AI chat) An Anthropic API key — see section 6 for real cost info

### Steps
```bash
cd eggpreneur
cp .env.example .env.local
# edit .env.local with your Supabase Project URL + anon key (Settings → API)
npm install
npm run dev
```

Apply the database schema **in order**:
```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```
This runs both `0001_mvp_schema.sql` and `0002_workspace_and_conversations.sql`. If you apply them
manually via the SQL Editor instead, run `0001` completely first, then `0002` — the second migration
alters a function and policies that `0001` creates.

**Verify**: Table Editor should now also show `business_members`, `pending_invitations`,
`conversations`, `conversation_messages`, and `decisions`, in addition to the original MVP tables.

## 4. Deploying the website (so it's reachable when your laptop is off)

The frontend and the database are deployed separately. Supabase already runs in the cloud the
moment you create a project — step 3 above means your data is already persistent and available
24/7 regardless of your laptop. What's left is hosting the *frontend* somewhere that's always on.

### Recommended: Vercel (free tier, no server to manage)
1. Push this code to a GitHub repository (private repository recommended, since this is a family
   business tool — go to Settings → repository visibility on GitHub if you create it as public by
   mistake).
2. Go to vercel.com → New Project → import that repository.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Add environment variables in Vercel's project settings (**not** committed to the repo):
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, same values as your `.env.local`.
5. Deploy. Vercel gives you an HTTPS URL like `eggpreneur-yourname.vercel.app` — that is the link
   you send your father. It stays up independent of your own computer.

### Alternatives (equally valid, same idea)
- **Netlify**: same process — connect the repo, set the build command/output dir, add the two
  `VITE_` env vars in Site settings → Environment variables.
- **Cloudflare Pages**: same process, env vars under Settings → Environment variables.

All three have free tiers sufficient for a two-person family tool. None of them have been tested
by me in this delivery — the steps above are standard for any Vite app on these platforms, but
confirm the build actually succeeds on their dashboard logs before sharing the link.

### After deploying, verify before sharing the link
- Open the deployed URL yourself in a private/incognito window, sign up a *test* account, confirm
  the dashboard loads and you can add a location.
- Only then send the real link to your father.

## 5. Inviting your father (shared workspace)

1. You sign up first — you become the workspace `owner` automatically.
2. Go to **Settings** in the app, enter your father's email under "Invite to this workspace."
3. Send him the deployed website link yourself (WhatsApp, SMS — the app does not send email).
4. He opens the link and signs up using **that exact email address**.
5. The moment his account is confirmed, the database automatically adds him to your same
   workspace (see `handle_new_user()` in migration 0002) — he'll see the same locations, menu,
   budget, actions, decisions and conversations you do, not an empty workspace of his own.

If he accidentally signs up with a different email than you invited, delete that invitation in
Settings and send a new one for the correct address — matching is exact (case-insensitive), not
fuzzy, by design, so no one is accidentally added to the wrong family's data.

## 6. AI provider integration — the part to not get wrong financially

**Your Claude.ai subscription (Free, Pro, or any consumer plan) does not give this website any AI
access.** Claude.ai and the Claude API are billed completely separately. To make the "AI Consultant"
chat tab work, you need a **separate Anthropic API account with its own billing**:

1. Go to console.anthropic.com, create an account (or sign in), and add a payment method under
   Settings → Billing. New accounts typically get a small amount of free trial credit, but check
   the console directly — do not assume a number here, it changes.
2. Create an API key under Settings → API Keys.
3. Deploy the edge function and give it that key as a *server-side secret* (never in `.env.local`
   or any `VITE_`-prefixed variable, which is public):
   ```bash
   supabase functions deploy ai-consultant
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided automatically to every deployed edge
   function by Supabase — you only need to set the Anthropic key yourself. The function
   deliberately uses the anon key plus your own login session (not the more powerful service-role
   key) so that Row Level Security still applies to everything it reads on your behalf — see the
   comment at the top of `supabase/functions/ai-consultant/index.ts`.

**What it actually costs**: as of this writing, Claude Sonnet is priced per million tokens
processed — roughly $2 per million input tokens and $10 per million output tokens (check
console.anthropic.com/settings/billing or platform.claude.com/docs for the current number, since
pricing changes over time and this app does not look it up for you). Each question this app sends
includes your saved business records as context (locations, menu, budget, etc.), which for a
small, growing dataset is typically a few thousand tokens — so a realistic single question-and-
answer exchange costs a small fraction of a cent to a few cents, not rupees-per-message territory,
*until your saved data grows large*. There is no way to give you an exact monthly bill without
knowing your actual usage; watch console.anthropic.com's usage dashboard after your first week of
real use rather than trusting any estimate here.

**If you don't want to set up billing at all**: the website still fully works without it. Every
calculator, every record table, the Action Register, the Decisions log, and the ability to read
back old conversations all work with zero API key configured. Only *sending a new message* in the
AI Consultant tab requires it — and if the key isn't configured, the app tells you that plainly
instead of pretending to answer (see the `ANTHROPIC_API_KEY not configured` error path in
`supabase/functions/ai-consultant/index.ts`).

## 7. Security model

- Supabase Auth (email/password) for sign-in.
- Row Level Security on every table, keyed off `business_members` (not just `owner_id`), so access
  is "you're a member of this business workspace," checked on every query by Postgres itself —
  not by the frontend hiding buttons.
- The AI edge function uses the caller's own session token so RLS still applies even from
  server-side code — it cannot read a business you don't belong to on your behalf.
- No service-role key or Anthropic key ever ships to the browser; both live only as Supabase
  server-side secrets.
- No public dashboards, no public chat history, no public business records — every table's RLS
  denies access to anyone not in `business_members` for that business, full stop.
- Logout clears the Supabase session; a cleared/expired session redirects every page back to
  `/login` (`RequireAuth` in `src/App.tsx`).

**Verify this yourself** with the two-account test in `TESTING.md` — don't take this list on
faith.

## 8. Project structure
```
src/
  lib/            Supabase client, auth context, calculation engines, offline queue, evidence upload
  hooks/          useBusiness (shared workspace lookup), useConversations/useMessages
  components/     Layout/nav, EvidenceBadge
  pages/          One file per screen, including Conversations.tsx (AI chat) and Settings.tsx (invites)
  types/          Hand-written types matching the SQL schema
supabase/
  migrations/     0001_mvp_schema.sql, then 0002_workspace_and_conversations.sql
  functions/      ai-consultant edge function (conversation-aware)
```

## 9. Implementation phases (per the brief) and what's actually done

- **Phase 1 — reliable cloud website, auth, persistence, shared workspace, persistent
  conversations, progress tracking: DONE in this delivery**, pending your own deployment and the
  verification checklist in `TESTING.md`.
- **Phase 2 — location research, ground checklists, menu costing, financial calculations: DONE**
  (carried over from the original MVP, now shared-workspace-aware automatically).
- **Phase 3 — AI consultant, contextual retrieval, saved decisions, action plans: DONE** for the
  core loop (retrieval + citation + decisions log + conversation memory). Not yet done: the
  assistant proposing a record change for you to approve (brief says "ask for confirmation before
  making consequential changes" — in this version the assistant can only *talk*, it cannot write
  to any table itself, which is a stricter-than-required but simpler and safer starting point).
- **Phase 4 — competitor research, suppliers, compliance, daily operations, marketing analytics:
  NOT built yet.** This is the next incremental slice, matching the brief's instruction not to ship
  superficial placeholder screens for modules that aren't functional.

## 10. Known limitations, stated plainly

- **Multi-business support**: each shared workspace still assumes one business. A family running
  two restaurants would need a workspace switcher — not built.
- **Invitation delivery**: no email is sent by the app; you share the link and the invited email
  address manually, as described above. This is a deliberate scope cut, not an oversight — wiring
  up transactional email (e.g. via Supabase's SMTP settings or a provider like Resend) is a
  reasonable next step if you want it.
- **Offline writes**: still the simple `localStorage` queue from the original MVP
  (`src/lib/offlineQueue.ts`) — last-write-wins, no conflict resolution, file uploads not queued.
  Fine for two people who aren't editing the same record at the same second; not a general sync
  engine.
- **In-app CSV/JSON export**: not built. Use Supabase's Table Editor → Export, or `pg_dump`, in the
  meantime.
- **Compliance figures** (GST rate, FSSAI requirements) are placeholder defaults in the schema
  (e.g. menu tax defaults to 5%) and are **not verified** — confirm with a tax professional or the
  official GST/FSSAI portals; the dedicated Compliance module that would track this properly with
  official sources and dates is Phase 4, not built yet.
- **Message-sequencing under truly simultaneous edits**: the per-conversation message ordering
  uses a max()+1 trigger, documented in migration 0002 as not perfectly race-proof under two
  devices posting in the same conversation within milliseconds of each other. Acceptable for a
  two-person family tool; noted rather than hidden.

## Core principle this app is built around

Every number you see was either typed in by your family or computed by a visible formula from
numbers your family typed in. The AI assistant is explicitly instructed never to invent Ambala-
specific demand, competitor, or price data, and never to claim it visited anywhere — see the system
prompt in `supabase/functions/ai-consultant/index.ts`.
