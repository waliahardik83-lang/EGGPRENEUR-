import type { LocationScoringCriterion, LocationScore, EvidenceConfidence } from '../types/database';

/**
 * Weighted location comparison score.
 *
 * IMPORTANT: this produces a single sortable number to help the family
 * compare candidate sites side by side. Per the project brief it must
 * NEVER be presented or used as proof of demand, and a lease must never
 * be recommended on the strength of this score alone. The UI must always
 * render the confidence breakdown and missing-evidence list alongside it.
 */

export interface LocationScoreSummary {
  weightedScore: number | null;   // 0-10 scale, null if no scores entered
  maxPossibleWeight: number;
  scoredWeight: number;
  completeness: number;           // 0-1, fraction of total weight that has been scored
  confidenceBreakdown: Record<EvidenceConfidence, number>; // count of scores at each confidence
  missingCriteria: string[];      // criteria with no score yet
  warning: string;
}

export function calculateLocationScore(
  criteria: LocationScoringCriterion[],
  scores: LocationScore[]
): LocationScoreSummary {
  const maxPossibleWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const scoreByCriterion = new Map(scores.map((s) => [s.criterion_id, s]));

  let weightedSum = 0;
  let scoredWeight = 0;
  const confidenceBreakdown: Record<EvidenceConfidence, number> = {
    VERIFIED: 0, USER_REPORTED: 0, ESTIMATED: 0, UNVERIFIED: 0
  };
  const missingCriteria: string[] = [];

  for (const c of criteria) {
    const s = scoreByCriterion.get(c.id);
    if (!s) {
      missingCriteria.push(c.criterion);
      continue;
    }
    weightedSum += s.score * c.weight;
    scoredWeight += c.weight;
    confidenceBreakdown[s.evidence_confidence] += 1;
  }

  const weightedScore = scoredWeight > 0 ? weightedSum / scoredWeight : null;
  const completeness = maxPossibleWeight > 0 ? scoredWeight / maxPossibleWeight : 0;

  return {
    weightedScore,
    maxPossibleWeight,
    scoredWeight,
    completeness,
    confidenceBreakdown,
    missingCriteria,
    warning:
      'This score compares candidate sites on the criteria you defined. It is NOT a demand ' +
      'forecast and is not sufficient evidence to sign a lease on its own — pair it with completed ' +
      'footfall observations, competitor research and the pre-lease feasibility checklist.'
  };
}
