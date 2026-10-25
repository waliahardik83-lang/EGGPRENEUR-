import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import type { ActionItem, CapitalBudgetItem, Location, MenuItem, BusinessStage, LocationScoringCriterion, LocationScore } from '../types/database';
import { calculateLocationScore } from '../lib/locationScoring';

const STAGES: BusinessStage[] = ['IDEA', 'VALIDATION', 'SITE_SELECTION', 'PRE_LAUNCH', 'LAUNCHED', 'OPERATING'];

export function Dashboard() {
  const { business, loading: bizLoading, refresh } = useBusiness();
  const [budgetItems, setBudgetItems] = useState<CapitalBudgetItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [criteria, setCriteria] = useState<LocationScoringCriterion[]>([]);
  const [scores, setScores] = useState<LocationScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    (async () => {
      setLoading(true);
      const [b, l, m, a, c, s] = await Promise.all([
        supabase.from('capital_budget_items').select('*').eq('business_id', business.id),
        supabase.from('locations').select('*').eq('business_id', business.id),
        supabase.from('menu_items').select('*').eq('business_id', business.id),
        supabase.from('actions').select('*').eq('business_id', business.id),
        supabase.from('location_scoring_criteria').select('*').eq('business_id', business.id),
        supabase.from('location_scores').select('*')
      ]);
      setBudgetItems((b.data ?? []) as CapitalBudgetItem[]);
      setLocations((l.data ?? []) as Location[]);
      setMenuItems((m.data ?? []) as MenuItem[]);
      setActions((a.data ?? []) as ActionItem[]);
      setCriteria((c.data ?? []) as LocationScoringCriterion[]);
      setScores((s.data ?? []) as LocationScore[]);
      setLoading(false);
    })();
  }, [business]);

  if (bizLoading || loading || !business) return <p>Loading…</p>;

  const committed = budgetItems.reduce((s, i) => s + (i.status !== 'PLANNED' ? (i.actual_cost ?? i.estimated_cost) : 0), 0);
  const estimatedTotal = budgetItems.reduce((s, i) => s + i.estimated_cost, 0);
  const totalBudget = business.total_startup_budget ?? estimatedTotal;
  const remaining = totalBudget - committed;

  const shortlisted = locations.filter((l) => l.status === 'SHORTLISTED' || l.status === 'SELECTED').length;
  const openActions = actions.filter((a) => a.status === 'OPEN' || a.status === 'IN_PROGRESS');
  const overdueActions = openActions.filter((a) => a.deadline && new Date(a.deadline) < new Date());
  const nextActions = [...openActions]
    .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))
    .slice(0, 5);

  const costedMenuItems = menuItems.filter((m) => m.dine_in_price || m.takeaway_price || m.delivery_price).length;

  // Best-supported candidate location: highest weighted score AMONG locations
  // that also have at least some footfall-observation-backed scoring
  // completeness — a high score with zero evidence behind it is not
  // "best-supported," it's just unscored noise, so it's excluded here.
  const bestLocation = locations
    .map((loc) => ({ loc, summary: calculateLocationScore(criteria, scores.filter((s) => s.location_id === loc.id)) }))
    .filter((x) => x.summary.weightedScore !== null && x.summary.completeness > 0)
    .sort((a, b) => (b.summary.weightedScore! - a.summary.weightedScore!))[0];

  const criticalMissingEvidence: string[] = [];
  if (locations.length === 0) criticalMissingEvidence.push('No candidate locations recorded yet.');
  if (locations.length > 0 && criteria.length === 0) criticalMissingEvidence.push('No location scoring criteria defined yet — comparisons cannot be made.');
  if (menuItems.length > 0 && menuItems.every((m) => !m.dine_in_price && !m.takeaway_price && !m.delivery_price)) {
    criticalMissingEvidence.push('No menu item has a price set yet — break-even inputs cannot be derived from real costing.');
  }
  if (budgetItems.length === 0) criticalMissingEvidence.push('No capital budget line items recorded yet.');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section>
        <h1 style={{ marginBottom: 4 }}>{business.name}</h1>
        <label style={{ fontSize: '0.85rem', color: '#555' }}>
          Business stage:{' '}
          <select
            value={business.stage}
            onChange={async (e) => {
              await supabase.from('businesses').update({ stage: e.target.value }).eq('id', business.id);
              void refresh();
            }}
          >
            {STAGES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </label>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Stat label="Startup budget" value={formatINR(totalBudget)} />
        <Stat label="Committed so far" value={formatINR(committed)} />
        <Stat label="Remaining capital" value={formatINR(remaining)} warn={remaining < 0} />
        <Stat label="Locations tracked" value={`${locations.length} (${shortlisted} shortlisted)`} />
        <Stat label="Menu items costed" value={`${costedMenuItems} / ${menuItems.length}`} />
        <Stat label="Open tasks" value={`${openActions.length}`} warn={overdueActions.length > 0} />
      </section>

      <section>
        <h2 style={{ fontSize: '1.05rem' }}>Best-supported candidate location</h2>
        {bestLocation ? (
          <Link to={`/locations/${bestLocation.loc.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
              <strong>{bestLocation.loc.name}</strong> — {bestLocation.summary.weightedScore!.toFixed(1)} / 10
              <div style={{ fontSize: '0.78rem', color: '#666' }}>
                Scoring {( bestLocation.summary.completeness * 100).toFixed(0)}% complete.
                {bestLocation.summary.missingCriteria.length > 0 && ` Still missing: ${bestLocation.summary.missingCriteria.join(', ')}.`}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: 4 }}>{bestLocation.summary.warning}</div>
            </div>
          </Link>
        ) : (
          <p style={{ color: '#888', fontSize: '0.85rem' }}>
            No location is scored yet. Add candidate sites and weighted-comparison scores on the Locations page.
          </p>
        )}
      </section>

      {criticalMissingEvidence.length > 0 && (
        <section style={{ background: '#fff7ed', border: '1px solid #fde4c0', borderRadius: 8, padding: 12 }}>
          <strong>Critical missing evidence</strong>
          <ul>
            {criticalMissingEvidence.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </section>
      )}

      {overdueActions.length > 0 && (
        <section style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
          <strong style={{ color: '#991b1b' }}>{overdueActions.length} overdue task(s)</strong>
          <ul>
            {overdueActions.map((a) => (
              <li key={a.id}>{a.title} — was due {a.deadline} ({a.responsible_person})</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 style={{ fontSize: '1.05rem' }}>Next 5 actions</h2>
        {nextActions.length === 0 ? (
          <p style={{ color: '#666' }}>No open actions yet. Add tasks from each module as you work through validation and setup.</p>
        ) : (
          <ol>
            {nextActions.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong> — {a.responsible_person}{a.deadline ? `, due ${a.deadline}` : ' (no deadline set)'}
                <div style={{ fontSize: '0.8rem', color: '#666' }}>{a.module} · Success: {a.success_criterion}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section style={{ fontSize: '0.8rem', color: '#777', borderTop: '1px solid #eee', paddingTop: 10 }}>
        Demand validation, licensing/compliance status, and location field-survey completion will appear here
        once those modules are populated with real data. Figures above are computed only from records you
        have entered — nothing here is estimated or invented by the app.
      </section>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, background: warn ? '#fef2f2' : '#fafafa' }}>
      <div style={{ fontSize: '0.75rem', color: '#777' }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: warn ? '#b91c1c' : '#1a1a1a' }}>{value}</div>
    </div>
  );
}

function formatINR(n: number): string {
  if (!isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}
