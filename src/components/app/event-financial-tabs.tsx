"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  archiveBudgetItemDocument,
  createBudgetItem,
  createRevenueItem,
  createTicketTier,
  deleteBudgetItem,
  deleteRevenueItem,
  deleteTicketTier,
  restoreBudgetItemDocument,
  restoreBudgetItem,
  restoreRevenueItem,
  restoreTicketTier,
  updateBudgetItemDocumentStatus,
  updateBudgetItemsBatch,
  updateBudgetItem,
  updateRevenueItem,
  updateSettlement,
  updateTicketTier,
  uploadBudgetItemDocument,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { money, titleize } from "@/lib/format";
import type {
  BudgetItem,
  BudgetItemDocument,
  ContactOption,
  FinancialDocumentStatus,
  FinancialDocumentType,
  RevenueItem,
  Settlement,
  TicketTier,
} from "@/lib/types";

type Props = {
  activeTab: string;
  eventId: string;
  highlightedBudgetItemId: string | null;
  budgetItems: BudgetItem[];
  archivedBudgetItems: BudgetItem[];
  revenueItems: RevenueItem[];
  archivedRevenueItems: RevenueItem[];
  ticketTiers: TicketTier[];
  archivedTicketTiers: TicketTier[];
  settlement: Settlement | null;
  contacts: ContactOption[];
  canEditFinancials: boolean;
  canDeleteFinancials: boolean;
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
const financialDocumentTypes: FinancialDocumentType[] = ["receipt", "invoice", "quote", "w9", "coi", "contract", "other"];
const activeFinancialDocumentStatuses: Exclude<FinancialDocumentStatus, "archived">[] = ["uploaded", "needs_review", "accepted", "rejected"];

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
  const [highlightedBudgetItemId, setHighlightedBudgetItemId] = useState(props.highlightedBudgetItemId);
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
  const budgetDocumentsByItemId = useMemo(
    () => new Map(props.budgetItems.map((item) => [item.id, item.documents ?? []])),
    [props.budgetItems],
  );
  const totals = calculateFinancialSettlement({
    ...props,
    budgetItems: displayBudgetItems,
  });
  const hardCosts = budgetDrafts.filter((item) => item.cost_type === "hard");
  const softCosts = budgetDrafts.filter((item) => item.cost_type === "soft");
  const dirtyCount = dirtyDrafts.length;

  useEffect(() => {
    if (!props.highlightedBudgetItemId) return;

    const timeout = window.setTimeout(() => {
      setHighlightedBudgetItemId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete("highlight_budget_item");
      const query = url.searchParams.toString();
      router.replace(query ? `${url.pathname}?${query}` : url.pathname, { scroll: false });
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [props.highlightedBudgetItemId, router]);

  useEffect(() => {
    if (dirtyCount === 0) return;

    function handleTabClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[data-event-tab-link]");
      if (!link) return;

      const shouldLeave = window.confirm("You have unsaved budget changes. Save or discard them before switching tabs?");
      if (!shouldLeave) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener("click", handleTabClick, true);
    return () => document.removeEventListener("click", handleTabClick, true);
  }, [dirtyCount]);

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
        <div className="grid gap-4 xl:grid-cols-[1fr_340px]" data-testid="budget-tab">
          <div className="space-y-4">
            <BetaFocusNote text="Budget tracks estimated costs, actual/paid amounts, vendor status, and settlement-ready totals." />
            {props.canEditFinancials ? (
              <BudgetItemForm eventId={props.eventId} contacts={props.contacts} />
            ) : (
              <ReadOnlyNotice label="You have view-only access. Budget items are visible, but editing is disabled for your role." />
            )}
            {props.canEditFinancials && !props.canDeleteFinancials ? (
              <PermissionNotice label="Only Admins and Owners can delete financial records." />
            ) : null}
            {props.canEditFinancials ? <BudgetBatchToolbar
              dirtyCount={dirtyCount}
              isPending={isBatchPending}
              message={batchMessage}
              onDiscard={discardBudgetChanges}
              onSave={saveBudgetChanges}
            /> : null}
            <BudgetList
              title="Hard Costs"
              eventId={props.eventId}
              items={hardCosts}
              contacts={props.contacts}
              dirtyIds={new Set(dirtyDrafts.map((draft) => draft.id))}
              highlightedId={highlightedBudgetItemId}
              hasUnsavedChanges={dirtyCount > 0}
              canEdit={props.canEditFinancials}
              canDelete={props.canDeleteFinancials}
              documentsByItemId={budgetDocumentsByItemId}
              onChange={updateBudgetDraft}
            />
            <BudgetList
              title="Soft Costs"
              eventId={props.eventId}
              items={softCosts}
              contacts={props.contacts}
              dirtyIds={new Set(dirtyDrafts.map((draft) => draft.id))}
              highlightedId={highlightedBudgetItemId}
              hasUnsavedChanges={dirtyCount > 0}
              canEdit={props.canEditFinancials}
              canDelete={props.canDeleteFinancials}
              documentsByItemId={budgetDocumentsByItemId}
              onChange={updateBudgetDraft}
            />
            {props.canDeleteFinancials ? (
              <ArchivedBudgetList eventId={props.eventId} items={props.archivedBudgetItems} />
            ) : null}
          </div>
          <CostSummary items={displayBudgetItems} />
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]" data-testid="revenue-tab">
          <div className="space-y-4">
            <BetaFocusNote text="Revenue & Settlement tracks ticket tiers, non-ticket income, projected gross, actual gross, and partner splits." />
            {props.canEditFinancials ? (
              <>
                <TicketTierForm eventId={props.eventId} />
                <RevenueItemForm eventId={props.eventId} />
              </>
            ) : (
              <ReadOnlyNotice label="You have view-only access. Revenue, ticket tiers, and settlement are visible, but editing is disabled for your role." />
            )}
            {props.canEditFinancials && !props.canDeleteFinancials ? (
              <PermissionNotice label="Only Admins and Owners can delete financial records." />
            ) : null}
            <TicketTierList
              eventId={props.eventId}
              ticketTiers={props.ticketTiers}
              canEdit={props.canEditFinancials}
              canDelete={props.canDeleteFinancials}
            />
            <RevenueList
              eventId={props.eventId}
              revenueItems={props.revenueItems}
              canEdit={props.canEditFinancials}
              canDelete={props.canDeleteFinancials}
            />
            {props.canDeleteFinancials ? (
              <ArchivedRevenueList
                eventId={props.eventId}
                revenueItems={props.archivedRevenueItems}
                ticketTiers={props.archivedTicketTiers}
              />
            ) : null}
          </div>
          <div className="space-y-4">
            <SettlementCard eventId={props.eventId} totals={totals} settlement={props.settlement} canEdit={props.canEditFinancials} />
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

function ReadOnlyNotice({ label }: { label: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function PermissionNotice({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
      {label}
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
  highlightedId,
  hasUnsavedChanges,
  canEdit,
  canDelete,
  documentsByItemId,
  onChange,
}: {
  title: string;
  eventId: string;
  items: BudgetDraft[];
  contacts: ContactOption[];
  dirtyIds: Set<string>;
  highlightedId: string | null;
  hasUnsavedChanges: boolean;
  canEdit: boolean;
  canDelete: boolean;
  documentsByItemId: Map<string, BudgetItemDocument[]>;
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
          items.map((item) => {
            const documents = documentsByItemId.get(item.id) ?? [];

            return (
              <div
                key={item.id}
                data-budget-item-id={item.id}
                className={[
                  "rounded-md border p-4 transition-colors",
                  highlightedId === item.id ? "border-primary bg-primary/10" : "bg-card",
                  dirtyIds.has(item.id) ? "ring-1 ring-primary/40" : "",
                ].join(" ")}
              >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <div>
                  <p className="font-medium">{item.description || "Untitled budget item"}</p>
                  <p className="text-xs text-muted-foreground">{item.category} / {titleize(item.status)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md border bg-muted/20 px-2 py-1">Est. {money(Number(item.estimated_amount || 0))}</span>
                  <span className="rounded-md border bg-muted/20 px-2 py-1">
                    Actual {item.actual_amount === "" ? "blank" : money(Number(item.actual_amount || 0))}
                  </span>
                </div>
              </div>
              <form action={updateBudgetItem} className="grid gap-4 md:grid-cols-6">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="event_id" value={eventId} />
                <Field label="Cost type">
                  <Select
                    name="cost_type"
                    value={item.cost_type}
                    disabled={!canEdit}
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
                    disabled={!canEdit}
                    onChange={(event) => onChange(item.id, { category: event.target.value })}
                  />
                </Field>
                <Field label="Description" className="md:col-span-3">
                  <Input
                    name="description"
                    value={item.description}
                    disabled={!canEdit}
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
                    disabled={!canEdit}
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
                    disabled={!canEdit}
                    onChange={(event) => onChange(item.id, { actual_amount: event.target.value })}
                    placeholder="Blank until known"
                  />
                </Field>
                <Field label="Status">
                  <Select
                    name="status"
                    value={item.status}
                    disabled={!canEdit}
                    onChange={(event) => onChange(item.id, { status: event.target.value as BudgetDraft["status"] })}
                  >
                    {costStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
                  </Select>
                </Field>
                <Field label="Vendor/contact">
                  <ContactSelect
                    contacts={contacts}
                    value={item.vendor_contact_id}
                    disabled={!canEdit}
                    onChange={(event) => onChange(item.id, { vendor_contact_id: event.target.value })}
                  />
                </Field>
                <Field label="Due date">
                  <Input
                    name="due_date"
                    type="date"
                    value={item.due_date}
                    disabled={!canEdit}
                    onChange={(event) => onChange(item.id, { due_date: event.target.value })}
                  />
                </Field>
                <Field label="Paid date">
                  <Input
                    name="paid_date"
                    type="date"
                    value={item.paid_date}
                    disabled={!canEdit}
                    onChange={(event) => onChange(item.id, { paid_date: event.target.value })}
                  />
                </Field>
                <Field label="Notes" className="md:col-span-4">
                  <Input
                    name="notes"
                    value={item.notes}
                    disabled={!canEdit}
                    onChange={(event) => onChange(item.id, { notes: event.target.value })}
                  />
                </Field>
                <div className="flex items-end gap-2">
                  {canEdit ? <Button type="submit" variant="secondary">{dirtyIds.has(item.id) ? "Save row" : "Save"}</Button> : null}
                  {canDelete ? (
                    <DeleteButton
                      action={deleteBudgetItem}
                      title="Archive budget item?"
                      description={`This will archive "${item.description}" and remove it from active views. It can be restored by an Admin or Owner.`}
                      disabled={hasUnsavedChanges}
                      disabledMessage="Save or discard budget changes before deleting."
                    />
                  ) : null}
                </div>
              </form>
              <BudgetItemDocuments
                eventId={eventId}
                budgetItem={item}
                documents={documents}
                canEdit={canEdit}
                canDelete={canDelete}
                hasUnsavedChanges={hasUnsavedChanges}
              />
            </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function BudgetItemDocuments({
  eventId,
  budgetItem,
  documents,
  canEdit,
  canDelete,
  hasUnsavedChanges,
}: {
  eventId: string;
  budgetItem: BudgetDraft;
  documents: BudgetItemDocument[];
  canEdit: boolean;
  canDelete: boolean;
  hasUnsavedChanges: boolean;
}) {
  const activeDocuments = documents.filter((document) => !document.deleted_at);
  const archivedDocuments = documents.filter((document) => document.deleted_at);
  const warnings = getDocumentWarnings(budgetItem, activeDocuments);

  return (
    <div className="mt-4 space-y-3 border-t pt-3" data-testid={`budget-documents-${budgetItem.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Receipts & invoices</p>
          <p className="text-xs text-muted-foreground">{activeDocuments.length} active {activeDocuments.length === 1 ? "document" : "documents"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {activeDocuments.length === 0 ? (
            <DocumentBadge label="No document" tone="muted" />
          ) : (
            activeDocuments.slice(0, 3).map((document) => (
              <DocumentBadge key={document.id} label={`${formatDocumentType(document.document_type)}: ${titleize(document.document_status)}`} tone={document.document_status === "accepted" ? "ok" : document.document_status === "rejected" ? "danger" : "warn"} />
            ))
          )}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="space-y-1 rounded-md border border-primary/20 bg-primary/5 p-2 text-xs text-muted-foreground">
          {warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}

      {canEdit ? (
        <form action={uploadBudgetItemDocument} className="grid gap-2 rounded-md border bg-muted/10 p-3 md:grid-cols-6" encType="multipart/form-data">
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="budget_item_id" value={budgetItem.id} />
          <Field label="Type">
            <Select name="document_type" defaultValue="receipt" data-testid={`budget-document-type-${budgetItem.id}`}>
              {financialDocumentTypes.map((type) => <option key={type} value={type}>{formatDocumentType(type)}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="document_status" defaultValue="uploaded">
              {activeFinancialDocumentStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
            </Select>
          </Field>
          <Field label="File" className="md:col-span-2">
            <Input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,application/pdf,image/png,image/jpeg,image/webp,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required data-testid={`budget-document-file-${budgetItem.id}`} />
          </Field>
          <Field label="Notes" className="md:col-span-1">
            <Input name="notes" placeholder="Optional" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={hasUnsavedChanges} title={hasUnsavedChanges ? "Save or discard budget changes before uploading." : undefined} data-testid={`budget-document-upload-${budgetItem.id}`}>
              Upload
            </Button>
          </div>
        </form>
      ) : null}

      {activeDocuments.length > 0 ? (
        <div className="space-y-2">
          {activeDocuments.map((document) => (
            <DocumentRow
              key={document.id}
              eventId={eventId}
              document={document}
              canEdit={canEdit}
              canDelete={canDelete}
              disabled={hasUnsavedChanges}
            />
          ))}
        </div>
      ) : null}

      {canDelete && archivedDocuments.length > 0 ? (
        <details className="rounded-md border bg-muted/10 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Archived documents ({archivedDocuments.length})</summary>
          <div className="mt-3 space-y-2">
            {archivedDocuments.map((document) => (
              <ArchivedDocumentRow key={document.id} eventId={eventId} document={document} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function DocumentRow({
  eventId,
  document,
  canEdit,
  canDelete,
  disabled,
}: {
  eventId: string;
  document: BudgetItemDocument;
  canEdit: boolean;
  canDelete: boolean;
  disabled: boolean;
}) {
  return (
    <div className="grid gap-2 rounded-md border bg-background p-3 text-sm lg:grid-cols-[1fr_280px_auto]">
      <div>
        <a className="font-medium underline-offset-4 hover:underline" href={`/dashboard/documents/${document.id}/download`}>
          {document.file_name}
        </a>
        <p className="text-xs text-muted-foreground">
          {formatDocumentType(document.document_type)} / {titleize(document.document_status)} / {formatFileSize(document.file_size)}
        </p>
        {document.notes ? <p className="mt-1 text-xs text-muted-foreground">{document.notes}</p> : null}
      </div>
      {canEdit ? (
        <form action={updateBudgetItemDocumentStatus} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="id" value={document.id} />
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="budget_item_id" value={document.budget_item_id} />
          <Select name="document_status" defaultValue={document.document_status === "archived" ? "needs_review" : document.document_status} disabled={disabled} aria-label={`Status for ${document.file_name}`}>
            {activeFinancialDocumentStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
          </Select>
          <Input name="notes" defaultValue={document.notes ?? ""} disabled={disabled} aria-label={`Notes for ${document.file_name}`} />
          <Button type="submit" size="sm" variant="secondary" disabled={disabled}>Save</Button>
        </form>
      ) : null}
      {canDelete ? (
        <DocumentArchiveButton document={document} eventId={eventId} disabled={disabled} />
      ) : null}
    </div>
  );
}

function ArchivedDocumentRow({ eventId, document }: { eventId: string; document: BudgetItemDocument }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background p-3">
      <div>
        <p className="font-medium">{document.file_name}</p>
        <p className="text-xs text-muted-foreground">
          {formatDocumentType(document.document_type)} / Archived / {formatFileSize(document.file_size)}
        </p>
        {document.delete_reason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {document.delete_reason}</p> : null}
      </div>
      <form action={restoreBudgetItemDocument}>
        <input type="hidden" name="id" value={document.id} />
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="budget_item_id" value={document.budget_item_id} />
        <Button type="submit" variant="outline" size="sm" data-testid={`restore-financial-document-${document.id}`}>
          Restore
        </Button>
      </form>
    </div>
  );
}

function DocumentArchiveButton({
  document,
  eventId,
  disabled,
}: {
  document: BudgetItemDocument;
  eventId: string;
  disabled: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex items-start justify-end">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={disabled}
        title={disabled ? "Save or discard budget changes before archiving documents." : undefined}
        onClick={() => setIsOpen(true)}
        data-testid={`archive-financial-document-open-${document.id}`}
      >
        Archive
      </Button>
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <form
            action={archiveBudgetItemDocument}
            aria-modal="true"
            className="w-full max-w-md rounded-md border bg-background p-5 shadow-lg"
            role="dialog"
            data-testid="financial-document-archive-dialog"
          >
            <input type="hidden" name="id" value={document.id} />
            <input type="hidden" name="event_id" value={eventId} />
            <input type="hidden" name="budget_item_id" value={document.budget_item_id} />
            <input type="hidden" name="confirm_intent" value="archive" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">Archive document?</h2>
              <p className="text-sm text-muted-foreground">This will archive &quot;{document.file_name}&quot; and remove it from active budget document views.</p>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Reason optional</span>
                <textarea
                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  name="delete_reason"
                  placeholder="Why is this document being archived?"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} data-testid={`archive-financial-document-cancel-${document.id}`}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" data-testid={`archive-financial-document-confirm-${document.id}`}>
                Archive
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function DocumentBadge({ label, tone }: { label: string; tone: "muted" | "warn" | "ok" | "danger" }) {
  const classes: Record<typeof tone, string> = {
    muted: "border bg-muted/20 text-muted-foreground",
    warn: "border border-primary/30 bg-primary/5 text-foreground",
    ok: "border border-green-700/30 bg-green-700/10 text-foreground",
    danger: "border border-destructive/30 bg-destructive/10 text-foreground",
  };

  return <span className={`rounded-md px-2 py-1 text-xs ${classes[tone]}`}>{label}</span>;
}

function getDocumentWarnings(item: BudgetDraft, documents: BudgetItemDocument[]) {
  const actualAmount = Number(item.actual_amount || 0);
  const isPaidOrActual = item.status === "paid" || actualAmount > 0;
  const hasReceiptOrInvoice = documents.some((document) => document.document_type === "receipt" || document.document_type === "invoice");
  const hasInvoice = documents.some((document) => document.document_type === "invoice");
  const hasAcceptedInvoice = documents.some((document) => document.document_type === "invoice" && document.document_status === "accepted");
  const hasNeedsReview = documents.some((document) => document.document_status === "needs_review");
  const warnings: string[] = [];

  if (isPaidOrActual && !hasReceiptOrInvoice) warnings.push("Actual or paid cost is missing a receipt or invoice.");
  if (hasInvoice && !hasAcceptedInvoice) warnings.push("Invoice uploaded but not accepted yet.");
  if (hasNeedsReview) warnings.push("One or more documents needs review.");

  return warnings;
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
            <Button
              type="button"
              variant="outline"
              onClick={onDiscard}
              disabled={isPending}
              data-testid="budget-discard-changes"
            >
              Discard changes
            </Button>
            <Button type="button" onClick={onSave} disabled={isPending} data-testid="budget-save-all">
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

function TicketTierList({
  eventId,
  ticketTiers,
  canEdit,
  canDelete,
}: {
  eventId: string;
  ticketTiers: TicketTier[];
  canEdit: boolean;
  canDelete: boolean;
}) {
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
            <div key={tier.id} className="rounded-md border p-3" data-testid={`ticket-tier-row-${tier.id}`}>
              <form action={updateTicketTier} className="grid gap-3 md:grid-cols-6">
                <input type="hidden" name="id" value={tier.id} />
                <input type="hidden" name="event_id" value={eventId} />
                <Field label="Name" className="md:col-span-2"><Input name="name" defaultValue={tier.name} required disabled={!canEdit} /></Field>
                <Field label="Unit price"><Input name="price" type="number" min="0" step="0.01" defaultValue={tier.price} required disabled={!canEdit} /></Field>
                <Field label="Capacity"><Input name="capacity" type="number" min="0" defaultValue={tier.capacity} required disabled={!canEdit} /></Field>
                <Field label="Sold"><Input name="sold_quantity" type="number" min="0" defaultValue={tier.sold_quantity} required disabled={!canEdit} /></Field>
                <Field label="Comps"><Input name="comp_quantity" type="number" min="0" defaultValue={tier.comp_quantity} required disabled={!canEdit} /></Field>
                <Field label="Projected gross"><ReadOnlyMetric value={money(tier.projected_gross)} /></Field>
                <Field label="Actual gross"><ReadOnlyMetric value={money(tier.generated_gross)} /></Field>
                <Field label="Notes" className="md:col-span-3"><Input name="notes" defaultValue={tier.notes ?? ""} disabled={!canEdit} /></Field>
                <div className="flex items-end gap-2">
                  {canEdit ? <Button type="submit" variant="secondary">Save</Button> : null}
                  {canDelete ? (
                    <DeleteButton
                      action={deleteTicketTier}
                      title="Archive ticket tier?"
                      description={`This will archive "${tier.name}" and remove it from active views. It can be restored by an Admin or Owner.`}
                      openTestId={`ticket-tier-archive-open-${tier.id}`}
                      dialogTestId="ticket-tier-archive-confirm-dialog"
                      confirmTestId={`ticket-tier-archive-confirm-${tier.id}`}
                      cancelTestId={`ticket-tier-archive-cancel-${tier.id}`}
                      label={`Archive ticket tier ${tier.name}`}
                    />
                  ) : null}
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

function RevenueList({
  eventId,
  revenueItems,
  canEdit,
  canDelete,
}: {
  eventId: string;
  revenueItems: RevenueItem[];
  canEdit: boolean;
  canDelete: boolean;
}) {
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
            <div key={item.id} className="rounded-md border p-3" data-testid={`revenue-item-row-${item.id}`}>
              <form action={updateRevenueItem} className="grid gap-3 md:grid-cols-6">
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="event_id" value={eventId} />
                <Field label="Type">
                  <Select name="source" defaultValue={item.source} disabled={!canEdit}>
                    {revenueSources.map((source) => <option key={source} value={source}>{titleize(source)}</option>)}
                  </Select>
                </Field>
                <Field label="Description" className="md:col-span-2"><Input name="description" defaultValue={item.description} required disabled={!canEdit} /></Field>
                <Field label="Projected"><Input name="projected_amount" type="number" min="0" step="0.01" defaultValue={item.projected_amount} required disabled={!canEdit} /></Field>
                <Field label="Actual / received"><Input name="actual_amount" type="number" min="0" step="0.01" defaultValue={item.actual_amount ?? ""} placeholder="Blank until known" disabled={!canEdit} /></Field>
                <Field label="Status">
                  <Select name="status" defaultValue={item.status} disabled={!canEdit}>
                    {revenueStatuses.map((status) => <option key={status} value={status}>{titleize(status)}</option>)}
                  </Select>
                </Field>
                <Field label="Notes" className="md:col-span-5"><Input name="notes" defaultValue={item.notes ?? ""} disabled={!canEdit} /></Field>
                <div className="flex items-end gap-2">
                  {canEdit ? <Button type="submit" variant="secondary">Save</Button> : null}
                  {canDelete ? (
                    <DeleteButton
                      action={deleteRevenueItem}
                      title="Archive revenue item?"
                      description={`This will archive "${item.description}" and remove it from active views. It can be restored by an Admin or Owner.`}
                      openTestId={`revenue-item-archive-open-${item.id}`}
                      dialogTestId="revenue-item-archive-confirm-dialog"
                      confirmTestId={`revenue-item-archive-confirm-${item.id}`}
                      cancelTestId={`revenue-item-archive-cancel-${item.id}`}
                      label={`Archive revenue item ${item.description}`}
                    />
                  ) : null}
                </div>
              </form>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ArchivedBudgetList({ eventId, items }: { eventId: string; items: BudgetItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Archived budget items</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Admin/Owner restore area. Archived rows are excluded from active totals.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No archived budget items.</p>
        ) : (
          items.map((item) => (
            <ArchivedRow
              key={item.id}
              eventId={eventId}
              id={item.id}
              kind="budget-item"
              title={item.description}
              detail={`${item.category} / ${titleize(item.status)} / ${money(Number(item.actual_amount ?? item.estimated_amount ?? 0))}`}
              reason={item.delete_reason}
              restoredAction={restoreBudgetItem}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ArchivedRevenueList({
  eventId,
  revenueItems,
  ticketTiers,
}: {
  eventId: string;
  revenueItems: RevenueItem[];
  ticketTiers: TicketTier[];
}) {
  const hasArchived = revenueItems.length > 0 || ticketTiers.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archived revenue records</CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Admin/Owner restore area. Archived rows are excluded from active totals.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasArchived ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No archived revenue items or ticket tiers.</p>
        ) : null}
        {ticketTiers.map((tier) => (
          <ArchivedRow
            key={tier.id}
            eventId={eventId}
            id={tier.id}
            kind="ticket-tier"
            title={tier.name}
            detail={`Ticket tier / ${money(Number(tier.generated_gross || tier.projected_gross || 0))}`}
            reason={tier.delete_reason}
            restoredAction={restoreTicketTier}
          />
        ))}
        {revenueItems.map((item) => (
          <ArchivedRow
            key={item.id}
            eventId={eventId}
            id={item.id}
            kind="revenue-item"
            title={item.description}
            detail={`${titleize(item.source)} / ${titleize(item.status)} / ${money(Number(item.actual_amount ?? item.projected_amount ?? 0))}`}
            reason={item.delete_reason}
            restoredAction={restoreRevenueItem}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ArchivedRow({
  eventId,
  id,
  kind,
  title,
  detail,
  reason,
  restoredAction,
}: {
  eventId: string;
  id: string;
  kind: string;
  title: string;
  detail: string;
  reason: string | null;
  restoredAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3 text-sm" data-testid={`archived-${kind}-row-${id}`}>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
        {reason ? <p className="mt-1 text-xs text-muted-foreground">Reason: {reason}</p> : null}
      </div>
      <form action={restoredAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="event_id" value={eventId} />
        <Button type="submit" variant="outline" size="sm" data-testid={`restore-${kind}-${id}`} aria-label={`Restore ${title}`}>Restore</Button>
      </form>
    </div>
  );
}

function SettlementCard({
  eventId,
  totals,
  settlement,
  canEdit,
}: {
  eventId: string;
  totals: ReturnType<typeof calculateFinancialSettlement>;
  settlement: Settlement | null;
  canEdit: boolean;
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
            <Select name="partner_split_type" defaultValue={settlement?.partner_split_type ?? "true_50_50"} disabled={!canEdit}>
              {splitTypes.map((type) => <option key={type} value={type}>{titleize(type)}</option>)}
            </Select>
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Partner A"><Input name="partner_a_name" defaultValue={cleanPartnerName(settlement?.partner_a_name) ?? ""} disabled={!canEdit} /></Field>
            <Field label="Partner B"><Input name="partner_b_name" defaultValue={settlement?.partner_b_name ?? ""} disabled={!canEdit} /></Field>
            <Field label="Partner A %"><Input name="partner_a_percent" type="number" min="0" max="100" step="0.01" defaultValue={settlement?.partner_a_percent ?? 50} disabled={!canEdit} /></Field>
            <Field label="Partner B %"><Input name="partner_b_percent" type="number" min="0" max="100" step="0.01" defaultValue={settlement?.partner_b_percent ?? 50} disabled={!canEdit} /></Field>
          </div>
          <Field label="Notes">
            <Textarea name="notes" defaultValue={settlement?.notes ?? ""} disabled={!canEdit} />
          </Field>
          {canEdit ? <Button type="submit" variant="secondary" data-testid="settlement-save">Save settlement</Button> : null}
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
  openTestId,
  dialogTestId = "budget-delete-confirm-dialog",
  confirmTestId,
  cancelTestId,
  label,
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  description: string;
  disabled?: boolean;
  disabledMessage?: string;
  openTestId?: string;
  dialogTestId?: string;
  confirmTestId?: string;
  cancelTestId?: string;
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        disabled={disabled}
        title={disabled ? disabledMessage : undefined}
        aria-label={label}
        data-testid={openTestId}
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
            data-testid={dialogTestId}
          >
            <input type="hidden" name="confirm_intent" value="archive" />
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">Reason optional</span>
                <textarea
                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  name="delete_reason"
                  placeholder="Why is this record being archived?"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} data-testid={cancelTestId}>
                Cancel
              </Button>
              <DeleteConfirmButton action={action} testId={confirmTestId} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DeleteConfirmButton({ action, testId }: { action: (formData: FormData) => Promise<void>; testId?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" formAction={action} variant="destructive" disabled={pending} data-testid={testId}>
      {pending ? "Archiving..." : "Archive"}
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
  return value === "Production Company" || value === "Juniper Berry Production Company"
    ? "Juniper Berry Productions"
    : value;
}

function formatDocumentType(value: string) {
  const labels: Record<string, string> = {
    receipt: "Receipt",
    invoice: "Invoice",
    quote: "Quote",
    w9: "W-9",
    coi: "COI",
    contract: "Contract",
    other: "Document",
  };

  return labels[value] ?? titleize(value);
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
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
    deleted_at: null,
    deleted_by: null,
    delete_reason: null,
    restored_at: null,
    restored_by: null,
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
