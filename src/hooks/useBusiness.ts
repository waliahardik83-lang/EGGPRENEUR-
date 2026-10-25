import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Business } from '../types/database';
import { useAuth } from '../lib/AuthContext';

/**
 * Finds the business this user is a MEMBER of (owner or invited member —
 * see business_members in migration 0002), not just one they created.
 * MVP simplification: still assumes one shared business per workspace. If
 * a user belongs to more than one business this picks the earliest one —
 * multi-business support is not built.
 *
 * First-ever login with no pending invitation: creates a new business and
 * the signup trigger makes them its 'owner' member automatically.
 * First-ever login WITH a pending invitation waiting for their email:
 * the signup trigger has already added them as a 'member' of the inviter's
 * business, so this hook finds that existing business instead of creating
 * a new one — this is what makes the invite flow actually share data
 * rather than silently giving the invitee their own empty workspace.
 */
export function useBusiness() {
  const { user } = useAuth();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data: membership, error: memberError } = await supabase
      .from('business_members')
      .select('business_id, joined_at')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memberError) {
      setError(memberError.message);
      setLoading(false);
      return;
    }

    if (membership) {
      const { data, error: fetchError } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', membership.business_id)
        .single();
      if (fetchError) setError(fetchError.message);
      else setBusiness(data as Business);
      setLoading(false);
      return;
    }

    // No membership at all yet (shouldn't normally happen post-signup
    // trigger, but handle it defensively): create the default business.
    const { data: created, error: createError } = await supabase
      .from('businesses')
      .insert({ owner_id: user.id, name: 'Our Egg Restaurant', city: 'Ambala', state: 'Haryana' })
      .select()
      .single();

    if (createError) {
      setError(createError.message);
    } else {
      setBusiness(created as Business);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { business, loading, error, refresh };
}
