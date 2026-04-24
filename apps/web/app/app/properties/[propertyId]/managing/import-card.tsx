"use client";

import { useState, useTransition } from "react";
import { Upload, Plus, Trash2 } from "lucide-react";

import {
  RESERVATION_SOURCES,
  type PropertyReservation,
  type ReservationSource,
} from "@dwellverdict/db";

import { Button } from "@/components/ui/button";
import {
  importReservationsCsvAction,
  deleteReservationAction,
  createReservationAction,
} from "./actions";

const SOURCE_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  hospitable: "Hospitable",
  guesty: "Guesty",
  hostaway: "Hostaway",
  vrbo: "VRBO",
  manual: "Manual",
};

export function ImportCard({
  propertyId,
  reservations,
}: {
  propertyId: string;
  reservations: PropertyReservation[];
}) {
  const [isPending, startTransition] = useTransition();
  const [source, setSource] = useState<ReservationSource>("airbnb");
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isAddingManual, setIsAddingManual] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCsv(reader.result);
    };
    reader.readAsText(file);
  }

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-card p-6 shadow-card">
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        Reservations
      </h2>

      <div className="flex flex-col gap-3 rounded-md border border-hairline bg-paper p-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as ReservationSource)}
            className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
          >
            {RESERVATION_SOURCES.filter((s) => s !== "manual").map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s] ?? s}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="flex-1 text-xs file:mr-3 file:rounded file:border file:border-hairline file:bg-card file:px-2 file:py-1 file:font-mono file:text-xs"
          />
          <Button
            disabled={isPending || !csv}
            onClick={() =>
              startTransition(async () => {
                setResult(null);
                const res = await importReservationsCsvAction({
                  propertyId,
                  source,
                  csvText: csv,
                });
                if (res.ok) {
                  setResult(
                    `Imported ${res.imported}, skipped ${res.skipped}.`,
                  );
                  setCsv("");
                } else {
                  setResult(`Error: ${res.error}`);
                }
              })
            }
            className="gap-2"
          >
            <Upload className="h-3.5 w-3.5" />
            {isPending ? "Importing…" : "Import CSV"}
          </Button>
        </div>
        <p className="font-mono text-[11px] text-ink-muted">
          Paste or upload your Airbnb Reservations CSV export. Dedupe by
          confirmation code on re-import.
        </p>
        {result ? (
          <p className="font-mono text-xs text-ink">{result}</p>
        ) : null}
      </div>

      {isAddingManual ? (
        <ManualReservationForm
          propertyId={propertyId}
          onDone={() => setIsAddingManual(false)}
        />
      ) : (
        <Button
          variant="outline"
          onClick={() => setIsAddingManual(true)}
          className="gap-2 self-start"
        >
          <Plus className="h-3.5 w-3.5" />
          Add manual reservation
        </Button>
      )}

      {reservations.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No reservations yet — import a CSV or add one manually.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-hairline font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
                <th className="py-1 pr-3">Check-in</th>
                <th className="py-1 pr-3">Nights</th>
                <th className="py-1 pr-3">Guest</th>
                <th className="py-1 pr-3">Source</th>
                <th className="py-1 pr-3 text-right">Gross</th>
                <th className="py-1 pr-3 text-right">Net</th>
                <th className="py-1 pr-3">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <ReservationRow
                  key={r.id}
                  propertyId={propertyId}
                  reservation={r}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ReservationRow({
  propertyId,
  reservation,
}: {
  propertyId: string;
  reservation: PropertyReservation;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <tr className="border-b border-hairline text-sm">
      <td className="py-2 pr-3 font-mono text-xs">
        {new Date(reservation.checkIn).toLocaleDateString()}
      </td>
      <td className="py-2 pr-3 font-mono text-xs">{reservation.nights}</td>
      <td className="py-2 pr-3">{reservation.guestName ?? "—"}</td>
      <td className="py-2 pr-3 font-mono text-xs">
        {SOURCE_LABELS[reservation.source] ?? reservation.source}
      </td>
      <td className="py-2 pr-3 text-right font-mono">
        {formatCents(reservation.grossRevenueCents)}
      </td>
      <td className="py-2 pr-3 text-right font-mono">
        {formatCents(reservation.netCents)}
      </td>
      <td className="py-2 pr-3 font-mono text-xs">{reservation.status}</td>
      <td className="py-2 pr-3">
        <button
          onClick={() =>
            startTransition(async () => {
              if (!confirm("Delete this reservation?")) return;
              await deleteReservationAction({
                id: reservation.id,
                propertyId,
              });
            })
          }
          disabled={isPending}
          className="text-ink-muted transition-colors hover:text-signal-pass"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function ManualReservationForm({
  propertyId,
  onDone,
}: {
  propertyId: string;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [guest, setGuest] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const grossCents = Math.round(parseFloat(gross || "0") * 100);
          const netCents = Math.round(parseFloat(net || "0") * 100);
          if (
            !Number.isFinite(grossCents) ||
            !Number.isFinite(netCents) ||
            grossCents < 0 ||
            netCents < 0
          )
            return;
          await createReservationAction({
            propertyId,
            guestName: guest || null,
            checkIn: new Date(checkIn).toISOString(),
            checkOut: new Date(checkOut).toISOString(),
            grossRevenueCents: grossCents,
            netCents,
            cleaningFeeCents: 0,
            serviceFeeCents: 0,
            taxesCents: 0,
            status: "confirmed",
          });
          setGuest("");
          setCheckIn("");
          setCheckOut("");
          setGross("");
          setNet("");
          onDone();
        });
      }}
      className="flex flex-col gap-2 rounded-md border border-hairline bg-paper p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Guest name"
          value={guest}
          onChange={(e) => setGuest(e.target.value)}
          className="flex-1 rounded border border-hairline bg-card px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          required
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        />
        <span className="font-mono text-xs text-ink-muted">→</span>
        <input
          type="date"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          required
          className="rounded border border-hairline bg-card px-2 py-1 font-mono text-xs"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 text-xs">
          <span className="font-mono text-[11px] text-ink-muted">Gross $</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            required
            className="w-24 rounded border border-hairline bg-card px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-1 text-xs">
          <span className="font-mono text-[11px] text-ink-muted">Net $</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={net}
            onChange={(e) => setNet(e.target.value)}
            required
            className="w-24 rounded border border-hairline bg-card px-2 py-1 text-sm"
          />
        </label>
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
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
