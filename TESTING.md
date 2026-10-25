# Manual Testing Checklist

No automated tests have been run against this code in the delivery environment (no network
access, no live Supabase project). Work through this checklist yourself after following the
README setup steps, and don't treat any item as done until you've actually seen it pass.

This file now covers both the original MVP and the Phase 1 website conversion (shared workspace,
persistent conversations, decisions log). The shared-workspace and conversation sections below are
new — run them even if you already verified the original MVP checklist, since migration 0002
changes how `owns_business()` works underneath every table.

## 1. Build sanity
- [ ] `npm install` completes with no errors.
- [ ] `npm run build` completes with no TypeScript errors.
- [ ] `npm run preview` serves the built app and the dashboard loads.

## 2. Auth
- [ ] Sign up with a new email creates an account.
- [ ] A `profiles` row and a `businesses` row are created automatically (check Table Editor).
- [ ] Sign out, then sign in again with the same credentials works.
- [ ] Visiting any page while signed out redirects to `/login`.

## 3. Row Level Security isolation (two UNRELATED accounts, not shared on purpose)
- [ ] Create two accounts (A and B) with NO invitation between them. Add a location, a menu item,
      and a budget item as A.
- [ ] Sign in as B — confirm B sees NONE of A's records anywhere in the app, and gets their own
      separate empty workspace rather than an error.
- [ ] In the Supabase SQL editor, run `select * from locations;` using the **service role**
      (bypasses RLS) and confirm both A's and B's rows physically exist — i.e. RLS is hiding
      data at the query level, not because the data doesn't exist.

## 3b. Shared workspace (two accounts that SHOULD share data)
- [ ] As account A (the owner), go to Settings and invite account C's email (a third, not-yet-
      created account).
- [ ] Confirm the invitation shows under "Pending invitations."
- [ ] Sign up as account C using that exact email.
- [ ] Immediately after sign-up, confirm C sees account A's existing locations, menu items, and
      budget — NOT an empty workspace. This is the core test that the invitation trigger in
      migration 0002 (`handle_new_user`) actually worked.
- [ ] As C, add a new action. Sign back in as A and confirm A sees it too (same workspace).
- [ ] Confirm C does NOT see an "Invite" form in Settings (only the owner can invite) — C should
      see the read-only message instead.
- [ ] As A, revoke an unused pending invitation and confirm it disappears from the list and that
      email can no longer join by signing up (sign up a 4th test account with that revoked email
      and confirm it gets its own separate empty workspace, not A's).

## 3c. Unauthorized access denial
- [ ] While signed in as account B (unrelated to A/C), try navigating directly to a location URL
      copied from account A's browser (`/locations/<A's-location-id>`). Confirm it does NOT load
      A's data (should show a loading/empty/error state, never A's actual fields).

## 4. Capital budget & dashboard math
- [ ] Add 3 budget line items with different estimated costs and statuses (Planned/Committed/Paid).
- [ ] Confirm the Dashboard's "Committed so far" only counts non-Planned items.
- [ ] Set a total startup budget, confirm "Remaining capital" = budget − committed, and turns red
      if negative.

## 5. Locations & ground survey
- [ ] Add a location, edit every field, confirm it persists after a page reload.
- [ ] Add a footfall observation without an observer name — confirm it's rejected.
- [ ] Add 2+ scoring criteria and score them — confirm the weighted score matches a hand
      calculation: `sum(score_i * weight_i) / sum(weight_i)` for only the criteria that have a score.
- [ ] Upload an evidence file (photo or PDF) — confirm it appears in Supabase Storage under
      `evidence/<your-user-id>/<business-id>/locations/...` and the signed URL opens it.

## 6. Menu costing
- [ ] Add a dish, add 3+ ingredients with quantities and unit costs, set yield and wastage %.
- [ ] Hand-calculate expected ingredient cost per portion: `sum(qty*unit_cost)/yield * (1+wastage%)`
      and confirm it matches what the app shows.
- [ ] Set a dine-in price below total variable cost — confirm the "loses money" flag appears.

## 7. Break-even calculator
- [ ] Enter known inputs and hand-calculate break-even orders/day:
      `(fixed+owner+debt+contingency) / (avgBill * (1 - variableCost%))` divided by operating days.
      Confirm it matches the app.
- [ ] Set variable cost % to 100 or more — confirm the app flags it rather than showing nonsense.
- [ ] Check that the 5 sensitivity rows actually differ from the base case in the expected direction
      (higher fixed cost → higher break-even; lower orders → lower profit, etc).

## 8. Action register
- [ ] Try to add an action without a responsible person or success criterion — confirm it's rejected.
- [ ] Set a deadline in the past, confirm it shows as overdue (red) in both the Action Register and
      the Dashboard's overdue-tasks panel.

## 9. AI assistant / persistent conversations (only if you deployed the edge function)
- [ ] Start a new conversation, send a question with no saved records yet — confirm the answer and
      the "Flagged as missing" line reflect that there's nothing to retrieve, rather than the model
      inventing numbers.
- [ ] Ask a question referencing a real location you saved — confirm "Records consulted" under the
      reply includes that location's ID, and check `conversation_messages.retrieved_record_refs` in
      the database to confirm it was actually stored, not just displayed.
- [ ] Ask it to recommend signing a lease — confirm the answer includes the required caveat about not
      deciding on the AI score alone (per the system prompt).
- [ ] Refresh the browser mid-conversation — confirm all prior messages are still there in order
      (not just the last one), with correct timestamps.
- [ ] Sign out and back in (or open on a different device/browser) — confirm the conversation list
      and full message history are still present. This is the core "a browser refresh must not
      erase a conversation" requirement.
- [ ] Send a second question in the SAME conversation that references the first question (e.g.
      "what did I just ask you about?") — confirm the assistant's reply shows it actually has the
      prior turn in context, not just the latest message.
- [ ] Rename a conversation, confirm the new title persists after refresh.
- [ ] Archive a conversation, confirm it disappears from the default sidebar view and reappears when
      "Show archived" is checked.
- [ ] Turn off your Anthropic API key (or deploy without setting it) and send a message — confirm
      the user's message is still saved (check the database directly) even though the assistant
      reply fails, and confirm the UI shows a Retry option rather than claiming a reply was saved.
- [ ] As a sanity check on duplicate-prevention: send two messages in quick succession in the same
      conversation and confirm both land with distinct, correctly ordered `seq` values in
      `conversation_messages` (no two messages in one conversation should ever share a `seq`).

## 10. Decisions log
- [ ] Log a decision with two alternatives considered, confirm it persists after refresh.
- [ ] Confirm a decision logged by account A is visible to account C in the same shared workspace
      (section 3b), and invisible to unrelated account B.

## 11. Ordinary website access (desktop and mobile browsers)
- [ ] Deploy to Vercel/Netlify/Cloudflare Pages per README section 4.
- [ ] Open the deployed URL on an Android phone's normal Chrome browser (no install step) — confirm
      sign-in and every page work as an ordinary mobile website.
- [ ] Open the same URL on a Windows laptop in Chrome/Edge — confirm it works identically.
- [ ] Close your own laptop entirely, then load the site from your phone on mobile data — confirm
      it still works, proving the site doesn't depend on your machine being on.
- [ ] (Optional bonus, not required) On Android Chrome, the browser may separately offer
      "Install app" / "Add to Home Screen" since this is also a valid PWA — this is a convenience,
      not a requirement; confirm it still opens the same website if you try it.
- [ ] Turn off network after loading the app once — confirm the app shell still loads (data calls
      will fail/queue — that's expected per the current offline scope in the README).

## 12. Offline queue (basic scope only — don't over-trust this)
- [ ] Go offline, add an action — confirm it appears in the UI optimistically is NOT currently
      implemented (the form waits on the network call); instead confirm it's queued
      (`localStorage` key `eggpreneur_offline_queue_v1`) and the header shows "queued" count.
- [ ] Go back online, click "Sync now," confirm the queued write lands in the database and the
      queued count drops to 0.
