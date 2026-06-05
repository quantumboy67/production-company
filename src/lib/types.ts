export type EventStatus = "planning" | "confirmed" | "active" | "settled" | "cancelled";
export type ItemStatus = "planned" | "quoted" | "approved" | "due" | "paid" | "cancelled";
export type RevenueStatus = "projected" | "confirmed" | "received";

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
  venues?: { name: string } | null;
};

export type BudgetItem = {
  id: string;
  cost_type: "hard" | "soft";
  category: string;
  description: string;
  estimated_amount: number;
  actual_amount: number | null;
  status: ItemStatus;
  due_date: string | null;
  paid_date: string | null;
  notes: string | null;
  contacts?: { name: string } | null;
};

export type RevenueItem = {
  id: string;
  source: string;
  description: string;
  projected_amount: number;
  actual_amount: number | null;
  status: RevenueStatus;
  notes: string | null;
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
};

export type Settlement = {
  id: string;
  partner_split_type: "true_50_50" | "sweat_equity" | "siloed_revenue_streams" | "custom";
  partner_a_name: string | null;
  partner_b_name: string | null;
  partner_a_percent: number;
  partner_b_percent: number;
  notes: string | null;
};
