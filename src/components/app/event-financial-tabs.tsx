"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  createBudgetItem,
  createRevenueItem,
  createTicketTier,
  deleteBudgetItem,
  deleteRevenueItem,
  deleteTicketTier,
  updateBudgetItemsBatch,
  updateBudgetItem,
  updateRevenueItem,
  updateSettlement,
  updateTicketTier,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money, titleize } from "@/lib/format";
import type { BudgetItem, ContactOption, RevenueItem, Settlement, TicketTier } from "@/lib/types";

type Props = {
  activeTab: string;
  eventId: string;
  budgetItems: BudgetItem[];
  revenueItems: RevenueItem[];
  ticketTiers: TicketTier[];
  settlement: Settlement | null;
  contacts: ContactOption[];
};

const hardCategories = [
  "Talent",
  "Headliner Guarantee",
  "Support Act",
  "Production",
  "Production Labor",
  "Backline",
  "Operations",
  "Insurance",
  "Permits",
  "Staffing",
  "Security",
  "Crowd Control",
];

const softCategories = [
  "Marketing",
  "Social Media Ads",
  "Graphic Design",
  "Print Posters",
  "Radio/PR",
  "Hospitality",
  "Hotel",
  "Meals",
  "Green Room Rider",
  "Ground Transportation",
  "Runner",
  "Miscellaneous",
  "Contingency",
];

const costStatuses = ["planned", "quoted", "approved", "due", "paid", "cancelled"] as const;
const revenueSources = ["ticket", "sponsorship", "bar_bounty", "merch_split", "other"] as const;
const revenueStatuses = ["projected", "confirmed", "received"] as const;
const splitTypes = ["true_50_50", "sweat_equity", "siloed_revenue_streams", "custom"] as const;

type BudgetDraft = {
  id: string;
  cost_type: "hard" | "soft";
  category: string;
  description: string;
  estimated_amount: string;
  actual_amount: string;
  status: BudgetItem["status"];
  vendor_contact_id: string;
  due_date: string;
  paid_date: string;
  notes: string;
};

export function EventFinancialTabs(props: Props) {
  const router = useRouter();
  const activeTab = props.activeTab === "revenue" ? "revenue" : "budget";
  const initialBudgetDrafts = useMemo(() => props.budgetItems.map(toBudgetDraft), [props.budgetItems]);
  const budgetSourceKey = useMemo(() => JSON.stringify(initialBudgetDrafts), [initialBudgetDrafts]);
  const [budgetDraftState, setBudgetDraftState] = useState(() => ({
    sourceKey: budgetSourceKey,
    drafts: initialBudgetDrafts,
  }));
  const [batchMessage, setBatchMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isBatchPending, startBatchTransition] = useTransition();
  const budgetDrafts = budgetDraftState.sourceKey === budgetSourceKey ? budgetDraftState.drafts : initialBudgetDrafts;

  const originalBudgetById = useMemo(
    () => new Map(props.budgetItems.map((item) => [item.id, toBudgetComparable(toBudgetDraft(item))])),
    [props.budgetItems],
  );
  const dirtyDrafts = useMemo(
    () => budgetDrafts.filter((draft) => isBudgetDraftDirty(draft, originalBudgetById)),
    [budgetDrafts, originalBudgetById],
  );
  const displayBudgetItems = useMemo(() => budgetDrafts.map(draftToBudgetItem), [budgetDrafts]);
  const totals = calculateFinancialSettlement({
    ...props,
    budgetItems: displayBudgetItems,
  });
  const hardCosts = budgetDrafts.filter((item) => item.cost_type === "hard");
  const softCosts = budgetDrafts.filter((item) => item.cost_type === "soft");
  const dirtyCount = dirtyDrafts.length;

  function updateBudgetDraft(id: string, values: Partial<BudgetDraft>) {
    setBatchMessage(null);
    setBudgetDraftState({
      sourceKey: budgetSourceKey,
      drafts: budgetDrafts.map((draft) => (draft.id === id ? { ...draft, ...values } : draft)),
    });
  }

  function discardBudgetChanges() {
    setBudgetDraftState({
      sourceKey: budgetSourceKey,
      drafts: initialBudgetDrafts,
    });
    setBatchMessage({ type: "success", text: "Discarded unsaved budget changes." });
  }

  function saveBudgetChanges() {
    if (dirtyDrafts.length === 0) return;

    startBatchTransition(async () => {
      const formData = new FormData();
      formData.set("event_id", props.eventId);
      formData.set("rows", JSON.stringify(dirtyDrafts.map(toBudgetPayload)));
      const result = await updateBudgetItemsBatch(formData);

      setBatchMessage({
        type: result.ok ? "success" : "error",
        text: result.message,
      });

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {activeTab === "budget" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <BetaFocusNote text="Budget tracks estimated costs, actual/paid amounts, vendor status, and settlement-ready totals." />
            <BudgetItemForm eventId={props.eventId} contacts={props.contacts} />
            <BudgetBatchToolbar
              dirtyCount={dirtyCount}
              isPending={isBatchPending}
              message={batchMessage}
              onDiscard={discardBudgetChanges}
              onSave={saveBudgetChanges}
            />
            <BudgetList
              title="Hard Costs"
              eventId={props.eventId}
              items={hardCosts}
              contacts={props.contacts}
              dirtyIds={new Set(dirtyDrafts.map((draft) => draft.id))}
              hasUnsavedChanges={dirtyCount > 0}
              onChange={updateBudgetDraft}
            />
            <BudgetList
              title="Soft Costs"
              eventId={props.eventId}
              items={softCosts}
              contacts={props.contacts}
              dirtyIds={new Set(dirtyDrafts.map((draft) => draft.id))}
              hasUnsavedChanges={dirtyCount > 0}
              onChange={updateBudgetDraft}
            />
          </div>
          <CostSummary items={displayBudgetItems} />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <BetaFocusNote text="Revenue & Settlement tracks ticket tiers, non-ticket income, projected gross, actual gross, and partner splits." />
            <TicketTierForm eventId={props.eventId} />
            <TicketTierList eventId={props.eventId} ticketTiers={props.ticketTiers} />
            <RevenueItemForm eventId={props.eventId} />
            <RevenueList eventId={props.eventId} revenueItems={props.revenueItems} />
          </div>
          <div className="space-y-4">
            <SettlementCard eventId={props.eventId} totals={totals} settlement={props.settlement} />
          </div>
        </div>
      )}
    </div>
  );
}

function BetaFocusNote({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Beta focus:</span> {text}
    </div>
  );
}

function CostSummary({ items }: { items: BudgetItem[] }) {
  const hardEstimate = sumBudget(items, "hard", "estimated_amount");
  const hardActual = sumBudget(items, "hard", "actual_amount");
  const softEstimate = sumBudget(items, "soft", "estimated_amount");
  const softActual = sumBudget(items, "soft", "actual_amount");
  const totalEstimate = hardEstimate + softEstimate;
  const totalActual = hardActual + softActual;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget totals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <SummaryRow label="Hard estimated" value={money(hardEstimate)} />
        <SummaryRow label="Hard actual / paid" value={money(hardActual)} />
        <SummaryRow label="Soft estimated" value={money(softEstimate)} />
        <SummaryRow label="Soft actual / paid" value={money(softActual)} />
        <div className="my-3 border-t" />
        <SummaryRow label="Total estimated" value={money(totalEstimate)} strong />
        <SummaryRow label="Total actual / paid" value={money(totalActual)} strong />
        <SummaryRow label="Variance to estimate" value={money(totalActual - totalEstimate)} strong />
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Blank actuals count as $0 until an actual or paid amount is entered.
        </p>
      </CardContent>
    </Card>
  );
}

function BudgetItemForm({ eventId, contacts }: { eventId: string; contacts: ContactOption[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add budget item</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={createBudgetItem} className="grid gap-3 md:grid-cols-6">
          <input type="hidden" name="event_id" value={eventId} />
          <Field label="Cost type">
            <Select name="cost_type" defaultValue="hard">
              <option value="hard">Hard</option>
              <option value="soft">Soft</option>
            </Select>
          </Field>
          <Field label="Category">
            <CategorySelect name="category" />
          </Field>
          <Field label="Description" className="md:col-span-2">
            <Input name="description" required />
          </Field>
          <Field label="Estimated">
            <Input name="estimated_amount" type="number" min="0" step="0.01" defaultValue="0" required />
          </Field>
          <Field label="Actual / paid">
            <Input name="actual_amount" type="number" min="0" step="0.01" placeholder="Blank until known" />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue="planned">
              {costStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
            </Select>
          </Field>
          <Field label="Vendor/contact">
            <ContactSelect contacts={contacts} />
          </Field>
          <Field label="Due date">
            <Input name="due_date" type="date" />
          </Field>
          <Field label="Paid date">
            <Input name="paid_date" type="date" />
          </Field>
          <Field label="Notes" className="md:col-span-2">
            <Input name="notes" />
          </Field>
          <div className="flex items-end">
            <Button type="submit">Add item</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function BudgetList({
  title,
  eventId,
  items,
  contacts,
  dirtyIds,
  hasUnsavedChanges,
  onChange,
}: {
  title: string;
  eventId: string;
  items: BudgetDraft[];
  contacts: ContactOption[];
  dirtyIds: Set<string>;
  hasUnsavedChanges: boolean;
  onChange: (id: string, values: Partial<BudgetDraft>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{items.length} {items.length === 1 ? "line item" : "line items"}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No budget items yet.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <form action={updateBudgetItem} className="grid gap-3 md:grid-cols-6">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="event_id" value={eventId} />
                <Field label="Cost type">
                  <Select
                    name="cost_type"
                    value={item.cost_type}
                    onChange={(event) => onChange(item.id, { cost_type: event.target.value as BudgetDraft["cost_type"] })}
                  >
                    <option value="hard">Hard</option>
                    <option value="soft">Soft</option>
                  </Select>
                </Field>
                <Field label="Category">
                  <CategorySelect
                    name="category"
                    value={item.category}
                    onChange={(event) => onChange(item.id, { category: event.target.value })}
                  />
                </Field>
                <Field label="Description" className="md:col-span-2">
                  <Input
                    name="description"
                    value={item.description}
                    onChange={(event) => onChange(item.id, { description: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Estimated">
                  <Input
                    name="estimated_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.estimated_amount}
                    onChange={(event) => onChange(item.id, { estimated_amount: event.target.value })}
                    required
                  />
                </Field>
                <Field label="Actual / paid">
                  <Input
                    name="actual_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.actual_amount}
                    onChange={(event) => onChange(item.id, { actual_amount: event.target.value })}
                    placeholder="Blank until known"
                  />
                </Field>
                <Field label="Status">
                  <Select
                    name="status"
                    value={item.status}
                    onChange={(event) => onChange(item.id, { status: event.target.value as BudgetDraft["status"] })}
                  >
                    {costStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
                  </Select>
                </Field>
                <Field label="Vendor/contact">
                  <ContactSelect
                    contacts={contacts}
                    value={item.vendor_contact_id}
                    onChange={(event) => onChange(item.id, { vendor_contact_id: event.target.value })}
                  />
                </Field>
                <Field label="Due date">
                  <Input
                    name="due_date"
                    type="date"
                    value={item.due_date}
                    onChange={(event) => onChange(item.id, { due_date: event.target.value })}
                  />
                </Field>
                <Field label="Paid date">
                  <Input
                    name="paid_date"
                    type="date"
                    value={item.paid_date}
                    onChange={(event) => onChange(item.id, { paid_date: event.target.value })}
                  />
                </Field>
                <Field label="Notes" className="md:col-span-2">
                  <Input
                    name="notes"
                    value={item.notes}
                    onChange={(event) => onChange(item.id, { notes: event.target.value })}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Button type="submit" variant="secondary">{dirtyIds.has(item.id) ? "Save row" : "Save"}</Button>
                  <DeleteButton
                    action={deleteBudgetItem}
                    title="Delete budget item?"
                    description={`This will remove "${item.description}" from this event budget. This cannot be undone.`}
                    disabled={hasUnsavedChanges}
                    disabledMessage="Save or discard budget changes before deleting."
                  />
                </div>
              </form>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function BudgetBatchToolbar({
  dirtyCount,
  isPending,
  message,
  onDiscard,
  onSave,
}: {
  dirtyCount: number;
  isPending: boolean;
  message: { type: "success" | "error"; text: string } | null;
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (dirtyCount === 0 && !message) return null;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="text-sm">
          {dirtyCount > 0 ? (
            <span className="font-medium">{dirtyCount} unsaved budget {dirtyCount === 1 ? "change" : "changes"}</span>
          ) : null}
          {message ? (
            <p className={message.type === "error" ? "text-destructive" : "text-muted-foreground"}>
              {message.text}
            </p>
          ) : null}
        </div>
        {dirtyCount > 0 ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onDiscard} disabled={isPending}>
              Discard changes
            </Button>
            <Button type="button" onClick={onSave} disabled={isPending}>
              {isPending ? "Saving..." : "Save all changes"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TicketTierForm({ eventId }: { eventId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add ticket tier</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={createTicketTier} className="grid gap-3 md:grid-cols-6">
          <input type="hidden" name="event_id" value={eventId} />
          <Field label="Name" className="md:col-span-2"><Input name="name" required /></Field>
          <Field label="Unit price"><Input name="price" type="number" min="0" step="0.01" defaultValue="0" required /></Field>
          <Field label="Capacity"><Input name="capacity" type="number" min="0" defaultValue="0" required /></Field>
          <Field label="Sold"><Input name="sold_quantity" type="number" min="0" defaultValue="0" required /></Field>
          <Field label="Comps"><Input name="comp_quantity" type="number" min="0" defaultValue="0" required /></Field>
          <Field label="Notes" className="md:col-span-5"><Input name="notes" /></Field>
          <div className="flex items-end"><Button type="submit">Add tier</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function TicketTierList({ eventId, ticketTiers }: { eventId: string; ticketTiers: TicketTier[] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Ticket tiers</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Projected gross uses price x capacity. Actual gross uses price x sold quantity; comps do not add gross.</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {ticketTiers.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No ticket tiers yet.</p>
        ) : (
          ticketTiers.map((tier) => (
            <div key={tier.id} className="rounded-md border p-3">
              <form action={updateTicketTier} className="grid gap-3 md:grid-cols-6">
                <input type="hidden" name="id" value={tier.id} />
                <input type="hidden" name="event_id" value={eventId} />
                <Field label="Name" className="md:col-span-2"><Input name="name" defaultValue={tier.name} required /></Field>
                <Field label="Unit price"><Input name="price" type="number" min="0" step="0.01" defaultValue={tier.price} required /></Field>
                <Field label="Capacity"><Input name="capacity" type="number" min="0" defaultValue={tier.capacity} required /></Field>
                <Field label="Sold"><Input name="sold_quantity" type="number" min="0" defaultValue={tier.sold_quantity} required /></Field>
                <Field label="Comps"><Input name="comp_quantity" type="number" min="0" defaultValue={tier.comp_quantity} required /></Field>
                <Field label="Projected gross"><ReadOnlyMetric value={money(tier.projected_gross)} /></Field>
                <Field label="Actual gross"><ReadOnlyMetric value={money(tier.generated_gross)} /></Field>
                <Field label="Notes" className="md:col-span-3"><Input name="notes" defaultValue={tier.notes ?? ""} /></Field>
                <div className="flex items-end gap-2">
                  <Button type="submit" variant="secondary">Save</Button>
                  <DeleteButton
                    action={deleteTicketTier}
                    title="Delete ticket tier?"
                    description={`This will remove "${tier.name}" from this event's ticket tiers. This cannot be undone.`}
                  />
                </div>
              </form>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RevenueItemForm({ eventId }: { eventId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add revenue item</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={createRevenueItem} className="grid gap-3 md:grid-cols-6">
          <input type="hidden" name="event_id" value={eventId} />
          <Field label="Type">
            <Select name="source" defaultValue="other">
              {revenueSources.map((source) => <option key={source} value={source}>{titleize(source)}</option>)}
            </Select>
          </Field>
          <Field label="Description" className="md:col-span-2"><Input name="description" required /></Field>
          <Field label="Projected"><Input name="projected_amount" type="number" min="0" step="0.01" defaultValue="0" required /></Field>
          <Field label="Actual / received"><Input name="actual_amount" type="number" min="0" step="0.01" placeholder="Blank until known" /></Field>
          <Field label="Status">
            <Select name="status" defaultValue="projected">
              {revenueStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
            </Select>
          </Field>
          <Field label="Notes" className="md:col-span-5"><Input name="notes" /></Field>
          <div className="flex items-end"><Button type="submit">Add revenue</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}

function RevenueList({ eventId, revenueItems }: { eventId: string; revenueItems: RevenueItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {revenueItems.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No revenue items yet.</p>
        ) : (
          revenueItems.map((item) => (
            <div key={item.id} className="rounded-md border p-3">
              <form action={updateRevenueItem} className="grid gap-3 md:grid-cols-6">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="event_id" value={eventId} />
                <Field label="Type">
                  <Select name="source" defaultValue={item.source}>
                    {revenueSources.map((source) => <option key={source} value={source}>{titleize(source)}</option>)}
                  </Select>
                </Field>
                <Field label="Description" className="md:col-span-2"><Input name="description" defaultValue={item.description} required /></Field>
                <Field label="Projected"><Input name="projected_amount" type="number" min="0" step="0.01" defaultValue={item.projected_amount} required /></Field>
                <Field label="Actual / received"><Input name="actual_amount" type="number" min="0" step="0.01" defaultValue={item.actual_amount ?? ""} placeholder="Blank until known" /></Field>
                <Field label="Status">
                  <Select name="status" defaultValue={item.status}>
                    {revenueStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
                  </Select>
                </Field>
                <Field label="Notes" className="md:col-span-5"><Input name="notes" defaultValue={item.notes ?? ""} /></Field>
                <div className="flex items-end gap-2">
                  <Button type="submit" variant="secondary">Save</Button>
                  <DeleteButton
                    action={deleteRevenueItem}
                    title="Delete revenue item?"
                    description={`This will remove "${item.description}" from this event revenue. This cannot be undone.`}
                  />
                </div>
              </form>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SettlementCard({
  eventId,
  totals,
  settlement,
}: {
  eventId: string;
  totals: ReturnType<typeof calculateFinancialSettlement>;
  settlement: Settlement | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settlement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-3">
          <SummaryRow label="Gross revenue" value={money(totals.grossRevenue)} />
          <SummaryRow label="Total expenses" value={money(totals.totalExpenses)} />
          <SummaryRow label="Net profit/loss" value={money(totals.netProfit)} strong />
          <SummaryRow label="Break-even" value={money(totals.breakEven)} />
          <SummaryRow label={cleanPartnerName(settlement?.partner_a_name) ?? "Partner A"} value={money(totals.partnerAAmount)} />
          <SummaryRow label={cleanPartnerName(settlement?.partner_b_name) ?? "Partner B"} value={money(totals.partnerBAmount)} />
        </div>
        <p className="text-xs text-muted-foreground">
          Partner split amounts are calculated from net profit/loss after total expenses.
        </p>
        <form action={updateSettlement} className="space-y-3 border-t pt-4">
          <input type="hidden" name="event_id" value={eventId} />
          <Field label="Partner split model">
            <Select name="partner_split_type" defaultValue={settlement?.partner_split_type ?? "true_50_50"}>
              {splitTypes.map((type) => <option key={type} value={type}>{titleize(type)}</option>)}
            </Select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Partner A"><Input name="partner_a_name" defaultValue={cleanPartnerName(settlement?.partner_a_name) ?? ""} /></Field>
            <Field label="Partner B"><Input name="partner_b_name" defaultValue={settlement?.partner_b_name ?? ""} /></Field>
            <Field label="Partner A %"><Input name="partner_a_percent" type="number" min="0" max="100" step="0.01" defaultValue={settlement?.partner_a_percent ?? 50} /></Field>
            <Field label="Partner B %"><Input name="partner_b_percent" type="number" min="0" max="100" step="0.01" defaultValue={settlement?.partner_b_percent ?? 50} /></Field>
          </div>
          <Field label="Notes">
            <Textarea name="notes" defaultValue={settlement?.notes ?? ""} />
          </Field>
          <Button type="submit" variant="secondary">Save settlement</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CategorySelect({
  name,
  defaultValue,
  ...props
}: Omit<React.ComponentProps<"select">, "defaultValue" | "name"> & {
  name: string;
  defaultValue?: string;
}) {
  const options = [...hardCategories, ...softCategories];

  return (
    <Select name={name} defaultValue={defaultValue ?? (props.value === undefined ? "Production" : undefined)} {...props}>
      {options.map((category) => <option key={category} value={category}>{category}</option>)}
    </Select>
  );
}

function ContactSelect({
  contacts,
  defaultValue,
  ...props
}: Omit<React.ComponentProps<"select">, "defaultValue" | "name"> & {
  contacts: ContactOption[];
  defaultValue?: string | null;
}) {
  return (
    <Select name="vendor_contact_id" defaultValue={defaultValue ?? (props.value === undefined ? "" : undefined)} {...props}>
      <option value="">None</option>
      {contacts.map((contact) => (
        <option key={contact.id} value={contact.id}>
          {contact.name}{contact.company ? `, ${contact.company}` : ""}
        </option>
      ))}
    </Select>
  );
}

function DeleteButton({
  action,
  title,
  description,
  disabled = false,
  disabledMessage,
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  description: string;
  disabled?: boolean;
  disabledMessage?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        disabled={disabled}
        title={disabled ? disabledMessage : undefined}
        onClick={() => setIsOpen(true)}
      >
        Delete
      </Button>
      {disabled && disabledMessage ? (
        <p className="self-end text-xs text-muted-foreground">{disabledMessage}</p>
      ) : null}
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div
            aria-modal="true"
            className="w-full max-w-md rounded-md border bg-background p-5 shadow-lg"
            role="dialog"
          >
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <DeleteConfirmButton action={action} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DeleteConfirmButton({ action }: { action: (formData: FormData) => Promise<void> }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" formAction={action} variant="destructive" disabled={pending}>
      {pending ? "Deleting..." : "Delete"}
    </Button>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={`h-9 w-full rounded-md border bg-background px-3 text-sm ${className ?? ""}`}
      {...props}
    />
  );
}

function ReadOnlyMetric({ value }: { value: string }) {
  return (
    <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 font-mono text-sm">
      {value}
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-mono text-base font-semibold text-foreground" : "font-mono text-foreground"}>{value}</span>
    </div>
  );
}

function cleanPartnerName(value: string | null | undefined) {
  if (!value) return null;
  return value === "Production Company" ? "Juniper Berry Production Company" : value;
}

function sumBudget(items: BudgetItem[], costType: "hard" | "soft", key: "estimated_amount" | "actual_amount") {
  return items
    .filter((item) => item.cost_type === costType)
    .reduce((sum, item) => sum + Number(item[key] ?? 0), 0);
}

function toBudgetDraft(item: BudgetItem): BudgetDraft {
  return {
    id: item.id,
    cost_type: item.cost_type,
    category: item.category,
    description: item.description,
    estimated_amount: String(item.estimated_amount ?? 0),
    actual_amount: item.actual_amount === null || item.actual_amount === undefined ? "" : String(item.actual_amount),
    status: item.status,
    vendor_contact_id: item.vendor_contact_id ?? "",
    due_date: item.due_date ?? "",
    paid_date: item.paid_date ?? "",
    notes: item.notes ?? "",
  };
}

function draftToBudgetItem(draft: BudgetDraft): BudgetItem {
  return {
    id: draft.id,
    cost_type: draft.cost_type,
    category: draft.category,
    description: draft.description,
    estimated_amount: Number(draft.estimated_amount || 0),
    actual_amount: draft.actual_amount === "" ? null : Number(draft.actual_amount),
    status: draft.status,
    vendor_contact_id: draft.vendor_contact_id || null,
    due_date: draft.due_date || null,
    paid_date: draft.paid_date || null,
    notes: draft.notes || null,
  };
}

function toBudgetPayload(draft: BudgetDraft) {
  return {
    id: draft.id,
    cost_type: draft.cost_type,
    category: draft.category,
    description: draft.description,
    estimated_amount: draft.estimated_amount,
    actual_amount: draft.actual_amount,
    status: draft.status,
    vendor_contact_id: draft.vendor_contact_id,
    due_date: draft.due_date,
    paid_date: draft.paid_date,
    notes: draft.notes,
  };
}

function toBudgetComparable(draft: BudgetDraft) {
  return JSON.stringify({
    cost_type: draft.cost_type,
    category: draft.category.trim(),
    description: draft.description.trim(),
    estimated_amount: Number(draft.estimated_amount || 0),
    actual_amount: draft.actual_amount === "" ? null : Number(draft.actual_amount),
    status: draft.status,
    vendor_contact_id: draft.vendor_contact_id || null,
    due_date: draft.due_date || null,
    paid_date: draft.paid_date || null,
    notes: draft.notes.trim() || null,
  });
}

function isBudgetDraftDirty(draft: BudgetDraft, originalById: Map<string, string>) {
  return toBudgetComparable(draft) !== originalById.get(draft.id);
}

function calculateFinancialSettlement(input: {
  budgetItems: BudgetItem[];
  revenueItems: RevenueItem[];
  ticketTiers: TicketTier[];
  settlement: Settlement | null;
}) {
  const ticketGross = input.ticketTiers.reduce(
    (sum, tier) => sum + Number(tier.generated_gross || tier.projected_gross || 0),
    0,
  );
  const otherRevenue = input.revenueItems.reduce(
    (sum, item) => sum + Number(item.actual_amount ?? item.projected_amount ?? 0),
    0,
  );
  const totalExpenses = input.budgetItems.reduce(
    (sum, item) => sum + Number(item.actual_amount ?? item.estimated_amount ?? 0),
    0,
  );
  const grossRevenue = ticketGross + otherRevenue;
  const netProfit = grossRevenue - totalExpenses;
  const partnerAPercent = Number(input.settlement?.partner_a_percent ?? 50);
  const partnerBPercent = Number(input.settlement?.partner_b_percent ?? 50);

  return {
    grossRevenue,
    totalExpenses,
    netProfit,
    breakEven: totalExpenses,
    partnerAAmount: netProfit > 0 ? netProfit * (partnerAPercent / 100) : 0,
    partnerBAmount: netProfit > 0 ? netProfit * (partnerBPercent / 100) : 0,
  };
}
