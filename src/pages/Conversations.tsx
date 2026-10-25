import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import { useConversations, useMessages } from '../hooks/useConversations';

export function Conversations() {
  const { business } = useBusiness();
  const [searchParams, setSearchParams] = useSearchParams();
  const [showArchived, setShowArchived] = useState(false);
  const { conversations, loading: convLoading, createConversation, renameConversation, setArchived } = useConversations(business?.id, showArchived);
  const activeId = searchParams.get('c');
  const { messages, loading: msgLoading, reload: reloadMessages } = useMessages(activeId);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const openConversation = (id: string) => setSearchParams({ c: id });

  const startNew = async () => {
    const conv = await createConversation();
    if (conv) openConversation(conv.id);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || !draft.trim()) return;
    setSendError(null);

    let convId = activeId;
    if (!convId) {
      const conv = await createConversation(draft.trim().slice(0, 60));
      if (!conv) { setSendError('Could not create a conversation.'); return; }
      convId = conv.id;
      setSearchParams({ c: convId });
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setSendError('Not signed in.'); return; }

    const questionText = draft.trim();
    setDraft('');
    setSending(true);

    // 1. Save the user's message BEFORE calling the AI, so it is never lost
    //    even if the AI call fails or the network drops afterward.
    const { error: insertError } = await supabase.from('conversation_messages').insert({
      conversation_id: convId,
      role: 'user',
      content: questionText,
      created_by: userData.user.id,
      seq: 0 // trigger assigns the real value
    });
    if (insertError) {
      setSendError(`Your message could not be saved: ${insertError.message}`);
      setSending(false);
      return;
    }
    await reloadMessages();

    // Auto-title a fresh conversation from its first message.
    const currentConv = conversations.find((c) => c.id === convId);
    if (currentConv && currentConv.title === 'New conversation') {
      void renameConversation(convId, questionText.slice(0, 60));
    }

    // 2. Call the AI edge function. It reads the conversation's message
    //    history itself and inserts the assistant reply (or returns an
    //    error without inserting anything — see Conversations "retry").
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-consultant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ business_id: business.id, conversation_id: convId })
      });
      const json = await resp.json();
      if (!resp.ok) {
        setSendError(json.error ?? 'The AI assistant request failed. Your question was saved — you can retry below.');
      }
    } catch (err) {
      setSendError(
        (err instanceof Error ? err.message : 'Network error') +
        ' — your question was saved. This usually means the ai-consultant edge function is not deployed yet (see README).'
      );
    }
    await reloadMessages();
    setSending(false);
  };

  const retry = async () => {
    if (!activeId || !business) return;
    setSendError(null);
    setSending(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-consultant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ business_id: business.id, conversation_id: activeId })
      });
      const json = await resp.json();
      if (!resp.ok) setSendError(json.error ?? 'Retry failed.');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Network error on retry.');
    }
    await reloadMessages();
    setSending(false);
  };

  if (!business) return <p>Loading…</p>;

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 140px)' }}>
      <aside style={{ width: 220, flexShrink: 0, borderRight: '1px solid #eee', paddingRight: 10, overflowY: 'auto' }}>
        <button onClick={() => void startNew()} style={{ width: '100%', marginBottom: 8 }}>+ New conversation</button>
        <label style={{ fontSize: '0.75rem', display: 'block', marginBottom: 6 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
        {convLoading && <p style={{ fontSize: '0.8rem' }}>Loading…</p>}
        {conversations.map((c) => (
          <div
            key={c.id}
            onClick={() => openConversation(c.id)}
            style={{
              padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem', marginBottom: 2,
              background: activeId === c.id ? '#fde4c0' : 'transparent', opacity: c.archived ? 0.6 : 1
            }}
          >
            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
            <div style={{ display: 'flex', gap: 6, fontSize: '0.7rem' }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); const t = prompt('Rename conversation', c.title); if (t) void renameConversation(c.id, t); }}
                style={{ background: 'none', border: 'none', color: '#777', padding: 0, cursor: 'pointer' }}
              >rename</button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void setArchived(c.id, !c.archived); }}
                style={{ background: 'none', border: 'none', color: '#777', padding: 0, cursor: 'pointer' }}
              >{c.archived ? 'unarchive' : 'archive'}</button>
            </div>
          </div>
        ))}
        {!convLoading && conversations.length === 0 && <p style={{ fontSize: '0.78rem', color: '#999' }}>No conversations yet.</p>}
      </aside>

      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <p style={{ fontSize: '0.78rem', color: '#666', marginTop: 0 }}>
          Answers are generated only from this business's saved records plus general knowledge — it will not
          invent Ambala-specific data and cannot claim to have visited anywhere. Requires the
          <code> ai-consultant</code> edge function to be deployed (see README); everything else in the app
          works without it.
        </p>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
          {!activeId && <p style={{ color: '#888' }}>Select a conversation or start a new one.</p>}
          {msgLoading && <p>Loading messages…</p>}
          {messages.map((m) => (
            <div key={m.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: '0.72rem', color: '#999' }}>
                {m.role === 'user' ? 'You' : m.role === 'assistant' ? 'AI Consultant' : 'System'} · {new Date(m.created_at).toLocaleString('en-IN')}
                {m.status === 'error' && ' · failed'}
              </div>
              <div style={{
                whiteSpace: 'pre-wrap', fontSize: '0.88rem', background: m.role === 'user' ? '#fff7ed' : '#f8fafc',
                border: '1px solid #eee', borderRadius: 8, padding: 10, marginTop: 2
              }}>
                {m.content}
              </div>
              {m.role === 'assistant' && (m.retrieved_record_refs?.length > 0 || m.missing_evidence?.length > 0) && (
                <div style={{ fontSize: '0.7rem', color: '#777', marginTop: 4 }}>
                  {m.retrieved_record_refs?.length > 0 && <>Records consulted: {m.retrieved_record_refs.map((r) => `${r.table}:${r.id.slice(0, 8)}`).join(', ')}<br /></>}
                  {m.missing_evidence?.length > 0 && <>Flagged as missing: {m.missing_evidence.join('; ')}</>}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {sendError && (
          <div style={{ color: '#b91c1c', fontSize: '0.82rem', margin: '8px 0' }}>
            {sendError} {activeId && <button type="button" onClick={() => void retry()} disabled={sending}>Retry</button>}
          </div>
        )}

        <form onSubmit={(e) => void send(e)} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            placeholder="Ask about a saved location, menu item, or financial assumption…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
            style={{ flex: 1 }}
          />
          <button type="submit" disabled={sending || !draft.trim()}>{sending ? 'Sending…' : 'Send'}</button>
        </form>
      </section>
    </div>
  );
}
