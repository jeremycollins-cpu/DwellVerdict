"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Mail, Phone } from "lucide-react";

import type { DealContact } from "@dwellverdict/db";

import { Button } from "@/components/ui/button";
import { createContactAction, deleteContactAction } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  agent: "Seller's agent",
  buyers_agent: "Buyer's agent",
  lender: "Lender",
  inspector: "Inspector",
  title: "Title / escrow",
  attorney: "Attorney",
  appraiser: "Appraiser",
  other: "Other",
};

export function ContactsCard({
  propertyId,
  contacts,
}: {
  propertyId: string;
  contacts: DealContact[];
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        Contacts
      </h2>

      {contacts.length === 0 && !isAdding ? (
        <p className="text-sm text-ink-muted">
          No contacts yet. Add agent, lender, inspector, title company as you
          engage each.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {contacts.map((c) => (
          <ContactRow key={c.id} propertyId={propertyId} contact={c} />
        ))}
      </div>

      {isAdding ? (
        <ContactAddForm
          propertyId={propertyId}
          onDone={() => setIsAdding(false)}
        />
      ) : (
        <Button
          variant="outline"
          onClick={() => setIsAdding(true)}
          className="gap-2 self-start"
        >
          <Plus className="h-3.5 w-3.5" />
          Add contact
        </Button>
      )}
    </div>
  );
}

function ContactRow({
  propertyId,
  contact,
}: {
  propertyId: string;
  contact: DealContact;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-start gap-3 rounded-md border border-hairline bg-paper px-3 py-2">
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-ink">{contact.name}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted">
            {ROLE_LABELS[contact.role] ?? contact.role}
          </span>
        </div>
        {contact.company ? (
          <span className="text-xs text-ink-muted">{contact.company}</span>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted hover:text-ink"
            >
              <Mail className="h-3 w-3" />
              {contact.email}
            </a>
          ) : null}
          {contact.phone ? (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted hover:text-ink"
            >
              <Phone className="h-3 w-3" />
              {contact.phone}
            </a>
          ) : null}
        </div>
        {contact.notes ? (
          <span className="text-xs text-ink-muted">{contact.notes}</span>
        ) : null}
      </div>
      <button
        onClick={() =>
          startTransition(async () => {
            if (!confirm(`Delete contact "${contact.name}"?`)) return;
            await deleteContactAction({ id: contact.id, propertyId });
          })
        }
        disabled={isPending}
        className="text-ink-muted transition-colors hover:text-signal-pass"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ContactAddForm({
  propertyId,
  onDone,
}: {
  propertyId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState("agent");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await createContactAction({
            propertyId,
            role,
            name,
            company: company || null,
            email: email || null,
            phone: phone || null,
            notes: null,
          });
          setName("");
          setCompany("");
          setEmail("");
          setPhone("");
          onDone();
        });
      }}
      className="flex flex-col gap-2 rounded-md border border-hairline bg-paper p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        >
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
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
