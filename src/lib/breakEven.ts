/**
 * Break-even math for the Financial Feasibility module.
 *
 * Definitions used throughout (stated explicitly because the brief requires
 * operating break-even and cash-flow break-even to never be conflated):
 *
 * - Operating break-even: the sales level at which revenue covers all
 *   monthly OPERATING costs (fixed costs + variable cost per order),
 *   ignoring one-time capital spend and debt principal. This answers
 *   "are we covering this month's running costs?"
 *
 * - Cash-flow break-even: the point at which CUMULATIVE net cash
 *   generated since opening equals the cumulative CAPITAL invested
 *   (deposit, fit-out, equipment, pre-opening costs, etc.) — i.e. when the
 *   family has recovered their investment. This answers "when do we get
 *   our money back?" and requires the capital budget total, not just
 *   monthly costs.
 */

export interface ScenarioInputs {
  fixedCostsMonthly: number;      // rent + salaries + utilities + maintenance + marketing
  avgBill: number;                // average bill per order, all channels blended or per-channel
  avgVariableCostPct: number;     // blended COGS+packaging+channel fees as % of sale price (0-100)
  ordersPerDay: number;
  operatingDaysPerMonth: number;
  ownerCompensationMonthly: number;
  debtRepaymentMonthly: number;
  contingencyPct: number;         // added on top of fixed costs as a buffer (0-100)
}

export interface BreakEvenResult {
  contributionMarginPerOrder: number;      // avgBill * (1 - variableCostPct)
  contributionMarginPct: number;           // as a fraction 0-1
  totalMonthlyFixedCosts: number;          // fixed + owner comp + debt + contingency
  breakEvenOrdersPerDay: number;
  breakEvenMonthlyOrders: number;
  breakEvenMonthlySales: number;
  projectedMonthlyOrders: number;
  projectedMonthlySales: number;
  projectedMonthlyProfit: number;          // can be negative
  marginOfSafetyOrdersPerDay: number;      // projected - break-even, can be negative
  warnings: string[];
}

export function calculateOperatingBreakEven(inputs: ScenarioInputs): BreakEvenResult {
  const warnings: string[] = [];

  if (inputs.avgBill <= 0) warnings.push('Average bill is zero or negative — result is meaningless until a real value is entered.');
  if (inputs.avgVariableCostPct < 0 || inputs.avgVariableCostPct >= 100) {
    warnings.push('Variable cost % should be between 0 and 100 (exclusive of 100). Check menu costing data.');
  }
  if (inputs.operatingDaysPerMonth <= 0 || inputs.operatingDaysPerMonth > 31) {
    warnings.push('Operating days per month looks implausible — expected 1-31.');
  }

  const variableFraction = Math.min(Math.max(inputs.avgVariableCostPct, 0), 99.9) / 100;
  const contributionMarginPerOrder = inputs.avgBill * (1 - variableFraction);
  const contributionMarginPct = inputs.avgBill > 0 ? contributionMarginPerOrder / inputs.avgBill : 0;

  const contingencyAmount = inputs.fixedCostsMonthly * (inputs.contingencyPct / 100);
  const totalMonthlyFixedCosts =
    inputs.fixedCostsMonthly + inputs.ownerCompensationMonthly + inputs.debtRepaymentMonthly + contingencyAmount;

  if (contributionMarginPerOrder <= 0) {
    warnings.push('Contribution margin per order is zero or negative — break-even is impossible at current pricing/costs. Fix pricing or costs before projecting further.');
    return {
      contributionMarginPerOrder,
      contributionMarginPct,
      totalMonthlyFixedCosts,
      breakEvenOrdersPerDay: Infinity,
      breakEvenMonthlyOrders: Infinity,
      breakEvenMonthlySales: Infinity,
      projectedMonthlyOrders: inputs.ordersPerDay * inputs.operatingDaysPerMonth,
      projectedMonthlySales: inputs.avgBill * inputs.ordersPerDay * inputs.operatingDaysPerMonth,
      projectedMonthlyProfit: -totalMonthlyFixedCosts,
      marginOfSafetyOrdersPerDay: -Infinity,
      warnings
    };
  }

  const breakEvenMonthlyOrders = totalMonthlyFixedCosts / contributionMarginPerOrder;
  const breakEvenOrdersPerDay = breakEvenMonthlyOrders / inputs.operatingDaysPerMonth;
  const breakEvenMonthlySales = breakEvenMonthlyOrders * inputs.avgBill;

  const projectedMonthlyOrders = inputs.ordersPerDay * inputs.operatingDaysPerMonth;
  const projectedMonthlySales = projectedMonthlyOrders * inputs.avgBill;
  const projectedMonthlyProfit = projectedMonthlyOrders * contributionMarginPerOrder - totalMonthlyFixedCosts;
  const marginOfSafetyOrdersPerDay = inputs.ordersPerDay - breakEvenOrdersPerDay;

  if (inputs.ordersPerDay > 0 && marginOfSafetyOrdersPerDay < 0) {
    warnings.push('Projected orders/day is below the break-even point at these assumptions.');
  }
  if (breakEvenOrdersPerDay > 0 && inputs.ordersPerDay / breakEvenOrdersPerDay > 3) {
    warnings.push('Projected orders/day is more than 3x the break-even point — treat as optimistic until supported by demand-validation evidence (Module D), not assumed.');
  }

  return {
    contributionMarginPerOrder,
    contributionMarginPct,
    totalMonthlyFixedCosts,
    breakEvenOrdersPerDay,
    breakEvenMonthlyOrders,
    breakEvenMonthlySales,
    projectedMonthlyOrders,
    projectedMonthlySales,
    projectedMonthlyProfit,
    marginOfSafetyOrdersPerDay,
    warnings
  };
}

export interface CashFlowBreakEvenInputs {
  totalCapitalInvested: number;      // sum of capital_budget_items.actual_cost (or estimated_cost if actual not yet known)
  monthlyNetCashFromOperations: number; // projectedMonthlyProfit from calculateOperatingBreakEven, roughly (ignores non-cash items; MVP simplification, noted below)
}

export interface CashFlowBreakEvenResult {
  monthsToRecoverCapital: number; // Infinity if operations never generate positive cash
  note: string;
}

export function calculateCashFlowBreakEven(inputs: CashFlowBreakEvenInputs): CashFlowBreakEvenResult {
  const note =
    'Simplified MVP calculation: treats monthly operating profit as a proxy for net cash generated. ' +
    'It does NOT separately model working-capital timing, GST input/output credit, loan amortization ' +
    'schedules, or depreciation. Do not use this figure alone for a lease or loan decision.';

  if (inputs.monthlyNetCashFromOperations <= 0) {
    return { monthsToRecoverCapital: Infinity, note };
  }
  return {
    monthsToRecoverCapital: inputs.totalCapitalInvested / inputs.monthlyNetCashFromOperations,
    note
  };
}

/**
 * Sensitivity analysis: re-runs the operating break-even calculation under
 * named perturbations. Returns the base case plus each stress case so the
 * UI can show them side by side rather than hiding the downside.
 */
export function runSensitivityAnalysis(base: ScenarioInputs) {
  const cases: { label: string; inputs: ScenarioInputs }[] = [
    { label: 'Base case', inputs: base },
    { label: 'Rent/fixed costs +20%', inputs: { ...base, fixedCostsMonthly: base.fixedCostsMonthly * 1.2 } },
    { label: 'Ingredient cost +15% (variable cost % up)', inputs: { ...base, avgVariableCostPct: Math.min(base.avgVariableCostPct * 1.15, 99) } },
    { label: 'Orders -25%', inputs: { ...base, ordersPerDay: base.ordersPerDay * 0.75 } },
    { label: 'Wastage adds 5pp to variable cost %', inputs: { ...base, avgVariableCostPct: Math.min(base.avgVariableCostPct + 5, 99) } }
  ];
  return cases.map((c) => ({ label: c.label, result: calculateOperatingBreakEven(c.inputs) }));
}
