import type { MenuItem, MenuItemIngredient } from '../types/database';

/**
 * Menu costing math. Terms, used consistently to avoid the brief's
 * explicit warning against confusing them:
 *
 * - Ingredient cost: sum of (quantity * unit_cost) for all ingredients in
 *   one portion, grossed up for wastage.
 * - Total variable cost: ingredient cost + packaging cost (+ channel fee
 *   for delivery, since that is a per-order variable cost).
 * - Revenue: the menu price actually charged for a channel.
 * - Contribution per order: revenue minus total variable cost minus tax
 *   remitted (GST is collected from the customer and owed to the
 *   government — it is not the restaurant's revenue).
 * - Contribution margin %: contribution / revenue.
 * - Gross profit and net profit are NOT calculated here — those require
 *   allocating fixed costs and are computed at the business level in
 *   breakEven.ts, not per dish.
 */

export type Channel = 'dine_in' | 'takeaway' | 'delivery';

export interface IngredientCostResult {
  rawIngredientCost: number;
  wastageAdjustedCost: number;
  wastageAmount: number;
}

export function calculateIngredientCost(ingredients: MenuItemIngredient[], yieldQty: number, wastagePct: number): IngredientCostResult {
  const safeYield = yieldQty > 0 ? yieldQty : 1;
  const batchCost = ingredients.reduce((sum, ing) => sum + ing.quantity * ing.unit_cost, 0);
  const rawIngredientCost = batchCost / safeYield; // cost per single portion
  const wastageAmount = rawIngredientCost * (Math.max(wastagePct, 0) / 100);
  return {
    rawIngredientCost,
    wastageAdjustedCost: rawIngredientCost + wastageAmount,
    wastageAmount
  };
}

export interface ChannelEconomics {
  channel: Channel;
  price: number | null;
  totalVariableCost: number | null;
  taxAmount: number | null;
  contribution: number | null;      // null if price not set
  contributionMarginPct: number | null;
  flags: string[];
}

export function calculateChannelEconomics(
  item: MenuItem,
  ingredientResult: IngredientCostResult
): ChannelEconomics[] {
  const channels: { channel: Channel; price: number | null; feePct: number }[] = [
    { channel: 'dine_in', price: item.dine_in_price, feePct: 0 },
    { channel: 'takeaway', price: item.takeaway_price, feePct: 0 },
    { channel: 'delivery', price: item.delivery_price, feePct: item.delivery_platform_fee_pct ?? 0 }
  ];

  return channels.map(({ channel, price, feePct }) => {
    const flags: string[] = [];
    if (price === null || price === undefined) {
      return { channel, price: null, totalVariableCost: null, taxAmount: null, contribution: null, contributionMarginPct: null, flags: ['No price set for this channel yet.'] };
    }

    const platformFeeAmount = price * (feePct / 100);
    const totalVariableCost = ingredientResult.wastageAdjustedCost + (item.packaging_cost ?? 0) + platformFeeAmount;
    const taxAmount = price * ((item.tax_pct ?? 0) / 100);
    const contribution = price - totalVariableCost - taxAmount;
    const contributionMarginPct = price > 0 ? contribution / price : 0;

    if (contributionMarginPct < 0.2) flags.push('Contribution margin below 20% — review pricing or cost.');
    if (contribution <= 0) flags.push('This channel loses money on every order at current price/cost.');
    if ((item.prep_time_minutes ?? 0) > 15) flags.push('Prep time over 15 minutes — check kitchen throughput impact during peak hours.');
    if ((item.wastage_pct ?? 0) > 10) flags.push('Wastage allowance above 10% — verify against measured kitchen data, not a guess.');

    return { channel, price, totalVariableCost, taxAmount, contribution, contributionMarginPct, flags };
  });
}

export interface MenuItemAnalysis {
  item: MenuItem;
  ingredientResult: IngredientCostResult;
  channels: ChannelEconomics[];
  overallFlags: string[];
}

export function analyzeMenuItem(item: MenuItem, ingredients: MenuItemIngredient[]): MenuItemAnalysis {
  const ingredientResult = calculateIngredientCost(ingredients, item.yield_qty, item.wastage_pct);
  const channels = calculateChannelEconomics(item, ingredientResult);
  const overallFlags: string[] = [];

  if (ingredients.length === 0) overallFlags.push('No ingredients recorded yet — cost figures are not real until the recipe is entered.');
  const staleQuotes = ingredients.filter((i) => {
    if (!i.last_quote_date) return true;
    const days = (Date.now() - new Date(i.last_quote_date).getTime()) / 86400000;
    return days > 60;
  });
  if (staleQuotes.length > 0) overallFlags.push(`${staleQuotes.length} ingredient price(s) are unquoted or older than 60 days — reconfirm before relying on this costing.`);

  return { item, ingredientResult, channels, overallFlags };
}
