"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Mail, Phone } from "lucide-react";

import type {
  RenovationContractor,
  RenovationQuote,
  RenovationScopeItem,
} from "@dwellverdict/db";

import { Button } from "@/components/ui/button";
import {
  createContractorAction,
  deleteContractorAction,
  createQuoteAction,
  updateQuoteAction,
  deleteQuoteAction,
} from "./actions";

const TRADE_LABELS: Record<string, string> = {
  general: "General",
  electrical: "Electrical",
  plumbing: "Plumbing",
  hvac: "HVAC",
  framing: "Framing",
  roofing: "Roofing",
  painting: "Painting",
  flooring: "Flooring",
  landscaping: "Landscaping",
  tile: "Tile",
  drywall: "Drywall",
  cabinets: "Cabinets",
  appliances: "Appliances",
  pool: "Pool",
  other: "Other",
};

const QUOTE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
};

export function ContractorsCard({
  propertyId,
  contractors,
  quotes,
  scopeItems,
}: {
  propertyId: string;
  contractors: RenovationContractor[];
  quotes: RenovationQuote[];
  scopeItems: RenovationScopeItem[];
}) {
  const [isAddingContractor, setIsAddingContractor] = useState(false);
  const [isAddingQuote, setIsAddingQuote] = useState(false);

  const quotesByContractor = new Map<string, RenovationQuote[]>();
  for (const q of quotes) {
    if (!q.contractorId) continue;
    if (!quotesByContractor.has(q.contractorId)) {
      quotesByContractor.set(q.contractorId, []);
    }
    quotesByContractor.get(q.contractorId)!.push(q);
  }
  const unassignedQuotes = quotes.filter((q) => !q.contractorId);

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        Contractors + quotes
      </h2>

      {contractors.length === 0 && quotes.length === 0 && !isAddingContractor ? (
        <p className="text-sm text-ink-muted">
          No contractors or quotes yet. Start adding contacts as you collect
          bids.
        </p>
      ) : null}

      <div className="flex flex-col gap-3">
        {contractors.map((c) => (
          <ContractorRow
            key={c.id}
            propertyId={propertyId}
            contractor={c}
            quotes={quotesByContractor.get(c.id) ?? []}
            scopeItems={scopeItems}
          />
        ))}
        {unassignedQuotes.length > 0 ? (
          <div className="rounded-md border border-hairline bg-paper p-3">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
              Unassigned quotes
            </p>
            <div className="flex flex-col gap-2">
              {unassignedQuotes.map((q) => (
                <QuoteRow
                  key={q.id}
                  propertyId={propertyId}
                  quote={q}
                  scopeItems={scopeItems}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isAddingContractor ? (
          <ContractorAddForm
            propertyId={propertyId}
            onDone={() => setIsAddingContractor(false)}
          />
        ) : (
          <Button
            variant="outline"
            onClick={() => setIsAddingContractor(true)}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Add contractor
          </Button>
        )}
        {isAddingQuote ? (
          <QuoteAddForm
            propertyId={propertyId}
            contractors={contractors}
            scopeItems={scopeItems}
            onDone={() => setIsAddingQuote(false)}
          />
        ) : (
          <Button
            variant="outline"
            onClick={() => setIsAddingQuote(true)}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Add quote
          </Button>
        )}
      </div>
    </div>
  );
}

function ContractorRow({
  propertyId,
  contractor,
  quotes,
  scopeItems,
}: {
  propertyId: string;
  contractor: RenovationContractor;
  quotes: RenovationQuote[];
  scopeItems: RenovationScopeItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const scopeById = new Map(scopeItems.map((s) => [s.id, s]));

  return (
    <div className="flex flex-col gap-2 rounded-md border border-hairline bg-paper p-3">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-ink">
              {contractor.name}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
              {TRADE_LABELS[contractor.trade] ?? contractor.trade}
            </span>
          </div>
          {contractor.company ? (
            <span className="text-xs text-ink-muted">{contractor.company}</span>
          ) : null}
          {contractor.licenseNumber ? (
            <span className="font-mono text-[11px] text-ink-muted">
              License {contractor.licenseNumber}
            </span>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {contractor.email ? (
              <a
                href={`mailto:${contractor.email}`}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted hover:text-ink"
              >
                <Mail className="h-3 w-3" />
                {contractor.email}
              </a>
            ) : null}
            {contractor.phone ? (
              <a
                href={`tel:${contractor.phone}`}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted hover:text-ink"
              >
                <Phone className="h-3 w-3" />
                {contractor.phone}
              </a>
            ) : null}
          </div>
        </div>
        <button
          onClick={() =>
            startTransition(async () => {
              if (!confirm(`Delete contractor "${contractor.name}"?`)) return;
              await deleteContractorAction({
                id: contractor.id,
                propertyId,
              });
            })
          }
          disabled={isPending}
          className="text-ink-muted transition-colors hover:text-signal-pass"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {quotes.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-hairline pt-2">
          {quotes.map((q) => (
            <QuoteRow
              key={q.id}
              propertyId={propertyId}
              quote={q}
              scopeItems={scopeItems}
              scopeLabel={
                q.scopeItemId ? scopeById.get(q.scopeItemId)?.label : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function QuoteRow({
  propertyId,
  quote,
  scopeItems,
  scopeLabel,
}: {
  propertyId: string;
  quote: RenovationQuote;
  scopeItems: RenovationScopeItem[];
  scopeLabel?: string | undefined;
}) {
  const [isPending, startTransition] = useTransition();
  const scopeById = new Map(scopeItems.map((s) => [s.id, s]));
  const label =
    scopeLabel ??
    (quote.scopeItemId ? scopeById.get(quote.scopeItemId)?.label : undefined);

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex-1 text-ink">{quote.label}</span>
      {label ? (
        <span className="font-mono text-[11px] text-ink-muted">{label}</span>
      ) : null}
      <span className="font-mono text-ink">{formatCents(quote.amountCents)}</span>
      <select
        value={quote.status}
        disabled={isPending}
        onChange={(e) =>
          startTransition(async () => {
            await updateQuoteAction({
              id: quote.id,
              propertyId,
              patch: {
                status: e.target.value as
                  | "pending"
                  | "accepted"
                  | "rejected"
                  | "expired",
              },
            });
          })
        }
        className="rounded border border-hairline bg-card px-1 py-0.5 font-mono text-[11px]"
      >
        {Object.entries(QUOTE_STATUS_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <button
        onClick={() =>
          startTransition(async () => {
            if (!confirm(`Delete quote "${quote.label}"?`)) return;
            await deleteQuoteAction({ id: quote.id, propertyId });
          })
        }
        disabled={isPending}
        className="text-ink-muted transition-colors hover:text-signal-pass"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function ContractorAddForm({
  propertyId,
  onDone,
}: {
  propertyId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [trade, setTrade] = useState("general");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await createContractorAction({
            propertyId,
            trade,
            name,
            company: company || null,
            email: email || null,
            phone: phone || null,
            licenseNumber: licenseNumber || null,
            notes: null,
          });
          setName("");
          setCompany("");
          setEmail("");
          setPhone("");
          setLicenseNumber("");
          onDone();
        });
      }}
      className="flex w-full flex-col gap-2 rounded-md border border-hairline bg-paper p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={trade}
          onChange={(e) => setTrade(e.target.value)}
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        >
          {Object.entries(TRADE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
        <input
          type="text"
          placeholder="License #"
          value={licenseNumber}
          onChange={(e) => setLicenseNumber(e.target.value)}
          className="w-32 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
        <input
          type="tel"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending} className="gap-2">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function QuoteAddForm({
  propertyId,
  contractors,
  scopeItems,
  onDone,
}: {
  propertyId: string;
  contractors: RenovationContractor[];
  scopeItems: RenovationScopeItem[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [contractorId, setContractorId] = useState<string>("");
  const [scopeItemId, setScopeItemId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const cents = Math.round(parseFloat(amount || "0") * 100);
        if (!Number.isFinite(cents) || cents < 0) return;
        startTransition(async () => {
          await createQuoteAction({
            propertyId,
            contractorId: contractorId || null,
            scopeItemId: scopeItemId || null,
            label,
            amountCents: cents,
            notes: null,
          });
          setLabel("");
          setAmount("");
          setContractorId("");
          setScopeItemId("");
          onDone();
        });
      }}
      className="flex w-full flex-col gap-2 rounded-md border border-hairline bg-paper p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Quote label *"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
          className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs text-ink-muted">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="w-24 rounded border border-hairline bg-card px-2 py-1 text-sm"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={contractorId}
          onChange={(e) => setContractorId(e.target.value)}
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        >
          <option value="">No contractor</option>
          {contractors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.company ? ` · ${c.company}` : ""}
            </option>
          ))}
        </select>
        <select
          value={scopeItemId}
          onChange={(e) => setScopeItemId(e.target.value)}
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        >
          <option value="">No scope item</option>
          {scopeItems.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending} className="gap-2">
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
