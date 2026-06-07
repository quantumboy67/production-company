export type EventStatus = "planning" | "confirmed" | "active" | "settled" | "cancelled";
export type ItemStatus = "planned" | "quoted" | "approved" | "due" | "paid" | "cancelled";
export type RevenueStatus = "projected" | "confirmed" | "received";
export type PartnerSplitType = "true_50_50" | "sweat_equity" | "siloed_revenue_streams" | "custom";
export type OrganizationRole = "owner" | "admin" | "producer" | "viewer";
export type OrganizationMemberStatus = "active" | "removed" | "disabled";

export type Profile = {
  id: string;
  organization_id: string | null;
  full_name: string | null;
  email: string | null;
  role: string;
};

export type OrganizationMembership = {
  id: string;
  organization_id: string;
  profile_id: string;
  role: OrganizationRole;
  status: OrganizationMemberStatus;
  must_change_password: boolean;
};

export type EventRecord = {
  id: string;
  organization_id: string;
  venue_id: string | null;
  name: string;
  starts_on: string;
  ends_on: string | null;
  status: EventStatus;
  capacity: number | null;
  notes: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: string | null;
  venues?: { name: string } | null;
};

export type BudgetItem = {
  id: string;
  vendor_contact_id: string | null;
  cost_type: "hard" | "soft";
  category: string;
  description: string;
  estimated_amount: number;
  actual_amount: number | null;
  status: ItemStatus;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: string | null;
  contacts?: { name: string } | null;
};

export type RevenueItem = {
  id: string;
  source: "ticket" | "sponsorship" | "bar_bounty" | "merch_split" | "other";
  description: string;
  projected_amount: number;
  actual_amount: number | null;
  status: RevenueStatus;
  notes: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: string | null;
};

export type TicketTier = {
  id: string;
  name: string;
  price: number;
  capacity: number;
  sold_quantity: number;
  comp_quantity: number;
  generated_gross: number;
  projected_gross: number;
  notes: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
  restored_at: string | null;
  restored_by: string | null;
};

export type Settlement = {
  id: string;
  partner_split_type: PartnerSplitType;
  partner_a_name: string | null;
  partner_b_name: string | null;
  partner_a_percent: number;
  partner_b_percent: number;
  notes: string | null;
};

export type ContactOption = {
  id: string;
  name: string;
  company: string | null;
};

export type EventProfitLoss = {
  projectedRevenue: number;
  estimatedExpenses: number;
  projectedNet: number;
  actualRevenue: number;
  actualExpenses: number;
  actualNet: number;
  missingActualRevenueCount: number;
  missingActualExpenseCount: number;
};

export type DashboardEvent = EventRecord & {
  financials: EventProfitLoss;
};

export type AuditLogRecord = {
  id: string;
  organization_id: string;
  actor_profile_id: string | null;
  actor_auth_user_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  entity_type: string;
  entity_id: string | null;
  action: string;
  summary: string;
  before_data: Record<string, unknown> | Record<string, unknown>[] | null;
  after_data: Record<string, unknown> | Record<string, unknown>[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
