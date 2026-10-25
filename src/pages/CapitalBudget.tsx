import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import type { CapitalBudgetItem, EvidenceConfidence } from '../types/database';
import { EvidenceBadge } from '../components/EvidenceBadge';

const CATEGORIES = ['Deposit & Advance Rent', 'Renovation & Electrical', 'Exhaust & Plumbing', 'Signage', 'Kitchen Equipment', 'Refrigeration', 'Furniture & Utensils', 'POS', 'Licences & Professional Fees', 'Opening Inventory', 'Contingency', 'Other'];

export function CapitalBudget() {
  const { business, refresh } = useBusiness();
  const [items, setItems] = useState<CapitalBudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category: CATEGORIES[0], item: '', estimated_cost: '', confidence: 'ESTIMATED' as EvidenceConfidence });

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase.from('capital_budget_items').select('*').eq('business_id', business.id).order('created_at');
    setItems((data ?? []) as CapitalBudgetItem[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [business]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || !form.item.trim() || form.estimated_cost === '') return;
    await supabase.from('capital_budget_items').insert({
      business_id: business.id,
      category: form.category,
      item: form.item.trim(),
      estimated_cost: Number(form.estimated_cost),
      evidence_confidence: form.confidence
    });
    setForm({ category: CATEGORIES[0], item: '', estimated_cost: '', confidence: 'ESTIMATED' });
    void load();
  };

  const updateStatus = async (id: string, status: CapitalBudgetItem['status']) => {
    await supabase.from('capital_budget_items').update({ status }).eq('id', id);
    void load();
  };

  if (loading || !business) return <p>Loading…</p>;
  const totalEstimated = items.reduce((s, i) => s + i.estimated_cost, 0);

  return (
    <div>
      <h1>Business Setup & Capital Budget</h1>
      <label style={{ display: 'block', fontSize: '0.85rem', margin: '10px 0' }}>
        Total startup budget ceiling (₹) — used on the Dashboard to show remaining capital:
        <input
          type="number"
          defaultValue={business.total_startup_budget ?? ''}
          onBlur={async (e) => {
            await supabase.from('businesses').update({ total_startup_budget: e.target.value === '' ? null : Number(e.target.value) }).eq('id', business.id);
            void refresh();
          }}
          style={{ display: 'block', width: 200 }}
        />
      </label>

      <form onSubmit={(e) => void addItem(e)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0', fontSize: '0.82rem' }}>
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input placeholder="Item (e.g. Deep fryer, 2 burner)" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
        <input type="number" placeholder="Estimated cost ₹" value={form.estimated_cost} onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })} style={{ width: 130 }} />
        <select value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value as EvidenceConfidence })}>
          <option value="VERIFIED">Verified quote</option>
          <option value="USER_REPORTED">Told/seen directly</option>
          <option value="ESTIMATED">Estimated</option>
          <option value="UNVERIFIED">Unverified guess</option>
        </select>
        <button type="submit">Add line item</button>
      </form>

      <p style={{ fontWeight: 700 }}>Total estimated: ₹{totalEstimated.toLocaleString('en-IN')}</p>

      <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
        <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}><th>Category</th><th>Item</th><th>Est. ₹</th><th>Confidence</th><th>Status</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} style={{ borderBottom: '1px solid #f3f3f3' }}>
              <td>{i.category}</td><td>{i.item}</td><td>₹{i.estimated_cost.toLocaleString('en-IN')}</td>
              <td><EvidenceBadge confidence={i.evidence_confidence} /></td>
              <td>
                <select value={i.status} onChange={(e) => void updateStatus(i.id, e.target.value as CapitalBudgetItem['status'])}>
                  <option value="PLANNED">Planned</option><option value="COMMITTED">Committed</option><option value="PAID">Paid</option>
                </select>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5} style={{ color: '#999', padding: '8px 0' }}>No budget line items yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
