// Supabase Edge Function (Deno runtime).
// Deploy with: supabase functions deploy ai-consultant
// Requires a secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// This function has NOT been deployed or executed in the delivery
// environment (no network access here). Review and test it yourself per
// README.md / TESTING.md before trusting its output.
//
// Phase 1 update: this now operates on a persistent conversation instead
// of a single question/answer pair. The frontend (src/pages/Conversations.tsx)
// already saved the user's message to conversation_messages BEFORE calling
// this function. This function:
//   1. Loads that conversation's message history (so the model has memory
//      of the thread, not just the latest message).
//   2. Retrieves the business's saved records fresh on every call (not
//      cached), so answers reflect the current state of the data.
//   3. Calls the model.
//   4. On success, inserts ONE assistant message row and returns it.
//   5. On failure, inserts NOTHING — it returns an error so the frontend
//      can offer "Retry" without ever claiming a reply was saved when it
//      wasn't.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// Deliberately the ANON key, not the service-role key. The service-role
// key bypasses Row Level Security entirely, which would make this
// function's safety depend on every query below being written perfectly.
// Using the anon key + the caller's own JWT (set as Authorization below)
// means Postgres enforces RLS exactly as it would for a normal browser
// request — this function can only ever see what the calling user is
// actually a member of, by construction, not by our code being careful.
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const SYSTEM_PROMPT = `You are the AI Business Consultant inside Eggpreneur, a private business command
center for a family opening an egg-special restaurant in Ambala, Haryana, India. This is a persistent
conversation thread — treat earlier messages in it as things you already said or were told, and don't
repeat yourself unnecessarily.

Rules you must follow strictly:
1. You will be given a JSON snapshot of the business's SAVED RECORDS (locations, menu items, financial
   scenarios, open actions, capital budget, logged decisions). Base your answer only on this data and on
   general, clearly-labeled business/food-safety knowledge. Do NOT invent Ambala footfall numbers,
   competitor sales, supplier prices, or demand figures that are not in the provided data.
2. Every material input you rely on must be labeled with its evidence_confidence
   (VERIFIED / USER_REPORTED / ESTIMATED / UNVERIFIED) exactly as given in the data. If a figure has no
   confidence label or the data needed doesn't exist, say so explicitly and ask for it — do not guess.
3. You have NOT performed and cannot perform a field visit, phone call, or web search. Never imply that
   you observed anything in Ambala yourself.
4. When you make a recommendation, give: the action, who should do it (use names/roles already in the
   data if available, otherwise say "assign an owner"), a rough deadline, an estimated cost if relevant,
   and a measurable success criterion.
5. Challenge unrealistic assumptions (e.g. sales projections far above break-even, zero marketing cost,
   no validated demand) respectfully but directly.
6. When comparing options (e.g. two locations), show the trade-offs rather than declaring a single winner,
   unless the data overwhelmingly supports one.
7. Never tell the user to sign a lease or make a large purchase based on your analysis alone — remind them
   that a go/no-go decision needs the pre-lease feasibility checklist and real evidence, not an AI score.
8. State any assumption you had to make to answer, inline, clearly marked as an assumption.
9. If official confirmation (FSSAI, municipal, fire, GST, etc.) is relevant to the question, say so and
   point to the Licences & Compliance module rather than asserting a legal conclusion yourself.
10. If a logged decision in the data already answers what's being asked, say so and reference it instead
    of re-deciding from scratch — but note if new data since that decision might change the answer.
11. Before changing how you'd advise on something consequential (e.g. recommending abandoning a
    previously decided site), say plainly that this would reverse an earlier logged decision and ask the
    owner to confirm before they act on it. You cannot write to the Decisions Log yourself in this
    version — tell the user to log it on the Decisions page if they proceed.

Respond in plain, concrete language a non-technical shop owner in Haryana can act on. Keep it structured
with short headings when the answer has multiple parts.`;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured on the server. The rest of the app works without it — see README "AI provider integration".' }), { status: 500 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });

  const { business_id, conversation_id } = await req.json();
  if (!business_id || !conversation_id) {
    return new Response(JSON.stringify({ error: 'business_id and conversation_id are required' }), { status: 400 });
  }

  // Use the caller's own JWT so Postgres RLS still applies — this function
  // must never be able to read another workspace's data, and can only act
  // on a conversation the caller is actually a member of.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401 });
  }

  const { data: conversation, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversation_id)
    .eq('business_id', business_id)
    .single();
  if (convError || !conversation) {
    return new Response(JSON.stringify({ error: 'Conversation not found or not accessible to this user.' }), { status: 404 });
  }

  const { data: history, error: historyError } = await supabase
    .from('conversation_messages')
    .select('role, content, seq')
    .eq('conversation_id', conversation_id)
    .order('seq', { ascending: true });
  if (historyError) {
    return new Response(JSON.stringify({ error: `Could not load conversation history: ${historyError.message}` }), { status: 500 });
  }
  if (!history || history.length === 0 || history[history.length - 1].role !== 'user') {
    return new Response(JSON.stringify({ error: 'No new user message found to respond to.' }), { status: 400 });
  }

  // Retrieve the business's actual records. Each retrieved row is recorded
  // as a {table, id} ref, saved on the assistant message for auditability.
  const retrievedRefs: { table: string; id: string }[] = [];
  const [biz, locations, menuItems, scenarios, actions, budget, decisions] = await Promise.all([
    supabase.from('businesses').select('*').eq('id', business_id).single(),
    supabase.from('locations').select('*').eq('business_id', business_id),
    supabase.from('menu_items').select('*, menu_item_ingredients(*)').eq('business_id', business_id),
    supabase.from('financial_scenarios').select('*').eq('business_id', business_id),
    supabase.from('actions').select('*').eq('business_id', business_id).neq('status', 'DONE'),
    supabase.from('capital_budget_items').select('*').eq('business_id', business_id),
    supabase.from('decisions').select('*').eq('business_id', business_id)
  ]);

  if (biz.error || !biz.data) {
    return new Response(JSON.stringify({ error: 'Business not found or not accessible to this user.' }), { status: 404 });
  }

  for (const l of locations.data ?? []) retrievedRefs.push({ table: 'locations', id: l.id });
  for (const m of menuItems.data ?? []) retrievedRefs.push({ table: 'menu_items', id: m.id });
  for (const s of scenarios.data ?? []) retrievedRefs.push({ table: 'financial_scenarios', id: s.id });
  for (const a of actions.data ?? []) retrievedRefs.push({ table: 'actions', id: a.id });
  for (const b of budget.data ?? []) retrievedRefs.push({ table: 'capital_budget_items', id: b.id });
  for (const d of decisions.data ?? []) retrievedRefs.push({ table: 'decisions', id: d.id });

  const snapshot = {
    business: biz.data,
    locations: locations.data ?? [],
    menu_items: menuItems.data ?? [],
    financial_scenarios: scenarios.data ?? [],
    open_actions: actions.data ?? [],
    capital_budget_items: budget.data ?? [],
    logged_decisions: decisions.data ?? []
  };

  const missingEvidence: string[] = [];
  if ((locations.data ?? []).length === 0) missingEvidence.push('No locations recorded yet.');
  if ((menuItems.data ?? []).length === 0) missingEvidence.push('No menu items costed yet.');
  if ((scenarios.data ?? []).length === 0) missingEvidence.push('No saved financial scenarios yet.');

  // Anthropic's messages API wants alternating user/assistant turns with no
  // system-role entries in the array (system is a separate top-level field).
  // The business snapshot is injected as a prefix on the LATEST user turn
  // only, not repeated on every turn, to keep the context window reasonable
  // in long-running conversations — this means the model always sees the
  // current snapshot once per call, not a stale one from an earlier turn.
  const turns = (history as { role: string; content: string }[])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const lastUserIndex = turns.map((t) => t.role).lastIndexOf('user');
  turns[lastUserIndex] = {
    role: 'user',
    content:
      `SAVED BUSINESS RECORDS (JSON, current as of this message):\n${JSON.stringify(snapshot)}\n\n` +
      `KNOWN GAPS IN THE DATA: ${missingEvidence.length ? missingEvidence.join('; ') : 'none flagged automatically'}\n\n` +
      `OWNER'S QUESTION: ${turns[lastUserIndex].content}`
  };

  const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: turns
    })
  });

  if (!anthropicResp.ok) {
    const errText = await anthropicResp.text();
    // Nothing is written to conversation_messages on failure — the
    // frontend's "Retry" button calls this function again rather than
    // resubmitting the user's message, since it's already saved.
    return new Response(JSON.stringify({ error: `Anthropic API error: ${errText}` }), { status: 502 });
  }

  const anthropicData = await anthropicResp.json();
  const answer = (anthropicData.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('\n');

  const { data: savedMessage, error: saveError } = await supabase
    .from('conversation_messages')
    .insert({
      conversation_id,
      role: 'assistant',
      content: answer,
      retrieved_record_refs: retrievedRefs,
      missing_evidence: missingEvidence,
      model: 'claude-sonnet-5',
      seq: 0 // trigger assigns the real value
    })
    .select()
    .single();

  if (saveError) {
    // The model answered but we could not persist it — tell the truth
    // rather than returning a reply the user will lose on refresh.
    return new Response(JSON.stringify({ error: `The AI replied but the answer could not be saved: ${saveError.message}` }), { status: 500 });
  }

  await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversation_id);

  return new Response(JSON.stringify({ message: savedMessage }), { headers: { 'content-type': 'application/json' } });
});
