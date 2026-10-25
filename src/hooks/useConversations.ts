import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Conversation, ConversationMessage } from '../types/database';

export function useConversations(businessId: string | undefined, showArchived: boolean) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    let query = supabase.from('conversations').select('*').eq('business_id', businessId).order('updated_at', { ascending: false });
    if (!showArchived) query = query.eq('archived', false);
    const { data } = await query;
    setConversations((data ?? []) as Conversation[]);
    setLoading(false);
  }, [businessId, showArchived]);

  useEffect(() => { void load(); }, [load]);

  const createConversation = async (title = 'New conversation'): Promise<Conversation | null> => {
    if (!businessId) return null;
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return null;
    const { data, error } = await supabase
      .from('conversations')
      .insert({ business_id: businessId, title, created_by: userData.user.id })
      .select()
      .single();
    if (error) {
      console.error('createConversation failed:', error.message);
      return null;
    }
    await load();
    return data as Conversation;
  };

  const renameConversation = async (id: string, title: string) => {
    await supabase.from('conversations').update({ title }).eq('id', id);
    await load();
  };

  const setArchived = async (id: string, archived: boolean) => {
    await supabase.from('conversations').update({ archived }).eq('id', id);
    await load();
  };

  return { conversations, loading, createConversation, renameConversation, setArchived, reload: load };
}

export function useMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('seq', { ascending: true });
    if (error) console.error('load messages failed:', error.message);
    setMessages((data ?? []) as ConversationMessage[]);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => { void load(); }, [load]);

  return { messages, loading, reload: load };
}
