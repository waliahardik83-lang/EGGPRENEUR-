import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useBusiness } from '../hooks/useBusiness';
import type { FinancialScenario } from '../types/database';
import { calculateOperatingBreakEven, calculateCashFlowBreakEven, runSensitivityAnalysis, type ScenarioInputs } from '../lib/breakEven';

const DEFAULTS: ScenarioInputs = {
  fixedCostsMonthly: 0,
  avgBill: 0,
  avgVariableCostPct: 0,
  ordersPerDay: 0,
  operatingDaysPerMonth: 26,
  ownerCompensationMonthly: 0,
  debtRepaymentMonthly: 0,
  contingencyPct: 10
};

export function BreakEvenCalculator() {
  const { business } = useBusiness();
  const [saved, setSaved] = useState<FinancialScenario[]>([]);
  const [inputs, setInputs] = useState<ScenarioInputs>(DEFAULTS);
  const [totalCapital, setTotalCapital] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    (async () => {
      setLoading(true);
      const [scn, budget] = await Promise.all([
        supabase.from('financial_scenarios').select('*').eq('business_id', business.id).order('created_at', { ascending: false }),
        supabase.from('capital_budget_items').select('estimated_cost,actual_cost').eq('business_id', business.id)
      ]);
      setSaved((scn.data ?? []) as FinancialScenario[]);
      const total = (budget.data ?? []).reduce((s: number, i: { estimated_cost: number; actual_cost: number | null }) => s + (i.actual_cost ?? i.estimated_cost), 0);
      setTotalCapital(total);
      setLoading(false);
    })();
  }, [business]);

  const result = calculateOperatingBreakEven(inputs);
  const cashFlow = calculateCashFlowBreakEven({ totalCapitalInvested: totalCapital, monthlyNetCashFromOperations: result.projectedMonthlyProfit });
  const sensitivity = runSensitivityAnalysis(inputs);

  const saveScenario = async (name: string) => {
    if (!business) return;
    await supabase.from('financial_scenarios').insert({
      business_id: business.id,
      scenario_name: name,
      fixed_costs_monthly: inputs.fixedCostsMonthly,
      avg_bill: inputs.avgBill,
      avg_variable_cost_pct: inputs.avgVariableCostPct,
      orders_per_day: inputs.ordersPerDay,
      operating_days_per_month: inputs.operatingDaysPerMonth,
      owner_compensation_monthly: inputs.ownerCompensationMonthly,
      debt_repayment_monthly: inputs.debtRepaymentMonthly,
      contingency_pct: inputs.contingencyPct
    });
    const { data } = await supabase.from('financial_scenarios').select('*').eq('business_id', business.id).order('created_at', { ascending: false });
    setSaved((data ?? []) as FinancialScenario[]);
  };

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1>Break-even Calculator</h1>
      <p style={{ fontSize: '0.82rem', color: '#666' }}>
        Operating break-even = the monthly sales needed to cover running costs. Cash-flow break-even = when
        accumulated profit repays the ₹{totalCapital.toLocaleString('en-IN')} already entered in your Capital
        Budget. These are different questions — see the note under the cash-flow figure below.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10, margin: '14px 0' }}>
        <Field label="Fixed costs/month ₹" value={inputs.fixedCostsMonthly} onChange={(v) => setInputs({ ...inputs, fixedCostsMonthly: v })} hint="rent+salaries+utilities+maintenance+marketing" />
        <Field label="Average bill ₹" value={inputs.avgBill} onChange={(v) => setInputs({ ...inputs, avgBill: v })} />
        <Field label="Variable cost % of sale" value={inputs.avgVariableCostPct} onChange={(v) => setInputs({ ...inputs, avgVariableCostPct: v })} hint="from Menu Costing, blended across your menu" />
        <Field label="Orders/day (projected)" value={inputs.ordersPerDay} onChange={(v) => setInputs({ ...inputs, ordersPerDay: v })} />
        <Field label="Operating days/month" value={inputs.operatingDaysPerMonth} onChange={(v) => setInputs({ ...inputs, operatingDaysPerMonth: v })} />
        <Field label="Owner compensation/month ₹" value={inputs.ownerCompensationMonthly} onChange={(v) => setInputs({ ...inputs, ownerCompensationMonthly: v })} />
        <Field label="Debt repayment/month ₹" value={inputs.debtRepaymentMonthly} onChange={(v) => setInputs({ ...inputs, debtRepaymentMonthly: v })} />
        <Field label="Contingency %" value={inputs.contingencyPct} onChange={(v) => setInputs({ ...inputs, contingencyPct: v })} />
      </div>

      <section style={{ background: '#fafafa', border: '1px solid #eee', borderRadius: 10, padding: 14 }}>
        <h2 style={{ fontSize: '1rem' }}>Operating break-even — base case</h2>
        <p>Contribution margin: ₹{result.contributionMarginPerOrder.toFixed(2)}/order ({(result.contributionMarginPct * 100).toFixed(1)}%)</p>
        <p>Total monthly fixed costs (incl. owner pay, debt, contingency): ₹{result.totalMonthlyFixedCosts.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
        <p><strong>Break-even: {isFinite(result.breakEvenOrdersPerDay) ? result.breakEvenOrdersPerDay.toFixed(1) : '∞'} orders/day
        (₹{isFinite(result.breakEvenMonthlySales) ? result.breakEvenMonthlySales.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '∞'}/month)</strong></p>
        <p>At your projected {inputs.ordersPerDay}/day: monthly profit ≈ ₹{result.projectedMonthlyProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
        {result.warnings.map((w, i) => <p key={i} style={{ color: '#b45309', fontSize: '0.82rem' }}>⚠ {w}</p>)}
      </section>

      <section style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: '1rem' }}>Cash-flow break-even</h2>
        <p>{isFinite(cashFlow.monthsToRecoverCapital) ? `≈ ${cashFlow.monthsToRecoverCapital.toFixed(1)} months to recover ₹${totalCapital.toLocaleString('en-IN')} invested capital.` : 'Capital is not recovered at these assumptions — monthly operations do not generate positive cash.'}</p>
        <p style={{ fontSize: '0.75rem', color: '#888' }}>{cashFlow.note}</p>
      </section>

      <section style={{ marginTop: 14 }}>
        <h2 style={{ fontSize: '1rem' }}>Sensitivity analysis</h2>
        <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}><th>Scenario</th><th>Break-even orders/day</th><th>Monthly profit</th></tr></thead>
          <tbody>
            {sensitivity.map((s) => (
              <tr key={s.label} style={{ borderBottom: '1px solid #f3f3f3' }}>
                <td>{s.label}</td>
                <td>{isFinite(s.result.breakEvenOrdersPerDay) ? s.result.breakEvenOrdersPerDay.toFixed(1) : '∞'}</td>
                <td style={{ color: s.result.projectedMonthlyProfit < 0 ? '#b91c1c' : '#166534' }}>
                  ₹{s.result.projectedMonthlyProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button onClick={() => void saveScenario('conservative')}>Save as Conservative</button>
        <button onClick={() => void saveScenario('base')}>Save as Base</button>
        <button onClick={() => void saveScenario('optimistic')}>Save as Optimistic</button>
      </div>

      {saved.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: '1rem' }}>Saved scenarios</h2>
          <ul style={{ fontSize: '0.82rem' }}>
            {saved.map((s) => (
              <li key={s.id}>{s.scenario_name} — saved {new Date(s.created_at).toLocaleDateString('en-IN')} — ₹{s.avg_bill}/bill, {s.orders_per_day}/day</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label style={{ display: 'block', fontSize: '0.82rem' }}>
      {label}
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ display: 'block', width: '100%' }} />
      {hint && <span style={{ color: '#999', fontSize: '0.7rem' }}>{hint}</span>}
    </label>
  );
}
