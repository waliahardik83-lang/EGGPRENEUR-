import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import type { Decision, DecisionStatus } from '../types/database';

export function Decisions() {
  const { business } = useBusiness();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', decision: '', rationale: '', status: 'DECIDED' as DecisionStatus });
  const [altOption, setAltOption] = useState('');
  const [altReason, setAltReason] = useState('');
  const [alternatives, setAlternatives] = useState<{ option: string; why_rejected: string }[]>([]);

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase.from('decisions').select('*').eq('business_id', business.id).order('decided_at', { ascending: false });
    setDecisions((data ?? []) as Decision[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [business]);

  const addAlternative = () => {
    if (!altOption.trim()) return;
    setAlternatives([...alternatives, { option: altOption.trim(), why_rejected: altReason.trim() }]);
    setAltOption('');
    setAltReason('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || !form.title.trim() || !form.decision.trim()) return;
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from('decisions').insert({
      business_id: business.id,
      title: form.title.trim(),
      decision: form.decision.trim(),
      rationale: form.rationale.trim() || null,
      status: form.status,
      alternatives_considered: alternatives,
      decided_by: userData.user?.id ?? null
    });
    setForm({ title: '', decision: '', rationale: '', status: 'DECIDED' });
    setAlternatives([]);
    void load();
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1>Decisions Log</h1>
      <p style={{ fontSize: '0.82rem', color: '#666' }}>
        A permanent record of what was decided, what was rejected, and why — so the AI consultant (and your
        family) can explain later why a choice was made instead of re-litigating it from memory.
      </p>

      <form onSubmit={(e) => void submit(e)} style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, margin: '14px 0', fontSize: '0.82rem' }}>
        <input placeholder="Decision title (e.g. 'Site selection: Model Town vs Cantt Road')" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: '100%', marginBottom: 6 }} />
        <textarea placeholder="What was decided" value={form.decision} onChange={(e) => setForm({ ...form, decision: e.target.value })} rows={2} style={{ width: '100%', marginBottom: 6 }} />
        <textarea placeholder="Rationale (why)" value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} rows={2} style={{ width: '100%', marginBottom: 6 }} />

        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input placeholder="Alternative considered" value={altOption} onChange={(e) => setAltOption(e.target.value)} style={{ flex: 1 }} />
          <input placeholder="Why rejected" value={altReason} onChange={(e) => setAltReason(e.target.value)} style={{ flex: 1 }} />
          <button type="button" onClick={addAlternative}>Add</button>
        </div>
        {alternatives.length > 0 && (
          <ul style={{ fontSize: '0.78rem' }}>
            {alternatives.map((a, i) => <li key={i}>{a.option} — rejected because: {a.why_rejected || 'no reason given'}</li>)}
          </ul>
        )}

        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as DecisionStatus })} style={{ marginRight: 8 }}>
          <option value="DECIDED">Decided</option>
          <option value="REJECTED">Rejected (the option itself)</option>
          <option value="SUPERSEDED">Superseded</option>
        </select>
        <button type="submit">Save decision</button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {decisions.map((d) => (
          <div key={d.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10 }}>
            <strong>{d.title}</strong> <span style={{ fontSize: '0.75rem', color: '#777' }}>· {d.status} · {new Date(d.decided_at).toLocaleDateString('en-IN')}</span>
            <p style={{ fontSize: '0.85rem', margin: '4px 0' }}>{d.decision}</p>
            {d.rationale && <p style={{ fontSize: '0.8rem', color: '#555' }}>Why: {d.rationale}</p>}
            {d.alternatives_considered.length > 0 && (
              <ul style={{ fontSize: '0.78rem', color: '#777' }}>
                {d.alternatives_considered.map((a, i) => <li key={i}>Considered and rejected: {a.option} — {a.why_rejected}</li>)}
              </ul>
            )}
          </div>
        ))}
        {decisions.length === 0 && <p style={{ color: '#999' }}>No decisions logged yet.</p>}
      </div>
    </div>
  );
}
