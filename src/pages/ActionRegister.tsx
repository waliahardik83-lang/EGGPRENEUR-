import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import type { ActionItem, ActionPriority, ActionStatus } from '../types/database';

const MODULES = ['Location', 'Menu', 'Finance', 'Compliance', 'Demand', 'Operations', 'Marketing', 'General'];

export function ActionRegister() {
  const { business } = useBusiness();
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | ActionStatus>('ALL');
  const [form, setForm] = useState({
    module: 'General', title: '', responsible_person: '', deadline: '', estimated_cost: '', success_criterion: '', priority: 'MEDIUM' as ActionPriority
  });

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase.from('actions').select('*').eq('business_id', business.id).order('deadline', { ascending: true, nullsFirst: false });
    setActions((data ?? []) as ActionItem[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [business]);

  const addAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || !form.title.trim() || !form.responsible_person.trim() || !form.success_criterion.trim()) {
      alert('Title, responsible person and success criterion are required — every recommendation needs all three.');
      return;
    }
    await supabase.from('actions').insert({
      business_id: business.id,
      module: form.module,
      title: form.title.trim(),
      responsible_person: form.responsible_person.trim(),
      deadline: form.deadline || null,
      estimated_cost: form.estimated_cost === '' ? null : Number(form.estimated_cost),
      success_criterion: form.success_criterion.trim(),
      priority: form.priority
    });
    setForm({ module: 'General', title: '', responsible_person: '', deadline: '', estimated_cost: '', success_criterion: '', priority: 'MEDIUM' });
    void load();
  };

  const setStatus = async (id: string, status: ActionStatus) => {
    await supabase.from('actions').update({ status, completed_at: status === 'DONE' ? new Date().toISOString() : null }).eq('id', id);
    void load();
  };

  if (loading) return <p>Loading…</p>;
  const filtered = filter === 'ALL' ? actions : actions.filter((a) => a.status === filter);

  return (
    <div>
      <h1>Action Register</h1>
      <p style={{ fontSize: '0.82rem', color: '#666' }}>
        Every recommendation across the app should end up here as an action with a responsible person,
        deadline, cost estimate and a measurable success criterion.
      </p>

      <form onSubmit={(e) => void addAction(e)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, margin: '14px 0', fontSize: '0.82rem' }}>
        <select value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value })}>
          {MODULES.map((m) => <option key={m}>{m}</option>)}
        </select>
        <input placeholder="Action title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input placeholder="Responsible person" value={form.responsible_person} onChange={(e) => setForm({ ...form, responsible_person: e.target.value })} />
        <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
        <input type="number" placeholder="Estimated cost ₹" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} />
        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as ActionPriority })}>
          <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
        </select>
        <input placeholder="Success criterion (measurable)" value={form.success_criterion} onChange={(e) => setForm({ ...form, success_criterion: e.target.value })} style={{ gridColumn: 'span 2' }} />
        <button type="submit">Add action</button>
      </form>

      <div style={{ marginBottom: 10, fontSize: '0.8rem' }}>
        Filter:{' '}
        {(['ALL', 'OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{ marginRight: 4, fontWeight: filter === f ? 700 : 400 }}>{f}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((a) => {
          const overdue = a.deadline && new Date(a.deadline) < new Date() && a.status !== 'DONE' && a.status !== 'CANCELLED';
          return (
            <div key={a.id} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10, background: overdue ? '#fef2f2' : 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <strong>{a.title}</strong>
                <select value={a.status} onChange={(e) => void setStatus(a.id, e.target.value as ActionStatus)}>
                  <option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="BLOCKED">BLOCKED</option><option value="DONE">DONE</option><option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#666' }}>
                {a.module} · {a.responsible_person} · {a.deadline ?? 'no deadline'} · {a.priority}
                {a.estimated_cost ? ` · ₹${a.estimated_cost.toLocaleString('en-IN')}` : ''}
              </div>
              <div style={{ fontSize: '0.78rem' }}>Success: {a.success_criterion}</div>
            </div>
          );
        })}
        {filtered.length === 0 && <p style={{ color: '#999' }}>No actions match this filter.</p>}
      </div>
    </div>
  );
}
