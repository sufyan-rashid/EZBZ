import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import type { BusinessRow, PaymentRow } from "../lib/types";
import { addMonths, effectiveStatus, fmtDate, money, relDays, whatsappLink } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

const MONTH_OPTIONS = [1, 3, 6, 12];
const METHODS = ["JazzCash", "EasyPaisa", "Bank transfer", "Cash", "Other"];
const EDIT_STATUSES = ["trial", "active", "expired", "cancelled"];

type Props = {
  row: BusinessRow;
  payments: PaymentRow[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
};

export function BusinessDrawer({ row, payments, onClose, onSaved }: Props) {
  const status = effectiveStatus(row.status, row.expiry_date);
  const hasSubscription = row.status !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const wa = whatsappLink(row.business_phone, `Assalam o Alaikum! EZBZ team se (${row.business_name}).`);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-label={row.business_name}>
        <div className="drawer-head">
          <div>
            <h1>{row.business_name}</h1>
            <StatusBadge status={status} />
          </div>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <dl className="facts">
          <Fact label="Owner" value={row.owner_name ?? "—"} sub={row.owner_email ?? undefined} />
          <Fact
            label="Business phone"
            value={row.business_phone ?? "—"}
            extra={wa && <a className="btn small whatsapp" href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
          />
          <Fact label="Category" value={row.category ?? "—"} />
          <Fact label="Joined" value={fmtDate(row.created_at)} sub={relDays(row.created_at)} />
          <Fact label="Expires" value={fmtDate(row.expiry_date)} sub={relDays(row.expiry_date)} />
          <Fact label="Price / month" value={money(row.amount)} />
          <Fact label="Users" value={`${row.member_count} of ${row.max_users ?? "—"}`} />
          <Fact label="Orders" value={`${row.order_count} total`} sub={`${row.orders_last_30d} in last 30 days`} />
          <Fact label="Last sale" value={fmtDate(row.last_order_at)} sub={relDays(row.last_order_at)} />
          <Fact label="Total paid" value={money(row.total_paid)} />
        </dl>

        {hasSubscription ? (
          <>
            <RecordPayment row={row} onSaved={onSaved} />
            <ManualEdit row={row} onSaved={onSaved} />
          </>
        ) : (
          <p className="error">This business has no subscription record, so it can't be renewed here.</p>
        )}

        <section className="drawer-section">
          <h2>Payments</h2>
          {payments.length === 0 ? (
            <p className="muted">No payments recorded.</p>
          ) : (
            <ul className="list compact">
              {payments.map((p) => (
                <li key={p.id}>
                  <div className="list-main static">
                    <strong>{money(p.amount)}</strong>
                    <span className="muted">
                      {fmtDate(p.created_at)} · {p.months} mo · {p.method ?? "—"}
                      {p.reference ? ` · ${p.reference}` : ""}
                    </span>
                  </div>
                  <span className="muted small">until {fmtDate(p.new_expiry_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Fact({ label, value, sub, extra }: { label: string; value: string; sub?: string; extra?: ReactNode }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>
        {value} {extra}
        {sub && <div className="muted small">{sub}</div>}
      </dd>
    </div>
  );
}

function RecordPayment({ row, onSaved }: { row: BusinessRow; onSaved: Props["onSaved"] }) {
  const monthlyPrice = Number(row.amount ?? 0);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(monthlyPrice > 0 ? String(monthlyPrice) : "");
  const [method, setMethod] = useState(METHODS[0]);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ amount: number; until: string } | null>(null);

  const base = row.expiry_date && new Date(row.expiry_date) > new Date() ? new Date(row.expiry_date) : new Date();
  const previewExpiry = addMonths(base, months);

  function changeMonths(m: number) {
    setMonths(m);
    if (monthlyPrice > 0) setAmount(String(monthlyPrice * m));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!(value > 0)) {
      setError("Enter the amount received.");
      return;
    }
    if (!window.confirm(`Record ${money(value)} from ${row.business_name} and extend by ${months} month(s)?`)) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("admin_record_subscription_payment", {
      p_business_id: row.business_id,
      p_amount: value,
      p_months: months,
      p_method: method,
      p_reference: reference,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone({ amount: value, until: data as string });
    setReference("");
    await onSaved();
  }

  const receipt =
    done &&
    whatsappLink(
      row.business_phone,
      `Shukriya! ${money(done.amount)} mil gaye. Aap ki EZBZ subscription (${row.business_name}) ${fmtDate(done.until)} tak active hai.`,
    );

  return (
    <section className="drawer-section">
      <h2>Record payment</h2>
      <p className="muted small">
        Marks the subscription active and extends it. Remaining days are kept.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Period
          <select value={months} onChange={(e) => changeMonths(Number(e.target.value))}>
            {MONTH_OPTIONS.map((m) => (
              <option key={m} value={m}>{m} {m === 1 ? "month" : "months"}</option>
            ))}
          </select>
        </label>
        <label>
          Amount received (Rs)
          <input type="number" min="1" step="any" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>
          Method
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label>
          Reference / TID (optional)
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. JazzCash TID" />
        </label>
        <p className="preview full">
          New expiry: <strong>{fmtDate(previewExpiry.toISOString())}</strong>
        </p>
        {error && <p className="error full">{error}</p>}
        <button className="btn primary full" disabled={busy}>
          {busy ? "Saving…" : "Record payment"}
        </button>
      </form>
      {done && (
        <p className="success">
          Saved — active until {fmtDate(done.until)}.{" "}
          {receipt && <a href={receipt} target="_blank" rel="noreferrer">Send WhatsApp receipt</a>}
        </p>
      )}
    </section>
  );
}

function ManualEdit({ row, onSaved }: { row: BusinessRow; onSaved: Props["onSaved"] }) {
  const effective = effectiveStatus(row.status, row.expiry_date);
  const [status, setStatus] = useState(effective === "pending" ? "trial" : effective);
  const [expiry, setExpiry] = useState(row.expiry_date ? toLocalDateInput(row.expiry_date) : "");
  const [maxUsers, setMaxUsers] = useState(String(row.max_users ?? 1));
  const [price, setPrice] = useState(String(row.amount ?? 0));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const seats = parseInt(maxUsers, 10);
    if (!(seats >= 1)) {
      setMessage({ ok: false, text: "User limit must be 1 or more." });
      return;
    }
    const priceNum = Number(price);
    if (!(priceNum >= 0)) {
      setMessage({ ok: false, text: "Price can't be negative." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc("admin_update_subscription", {
      p_business_id: row.business_id,
      p_status: status,
      // End of the chosen day in Pakistan time.
      p_expiry_date: expiry ? `${expiry}T23:59:59+05:00` : null,
      p_amount: priceNum,
      p_max_users: seats,
    });
    setBusy(false);
    if (error) {
      setMessage({ ok: false, text: error.message });
      return;
    }
    setMessage({ ok: true, text: "Subscription updated." });
    await onSaved();
  }

  return (
    <details className="drawer-section">
      <summary>Edit subscription manually</summary>
      <p className="muted small">For corrections, trials and free extensions. No payment is recorded.</p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {EDIT_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <label>
          Expiry date
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </label>
        <label>
          User limit
          <input type="number" min="1" step="1" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
        </label>
        <label>
          Price / month (Rs)
          <input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        {message && <p className={`${message.ok ? "success" : "error"} full`}>{message.text}</p>}
        <button className="btn full" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      </form>
    </details>
  );
}

function toLocalDateInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
