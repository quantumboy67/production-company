import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { money, titleize } from "@/lib/format";
import { calculateSettlement } from "@/lib/data/events";
import type { BudgetItem, RevenueItem, Settlement, TicketTier } from "@/lib/types";

type Props = {
  activeTab: string;
  budgetItems: BudgetItem[];
  revenueItems: RevenueItem[];
  ticketTiers: TicketTier[];
  settlement: Settlement | null;
};

export function EventFinancialTabs(props: Props) {
  const activeTab = props.activeTab === "revenue" ? "revenue" : "budget";
  const totals = calculateSettlement(props);
  const hardCosts = props.budgetItems.filter((item) => item.cost_type === "hard");
  const softCosts = props.budgetItems.filter((item) => item.cost_type === "soft");

  return (
    <div className="space-y-4">
      {activeTab === "budget" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <CostTable title="Hard Costs" items={hardCosts} />
          <CostSummary items={props.budgetItems} />
          <div className="xl:col-span-2">
            <CostTable title="Soft Costs" items={softCosts} />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <RevenueTable revenueItems={props.revenueItems} ticketTiers={props.ticketTiers} />
          <SettlementCard totals={totals} settlement={props.settlement} />
        </div>
      )}
    </div>
  );
}

function CostSummary({ items }: { items: BudgetItem[] }) {
  const hard = items.filter((item) => item.cost_type === "hard").reduce((sum, item) => sum + Number(item.actual_amount ?? item.estimated_amount), 0);
  const soft = items.filter((item) => item.cost_type === "soft").reduce((sum, item) => sum + Number(item.actual_amount ?? item.estimated_amount), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <SummaryRow label="Hard costs" value={money(hard)} />
        <SummaryRow label="Soft costs" value={money(soft)} />
        <SummaryRow label="Total expenses" value={money(hard + soft)} strong />
      </CardContent>
    </Card>
  );
}

function CostTable({ title, items }: { title: string; items: BudgetItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-md border p-4 text-sm text-muted-foreground">No budget items yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Category</TH>
                <TH>Description</TH>
                <TH>Status</TH>
                <TH className="text-right">Estimate</TH>
                <TH className="text-right">Actual</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD className="font-medium">{item.category}</TD>
                  <TD>{item.description}</TD>
                  <TD><Badge>{titleize(item.status)}</Badge></TD>
                  <TD className="text-right font-mono">{money(item.estimated_amount)}</TD>
                  <TD className="text-right font-mono">{item.actual_amount === null ? "TBD" : money(item.actual_amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RevenueTable({ revenueItems, ticketTiers }: { revenueItems: RevenueItem[]; ticketTiers: TicketTier[] }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ticket Tiers</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Tier</TH>
                <TH className="text-right">Price</TH>
                <TH className="text-right">Capacity</TH>
                <TH className="text-right">Sold</TH>
                <TH className="text-right">Comps</TH>
                <TH className="text-right">Projected Gross</TH>
              </TR>
            </THead>
            <TBody>
              {ticketTiers.map((tier) => (
                <TR key={tier.id}>
                  <TD className="font-medium">{tier.name}</TD>
                  <TD className="text-right font-mono">{money(tier.price)}</TD>
                  <TD className="text-right">{tier.capacity}</TD>
                  <TD className="text-right">{tier.sold_quantity}</TD>
                  <TD className="text-right">{tier.comp_quantity}</TD>
                  <TD className="text-right font-mono">{money(tier.projected_gross)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Other Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Source</TH>
                <TH>Description</TH>
                <TH>Status</TH>
                <TH className="text-right">Projected</TH>
                <TH className="text-right">Actual</TH>
              </TR>
            </THead>
            <TBody>
              {revenueItems.map((item) => (
                <TR key={item.id}>
                  <TD className="font-medium">{titleize(item.source)}</TD>
                  <TD>{item.description}</TD>
                  <TD><Badge>{titleize(item.status)}</Badge></TD>
                  <TD className="text-right font-mono">{money(item.projected_amount)}</TD>
                  <TD className="text-right font-mono">{item.actual_amount === null ? "TBD" : money(item.actual_amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function SettlementCard({
  totals,
  settlement,
}: {
  totals: ReturnType<typeof calculateSettlement>;
  settlement: Settlement | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Settlement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <SummaryRow label="Gross revenue" value={money(totals.grossRevenue)} />
        <SummaryRow label="Total expenses" value={money(totals.totalExpenses)} />
        <SummaryRow label="Net profit/loss" value={money(totals.netProfit)} strong />
        <SummaryRow label="Break-even" value={money(totals.breakEven)} />
        <div className="my-3 border-t" />
        <SummaryRow label="Split type" value={titleize(settlement?.partner_split_type ?? "true_50_50")} />
        <SummaryRow label={settlement?.partner_a_name ?? "Partner A"} value={money(totals.partnerAAmount)} />
        <SummaryRow label={settlement?.partner_b_name ?? "Partner B"} value={money(totals.partnerBAmount)} />
      </CardContent>
    </Card>
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
