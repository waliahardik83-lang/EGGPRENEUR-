import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import type { Location, FootfallObservation, LocationScoringCriterion, LocationScore, EvidenceFile } from '../types/database';
import { calculateLocationScore } from '../lib/locationScoring';
import { EvidenceBadge } from '../components/EvidenceBadge';
import { uploadEvidence, listEvidence } from '../lib/evidence';

const TIME_SLOTS = ['Weekday Morning', 'Weekday Lunch', 'Weekday Evening', 'Weekend'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function LocationDetail() {
  const { id } = useParams<{ id: string }>();
  const { business } = useBusiness();
  const [location, setLocation] = useState<Location | null>(null);
  const [observations, setObservations] = useState<FootfallObservation[]>([]);
  const [criteria, setCriteria] = useState<LocationScoringCriterion[]>([]);
  const [scores, setScores] = useState<LocationScore[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<EvidenceFile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id || !business) return;
    setLoading(true);
    const [loc, obs, crit, scr, ev] = await Promise.all([
      supabase.from('locations').select('*').eq('id', id).single(),
      supabase.from('location_footfall_observations').select('*').eq('location_id', id).order('observed_date', { ascending: false }),
      supabase.from('location_scoring_criteria').select('*').eq('business_id', business.id),
      supabase.from('location_scores').select('*'),
      listEvidence('locations', id)
    ]);
    setLocation(loc.data as Location);
    setObservations((obs.data ?? []) as FootfallObservation[]);
    setCriteria((crit.data ?? []) as LocationScoringCriterion[]);
    setScores(((scr.data ?? []) as LocationScore[]).filter((s) => s.location_id === id));
    setEvidenceFiles(ev);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [id, business]);

  if (loading || !location) return <p>Loading…</p>;

  const scoreSummary = calculateLocationScore(criteria, scores);

  const updateField = async (field: keyof Location, value: unknown) => {
    await supabase.from('locations').update({ [field]: value }).eq('id', location.id);
    void load();
  };

  return (
    <div>
      <h1>{location.name}</h1>
      <TextField label="Address" value={location.address ?? ''} onSave={(v) => updateField('address', v)} />
      <TextField label="Map link" value={location.map_link ?? ''} onSave={(v) => updateField('map_link', v)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 10 }}>
        <NumberField label="Asking rent (₹/month)" value={location.asking_rent_monthly} onSave={(v) => updateField('asking_rent_monthly', v)} />
        <NumberField label="Security deposit (₹)" value={location.security_deposit} onSave={(v) => updateField('security_deposit', v)} />
        <NumberField label="Lock-in (months)" value={location.lock_in_months} onSave={(v) => updateField('lock_in_months', v)} />
        <NumberField label="Area (sq ft)" value={location.area_sqft} onSave={(v) => updateField('area_sqft', v)} />
        <NumberField label="Frontage (ft)" value={location.frontage_ft} onSave={(v) => updateField('frontage_ft', v)} />
        <NumberField label="Seating capacity" value={location.seating_capacity} onSave={(v) => updateField('seating_capacity', v)} />
      </div>
      <TextField label="Escalation terms" value={location.escalation_terms ?? ''} onSave={(v) => updateField('escalation_terms', v)} multiline />
      <TextField label="Ventilation / exhaust notes" value={location.ventilation_notes ?? ''} onSave={(v) => updateField('ventilation_notes', v)} multiline />
      <TextField label="Parking / pedestrian access notes" value={location.parking_notes ?? ''} onSave={(v) => updateField('parking_notes', v)} multiline />

      <label style={{ display: 'block', margin: '12px 0', fontSize: '0.85rem' }}>
        Status:{' '}
        <select value={location.status} onChange={(e) => updateField('status', e.target.value)}>
          <option value="CANDIDATE">Candidate</option>
          <option value="SHORTLISTED">Shortlisted</option>
          <option value="REJECTED">Rejected</option>
          <option value="SELECTED">Selected</option>
        </select>
      </label>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Ground-survey footfall log</h2>
        <p style={{ fontSize: '0.8rem', color: '#666' }}>
          Record a timed, dated observation for weekday morning, lunch, evening and weekend as relevant to
          this site's target customers. Counts are USER-REPORTED by default — only mark VERIFIED if you have
          corroborating evidence (e.g. a second observer, photo/video timestamp).
        </p>
        <FootfallForm locationId={location.id} onAdded={load} />
        <table style={{ width: '100%', fontSize: '0.82rem', marginTop: 10, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>Date</th><th>Slot</th><th>Duration</th><th>Potential customers</th><th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {observations.map((o) => (
              <tr key={o.id} style={{ borderBottom: '1px solid #f3f3f3' }}>
                <td>{o.observed_date} ({o.day_of_week})</td>
                <td>{o.time_slot}</td>
                <td>{o.duration_minutes} min</td>
                <td>{o.potential_customer_count ?? '—'}</td>
                <td><EvidenceBadge confidence={o.confidence} /></td>
              </tr>
            ))}
            {observations.length === 0 && (
              <tr><td colSpan={5} style={{ color: '#999', padding: '8px 0' }}>No observations logged yet — this site has zero validated footfall evidence.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Weighted comparison score</h2>
        <p style={{ fontSize: '0.8rem', color: '#b45309', fontWeight: 600 }}>{scoreSummary.warning}</p>
        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>
          {scoreSummary.weightedScore !== null ? scoreSummary.weightedScore.toFixed(1) + ' / 10' : 'Not scored yet'}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#666' }}>
          Scoring completeness: {(scoreSummary.completeness * 100).toFixed(0)}%
          {scoreSummary.missingCriteria.length > 0 && ` — missing: ${scoreSummary.missingCriteria.join(', ')}`}
        </div>
        <ScoreEntry locationId={location.id} businessId={business!.id} criteria={criteria} scores={scores} onChange={load} />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.05rem' }}>Evidence (photos, quotations, landlord documents)</h2>
        <EvidenceUploadForm businessId={business!.id} relatedId={location.id} onUploaded={load} />
        <ul>
          {evidenceFiles.map((f) => (
            <li key={f.id} style={{ fontSize: '0.85rem' }}>
              {f.file_name} <EvidenceBadge confidence={f.evidence_confidence} /> — {f.description || 'no description'}
            </li>
          ))}
          {evidenceFiles.length === 0 && <li style={{ color: '#999' }}>No evidence files uploaded yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function TextField({ label, value, onSave, multiline }: { label: string; value: string; onSave: (v: string) => void; multiline?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const Comp = multiline ? 'textarea' : 'input';
  return (
    <label style={{ display: 'block', margin: '10px 0', fontSize: '0.85rem' }}>
      {label}
      <Comp
        value={v}
        onChange={(e) => setV((e.target as HTMLInputElement).value)}
        onBlur={() => v !== value && onSave(v)}
        style={{ display: 'block', width: '100%', marginTop: 4 }}
        rows={multiline ? 3 : undefined}
      />
    </label>
  );
}

function NumberField({ label, value, onSave }: { label: string; value: number | null; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(value?.toString() ?? '');
  useEffect(() => setV(value?.toString() ?? ''), [value]);
  return (
    <label style={{ display: 'block', fontSize: '0.85rem' }}>
      {label}
      <input
        type="number"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = v === '' ? null : Number(v);
          if (n !== value) onSave(n);
        }}
        style={{ display: 'block', width: '100%', marginTop: 4 }}
      />
    </label>
  );
}

function FootfallForm({ locationId, onAdded }: { locationId: string; onAdded: () => void }) {
  const [form, setForm] = useState({
    observed_date: new Date().toISOString().slice(0, 10),
    day_of_week: DAYS[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1],
    time_slot: TIME_SLOTS[0],
    duration_minutes: 30,
    potential_customer_count: '',
    observer_name: ''
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.observer_name.trim()) return alert('Observer name is required — this is a real field observation, not an estimate.');
    await supabase.from('location_footfall_observations').insert({
      location_id: locationId,
      observed_date: form.observed_date,
      day_of_week: form.day_of_week,
      time_slot: form.time_slot,
      duration_minutes: form.duration_minutes,
      potential_customer_count: form.potential_customer_count === '' ? null : Number(form.potential_customer_count),
      observer_name: form.observer_name,
      confidence: 'USER_REPORTED'
    });
    onAdded();
  };

  return (
    <form onSubmit={(e) => void submit(e)} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, fontSize: '0.82rem' }}>
      <input type="date" value={form.observed_date} onChange={(e) => setForm({ ...form, observed_date: e.target.value })} />
      <select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
        {DAYS.map((d) => <option key={d}>{d}</option>)}
      </select>
      <select value={form.time_slot} onChange={(e) => setForm({ ...form, time_slot: e.target.value })}>
        {TIME_SLOTS.map((t) => <option key={t}>{t}</option>)}
      </select>
      <input type="number" placeholder="Duration (min)" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} />
      <input type="number" placeholder="Potential customers seen" value={form.potential_customer_count} onChange={(e) => setForm({ ...form, potential_customer_count: e.target.value })} />
      <input placeholder="Observer name" value={form.observer_name} onChange={(e) => setForm({ ...form, observer_name: e.target.value })} />
      <button type="submit">Log observation</button>
    </form>
  );
}

function ScoreEntry({ locationId, businessId, criteria, scores, onChange }: {
  locationId: string; businessId: string; criteria: LocationScoringCriterion[]; scores: LocationScore[]; onChange: () => void;
}) {
  const [newCriterion, setNewCriterion] = useState('');

  const addCriterion = async () => {
    if (!newCriterion.trim()) return;
    await supabase.from('location_scoring_criteria').insert({ business_id: businessId, criterion: newCriterion.trim(), weight: 1 });
    setNewCriterion('');
    onChange();
  };

  const setScore = async (criterionId: string, score: number) => {
    const existing = scores.find((s) => s.criterion_id === criterionId);
    if (existing) {
      await supabase.from('location_scores').update({ score }).eq('id', existing.id);
    } else {
      await supabase.from('location_scores').insert({ location_id: locationId, criterion_id: criterionId, score, evidence_confidence: 'USER_REPORTED' });
    }
    onChange();
  };

  return (
    <div style={{ marginTop: 10 }}>
      {criteria.map((c) => {
        const current = scores.find((s) => s.criterion_id === c.id)?.score ?? '';
        return (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: '0.85rem' }}>
            <span style={{ flex: 1 }}>{c.criterion} (weight {c.weight})</span>
            <input
              type="number" min={0} max={10} step={0.5} placeholder="0-10"
              defaultValue={current}
              onBlur={(e) => e.target.value !== '' && void setScore(c.id, Number(e.target.value))}
              style={{ width: 70 }}
            />
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input placeholder="Add a scoring criterion (e.g. Visibility)" value={newCriterion} onChange={(e) => setNewCriterion(e.target.value)} style={{ flex: 1, fontSize: '0.82rem' }} />
        <button onClick={() => void addCriterion()} type="button">Add criterion</button>
      </div>
    </div>
  );
}

function EvidenceUploadForm({ businessId, relatedId, onUploaded }: { businessId: string; relatedId: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [desc, setDesc] = useState('');

  const handleFile = async (file: File) => {
    setBusy(true);
    const { error } = await uploadEvidence({ businessId, relatedTable: 'locations', relatedId, file, description: desc, confidence: 'USER_REPORTED' });
    setBusy(false);
    if (error) alert('Upload failed: ' + error);
    else { setDesc(''); onUploaded(); }
  };

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem' }}>
      <input placeholder="What is this file? (e.g. landlord quotation, 14 Oct 2026)" value={desc} onChange={(e) => setDesc(e.target.value)} style={{ flex: 1 }} />
      <input type="file" disabled={busy} onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
    </div>
  );
}
