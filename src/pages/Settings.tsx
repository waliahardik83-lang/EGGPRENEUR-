import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import { useAuth } from '../lib/AuthContext';
import type { BusinessMember, PendingInvitation } from '../types/database';

export function Settings() {
  const { business, refresh } = useBusiness();
  const { user } = useAuth();
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, string>>({});
  const [inviteEmail, setInviteEmail] = useState('');
  const [myRole, setMyRole] = useState<'owner' | 'member' | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteOk, setInviteOk] = useState<string | null>(null);

  const load = async () => {
    if (!business || !user) return;
    const [m, inv, profiles] = await Promise.all([
      supabase.from('business_members').select('*').eq('business_id', business.id),
      supabase.from('pending_invitations').select('*').eq('business_id', business.id).is('accepted_at', null),
      supabase.from('profiles').select('id, full_name')
    ]);
    setMembers((m.data ?? []) as BusinessMember[]);
    setInvitations((inv.data ?? []) as PendingInvitation[]);
    const profileMap: Record<string, string> = {};
    for (const p of profiles.data ?? []) profileMap[p.id] = p.full_name ?? '(no name set)';
    setMemberProfiles(profileMap);
    const mine = (m.data ?? []).find((x: BusinessMember) => x.user_id === user.id);
    setMyRole(mine?.role ?? null);
  };
  useEffect(() => { void load(); }, [business, user]);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteOk(null);
    if (!business || !inviteEmail.trim()) return;
    const { error } = await supabase.from('pending_invitations').insert({
      business_id: business.id,
      email: inviteEmail.trim().toLowerCase(),
      invited_by: user!.id
    });
    if (error) {
      setInviteError(error.message.includes('duplicate') ? 'That email already has a pending invitation.' : error.message);
    } else {
      setInviteOk(`Invitation created for ${inviteEmail.trim()}. See the instructions below to actually share access.`);
      setInviteEmail('');
      void load();
    }
  };

  const revokeInvite = async (id: string) => {
    await supabase.from('pending_invitations').delete().eq('id', id);
    void load();
  };

  if (!business) return <p>Loading…</p>;

  return (
    <div>
      <h1>Settings & Team Access</h1>

      <section>
        <h2 style={{ fontSize: '1rem' }}>Business profile</h2>
        <label style={{ display: 'block', fontSize: '0.85rem', margin: '8px 0' }}>
          Restaurant / project name
          <input
            defaultValue={business.name}
            onBlur={async (e) => { if (e.target.value !== business.name) { await supabase.from('businesses').update({ name: e.target.value }).eq('id', business.id); void refresh(); } }}
            style={{ display: 'block', width: '100%', maxWidth: 360 }}
          />
        </label>
      </section>

      <section style={{ marginTop: 20 }}>
        <h2 style={{ fontSize: '1rem' }}>Who has access to this workspace</h2>
        <ul style={{ fontSize: '0.85rem' }}>
          {members.map((m) => (
            <li key={m.user_id}>
              {memberProfiles[m.user_id] ?? m.user_id.slice(0, 8)} — {m.role}
              {m.user_id === user?.id && ' (you)'}
            </li>
          ))}
        </ul>

        {invitations.length > 0 && (
          <>
            <h3 style={{ fontSize: '0.9rem' }}>Pending invitations</h3>
            <ul style={{ fontSize: '0.85rem' }}>
              {invitations.map((i) => (
                <li key={i.id}>
                  {i.email} — invited {new Date(i.created_at).toLocaleDateString('en-IN')}
                  {myRole === 'owner' && <button onClick={() => void revokeInvite(i.id)} style={{ marginLeft: 8, fontSize: '0.75rem' }}>Revoke</button>}
                </li>
              ))}
            </ul>
          </>
        )}

        {myRole === 'owner' ? (
          <>
            <form onSubmit={(e) => void sendInvite(e)} style={{ display: 'flex', gap: 8, marginTop: 10, fontSize: '0.85rem' }}>
              <input type="email" placeholder="father's-email@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} style={{ flex: 1 }} />
              <button type="submit">Invite to this workspace</button>
            </form>
            {inviteError && <p style={{ color: '#b91c1c', fontSize: '0.8rem' }}>{inviteError}</p>}
            {inviteOk && <p style={{ color: '#166534', fontSize: '0.8rem' }}>{inviteOk}</p>}

            <div style={{ marginTop: 14, background: '#fff7ed', border: '1px solid #fde4c0', borderRadius: 8, padding: 12, fontSize: '0.8rem' }}>
              <strong>How this invitation actually takes effect — no email is sent by the app:</strong>
              <ol>
                <li>You create the invitation above with the invited person's exact email address.</li>
                <li>Send them the website link yourself (WhatsApp, SMS, in person — whatever you'd normally use).</li>
                <li>They open the link and sign up using <em>that exact email address</em>.</li>
                <li>
                  The moment they confirm their account, the database (see migration 0002, function
                  <code> handle_new_user</code>) automatically checks for a matching invitation and adds them
                  to this same workspace — they will see the same locations, menu, budget, actions and
                  conversations you do, not a separate empty one.
                </li>
              </ol>
              If they already have an account under a different email than you invited, delete that
              invitation and send a new one for the correct email — matching is exact and case-insensitive,
              not fuzzy.
            </div>
          </>
        ) : (
          <p style={{ fontSize: '0.8rem', color: '#666' }}>Only the workspace owner can send or revoke invitations.</p>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1rem' }}>Data export</h2>
        <p style={{ fontSize: '0.82rem', color: '#666' }}>
          Not built in-app yet. Until it is, you (or anyone with dashboard access to the Supabase project)
          can export any table via <strong>Table Editor → Export</strong> in the Supabase dashboard, or a
          full database backup via <code>pg_dump</code>. See README "Data export and recovery."
        </p>
      </section>
    </div>
  );
}
