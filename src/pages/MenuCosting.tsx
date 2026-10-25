import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import type { MenuItem, MenuItemIngredient } from '../types/database';
import { analyzeMenuItem } from '../lib/menuCosting';

export function MenuCosting() {
  const { business } = useBusiness();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase.from('menu_items').select('*').eq('business_id', business.id).order('created_at');
    setItems((data ?? []) as MenuItem[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [business]);

  const addItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || !newName.trim()) return;
    const { data } = await supabase.from('menu_items').insert({ business_id: business.id, name: newName.trim() }).select().single();
    setNewName('');
    await load();
    if (data) setSelected(data.id);
  };

  if (loading) return <p>Loading…</p>;

  const activeItem = items.find((i) => i.id === selected) ?? null;

  return (
    <div>
      <h1>Menu & Recipe Costing</h1>
      <form onSubmit={(e) => void addItem(e)} style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <input placeholder="e.g. Egg Bhurji Pav" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button type="submit">Add dish</button>
      </form>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180 }}>
          {items.map((it) => (
            <div
              key={it.id}
              onClick={() => setSelected(it.id)}
              style={{ padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: selected === it.id ? '#fde4c0' : '#fafafa', marginBottom: 4, fontSize: '0.85rem' }}
            >
              {it.name}
            </div>
          ))}
          {items.length === 0 && <p style={{ color: '#999', fontSize: '0.85rem' }}>No dishes added yet.</p>}
        </div>

        <div style={{ flex: 1, minWidth: 280 }}>
          {activeItem ? <MenuItemEditor item={activeItem} onChange={load} /> : <p style={{ color: '#888' }}>Select a dish to edit its recipe and pricing.</p>}
        </div>
      </div>
    </div>
  );
}

function MenuItemEditor({ item, onChange }: { item: MenuItem; onChange: () => void }) {
  const [ingredients, setIngredients] = useState<MenuItemIngredient[]>([]);
  const [newIng, setNewIng] = useState({ ingredient_name: '', quantity: '', unit: 'g', unit_cost: '' });

  const loadIngredients = async () => {
    const { data } = await supabase.from('menu_item_ingredients').select('*').eq('menu_item_id', item.id);
    setIngredients((data ?? []) as MenuItemIngredient[]);
  };
  useEffect(() => { void loadIngredients(); }, [item.id]);

  const update = async (field: keyof MenuItem, value: unknown) => {
    await supabase.from('menu_items').update({ [field]: value }).eq('id', item.id);
    onChange();
  };

  const addIngredient = async () => {
    if (!newIng.ingredient_name.trim() || newIng.quantity === '' || newIng.unit_cost === '') return;
    await supabase.from('menu_item_ingredients').insert({
      menu_item_id: item.id,
      ingredient_name: newIng.ingredient_name.trim(),
      quantity: Number(newIng.quantity),
      unit: newIng.unit,
      unit_cost: Number(newIng.unit_cost),
      evidence_confidence: 'USER_REPORTED'
    });
    setNewIng({ ingredient_name: '', quantity: '', unit: 'g', unit_cost: '' });
    void loadIngredients();
  };

  const removeIngredient = async (id: string) => {
    await supabase.from('menu_item_ingredients').delete().eq('id', id);
    void loadIngredients();
  };

  const analysis = analyzeMenuItem(item, ingredients);

  return (
    <div>
      <h2 style={{ fontSize: '1.05rem' }}>{item.name}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8, fontSize: '0.82rem' }}>
        <NumField label="Yield (portions/batch)" def={item.yield_qty} onSave={(v) => update('yield_qty', v ?? 1)} />
        <NumField label="Wastage %" def={item.wastage_pct} onSave={(v) => update('wastage_pct', v ?? 0)} />
        <NumField label="Packaging cost ₹" def={item.packaging_cost} onSave={(v) => update('packaging_cost', v ?? 0)} />
        <NumField label="Prep time (min)" def={item.prep_time_minutes} onSave={(v) => update('prep_time_minutes', v)} />
        <NumField label="Dine-in price ₹" def={item.dine_in_price} onSave={(v) => update('dine_in_price', v)} />
        <NumField label="Takeaway price ₹" def={item.takeaway_price} onSave={(v) => update('takeaway_price', v)} />
        <NumField label="Delivery price ₹" def={item.delivery_price} onSave={(v) => update('delivery_price', v)} />
        <NumField label="Tax %" def={item.tax_pct} onSave={(v) => update('tax_pct', v ?? 0)} />
        <NumField label="Delivery platform fee %" def={item.delivery_platform_fee_pct} onSave={(v) => update('delivery_platform_fee_pct', v ?? 0)} />
      </div>

      <h3 style={{ fontSize: '0.95rem', marginTop: 16 }}>Ingredients</h3>
      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
        <thead><tr><th align="left">Ingredient</th><th>Qty</th><th>Unit</th><th>Unit cost ₹</th><th></th></tr></thead>
        <tbody>
          {ingredients.map((ing) => (
            <tr key={ing.id}>
              <td>{ing.ingredient_name}</td><td>{ing.quantity}</td><td>{ing.unit}</td><td>{ing.unit_cost}</td>
              <td><button onClick={() => void removeIngredient(ing.id)} type="button">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <input placeholder="Name" value={newIng.ingredient_name} onChange={(e) => setNewIng({ ...newIng, ingredient_name: e.target.value })} style={{ flex: 1, minWidth: 100 }} />
        <input placeholder="Qty" type="number" value={newIng.quantity} onChange={(e) => setNewIng({ ...newIng, quantity: e.target.value })} style={{ width: 70 }} />
        <input placeholder="Unit" value={newIng.unit} onChange={(e) => setNewIng({ ...newIng, unit: e.target.value })} style={{ width: 60 }} />
        <input placeholder="Cost/unit" type="number" value={newIng.unit_cost} onChange={(e) => setNewIng({ ...newIng, unit_cost: e.target.value })} style={{ width: 80 }} />
        <button type="button" onClick={() => void addIngredient()}>Add</button>
      </div>

      <h3 style={{ fontSize: '0.95rem', marginTop: 16 }}>Per-portion economics</h3>
      <p style={{ fontSize: '0.8rem' }}>
        Ingredient cost (wastage-adjusted): ₹{analysis.ingredientResult.wastageAdjustedCost.toFixed(2)}
      </p>
      {analysis.channels.map((ch) => (
        <div key={ch.channel} style={{ fontSize: '0.82rem', border: '1px solid #eee', borderRadius: 8, padding: 8, marginBottom: 6 }}>
          <strong>{ch.channel.replace('_', ' ')}</strong>{' '}
          {ch.price === null ? <span style={{ color: '#999' }}>no price set</span> : (
            <>
              — Contribution: ₹{ch.contribution!.toFixed(2)} ({((ch.contributionMarginPct ?? 0) * 100).toFixed(0)}% margin)
            </>
          )}
          {ch.flags.map((f, i) => <div key={i} style={{ color: '#b45309' }}>⚠ {f}</div>)}
        </div>
      ))}
      {analysis.overallFlags.map((f, i) => <div key={i} style={{ color: '#b91c1c', fontSize: '0.8rem' }}>⚠ {f}</div>)}
    </div>
  );
}

function NumField({ label, def, onSave }: { label: string; def: number | null; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(def?.toString() ?? '');
  useEffect(() => setV(def?.toString() ?? ''), [def]);
  return (
    <label style={{ display: 'block' }}>
      {label}
      <input
        type="number" value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = v === '' ? null : Number(v);
          if (n !== def) onSave(n);
        }}
        style={{ display: 'block', width: '100%' }}
      />
    </label>
  );
}
