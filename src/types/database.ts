// Hand-written to match supabase/migrations/0001_mvp_schema.sql.
// These have NOT been generated from a live database and may drift.
// Once you have a real Supabase project, regenerate with:
//   npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/types/database.ts
// and re-apply the hand additions below if you still want them.

export type EvidenceConfidence = 'VERIFIED' | 'USER_REPORTED' | 'ESTIMATED' | 'UNVERIFIED';
export type BusinessStage = 'IDEA' | 'VALIDATION' | 'SITE_SELECTION' | 'PRE_LAUNCH' | 'LAUNCHED' | 'OPERATING';
export type ActionStatus = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
export type ActionPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  city: string;
  state: string;
  stage: BusinessStage;
  target_opening_date: string | null;
  total_startup_budget: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CapitalBudgetItem {
  id: string;
  business_id: string;
  category: string;
  item: string;
  estimated_cost: number;
  actual_cost: number | null;
  status: 'PLANNED' | 'COMMITTED' | 'PAID';
  evidence_confidence: EvidenceConfidence;
  source_notes: string | null;
  quoted_on: string | null;
  created_at: string;
  updated_at: string;
}

export interface DemandGenerator { type: string; name: string; distance_m?: number; notes?: string }
export interface LicensingQuestion { question: string; status: string; answer?: string; confirmed_by?: string; date?: string }

export interface Location {
  id: string;
  business_id: string;
  name: string;
  address: string | null;
  map_link: string | null;
  asking_rent_monthly: number | null;
  security_deposit: number | null;
  escalation_terms: string | null;
  lock_in_months: number | null;
  area_sqft: number | null;
  frontage_ft: number | null;
  visibility_notes: string | null;
  signage_restrictions: string | null;
  ventilation_notes: string | null;
  water_feasible: boolean | null;
  drainage_feasible: boolean | null;
  electricity_load_kw: number | null;
  exhaust_feasible: boolean | null;
  seating_capacity: number | null;
  takeaway_access: boolean | null;
  delivery_access: boolean | null;
  parking_notes: string | null;
  pedestrian_access_notes: string | null;
  road_visibility_notes: string | null;
  demand_generators: DemandGenerator[];
  licensing_questions: LicensingQuestion[];
  status: 'CANDIDATE' | 'SHORTLISTED' | 'REJECTED' | 'SELECTED';
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocationScoringCriterion {
  id: string;
  business_id: string;
  criterion: string;
  weight: number;
  created_at: string;
}

export interface LocationScore {
  id: string;
  location_id: string;
  criterion_id: string;
  score: number;
  evidence_confidence: EvidenceConfidence;
  notes: string | null;
  scored_at: string;
}

export interface FootfallObservation {
  id: string;
  location_id: string;
  observed_date: string;
  day_of_week: string;
  time_slot: string;
  start_time: string | null;
  duration_minutes: number;
  method: string;
  pedestrian_count: number | null;
  vehicle_count: number | null;
  potential_customer_count: number | null;
  observer_name: string;
  weather_notes: string | null;
  notes: string | null;
  confidence: EvidenceConfidence;
  created_at: string;
}

export interface MenuItem {
  id: string;
  business_id: string;
  name: string;
  category: string | null;
  description: string | null;
  portion_size: string | null;
  prep_time_minutes: number | null;
  yield_qty: number;
  wastage_pct: number;
  packaging_cost: number;
  dine_in_price: number | null;
  takeaway_price: number | null;
  delivery_price: number | null;
  tax_pct: number;
  delivery_platform_fee_pct: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MenuItemIngredient {
  id: string;
  menu_item_id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  last_quote_date: string | null;
  supplier_name: string | null;
  evidence_confidence: EvidenceConfidence;
  created_at: string;
  updated_at: string;
}

export interface FinancialScenario {
  id: string;
  business_id: string;
  scenario_name: string;
  fixed_costs_monthly: number;
  avg_bill: number;
  avg_variable_cost_pct: number;
  orders_per_day: number;
  operating_days_per_month: number;
  owner_compensation_monthly: number;
  debt_repayment_monthly: number;
  contingency_pct: number;
  assumptions: Record<string, { value: unknown; confidence: EvidenceConfidence; source?: string }>;
  created_at: string;
}

export interface ActionItem {
  id: string;
  business_id: string;
  module: string;
  title: string;
  description: string | null;
  responsible_person: string;
  deadline: string | null;
  status: ActionStatus;
  priority: ActionPriority;
  estimated_cost: number | null;
  success_criterion: string;
  related_location_id: string | null;
  related_menu_item_id: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface EvidenceFile {
  id: string;
  business_id: string;
  related_table: string;
  related_id: string;
  storage_path: string;
  file_name: string;
  file_type: string | null;
  description: string | null;
  evidence_confidence: EvidenceConfidence;
  observed_date: string | null;
  uploaded_at: string;
}

export interface AiConsultantLog {
  id: string;
  business_id: string;
  asked_by: string;
  question: string;
  retrieved_record_refs: { table: string; id: string }[];
  missing_evidence: string[];
  answer: string;
  model: string;
  created_at: string;
}

export type BusinessRole = 'owner' | 'member';

export interface BusinessMember {
  business_id: string;
  user_id: string;
  role: BusinessRole;
  joined_at: string;
}

export interface PendingInvitation {
  id: string;
  business_id: string;
  email: string;
  invited_by: string;
  created_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
}

export interface Conversation {
  id: string;
  business_id: string;
  title: string;
  created_by: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'sent' | 'error';

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  error_detail: string | null;
  retrieved_record_refs: { table: string; id: string }[];
  missing_evidence: string[];
  model: string | null;
  created_by: string | null;
  created_at: string;
  seq: number;
}

export type DecisionStatus = 'DECIDED' | 'REJECTED' | 'SUPERSEDED';

export interface Decision {
  id: string;
  business_id: string;
  title: string;
  decision: string;
  rationale: string | null;
  alternatives_considered: { option: string; why_rejected: string }[];
  status: DecisionStatus;
  related_location_id: string | null;
  related_menu_item_id: string | null;
  decided_by: string | null;
  decided_at: string;
  superseded_by: string | null;
  created_at: string;
}

// Minimal Supabase Database type (hand-maintained). Using `any` for the
// generic fields keeps this file short; swap for the generated version
// once you have a live project, per the note above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
