import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import type { Location } from '../types/database';

export function Locations() {
  const { business } = useBusiness();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  const load = async () => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase.from('locations').select('*').eq('business_id', business.id).order('created_at', { ascending: false });
    setLocations((data ?? []) as Location[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [business]);

  const addLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business || !newName.trim()) return;
    await supabase.from('locations').insert({ business_id: business.id, name: newName.trim() });
    setNewName('');
    void load();
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1>Candidate Locations</h1>
      <p style={{ color: '#666', fontSize: '0.9rem' }}>
        Add every site you are considering. Nothing here counts as validated demand until footfall
        observations and competitor checks are actually recorded against it.
      </p>

      <form onSubmit={(e) => void addLocation(e)} style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
        <input placeholder="e.g. Model Town Market, shop #4" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button type="submit">Add candidate site</button>
      </form>

      {locations.length === 0 && <p style={{ color: '#888' }}>No locations added yet.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {locations.map((loc) => (
          <Link
            key={loc.id}
            to={`/locations/${loc.id}`}
            style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{loc.name}</strong>
              <StatusPill status={loc.status} />
            </div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>
              {loc.address || 'No address yet'}
              {loc.asking_rent_monthly ? ` · Asking rent ₹${loc.asking_rent_monthly.toLocaleString('en-IN')}/mo` : ''}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Location['status'] }) {
  const colors: Record<Location['status'], string> = {
    CANDIDATE: '#eef2ff', SHORTLISTED: '#fef3c7', REJECTED: '#fee2e2', SELECTED: '#dcfce7'
  };
  return <span style={{ background: colors[status], fontSize: '0.7rem', padding: '2px 8px', borderRadius: 999 }}>{status}</span>;
}
