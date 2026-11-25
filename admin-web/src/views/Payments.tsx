import type { PaymentRow } from "../lib/types";
import { fmtDate, isThisMonth, money } from "../lib/format";

export function Payments({ payments, onOpen }: { payments: PaymentRow[]; onOpen: (id: string) => void }) {
  const sum = (list: PaymentRow[]) => list.reduce((s, p) => s + Number(p.amount), 0);
  const thisMonth = payments.filter((p) => isThisMonth(p.created_at));
  const lastMonth = payments.filter((p) => isThisMonth(p.created_at, -1));

  return (
    <>
      <section className="stats">
        <div className="stat card accent">
          <div className="stat-label">This month</div>
          <div className="stat-value">{money(sum(thisMonth))}</div>
          <div className="stat-hint">{thisMonth.length} payments</div>
        </div>
        <div className="stat card">
          <div className="stat-label">Last month</div>
          <div className="stat-value">{money(sum(lastMonth))}</div>
          <div className="stat-hint">{lastMonth.length} payments</div>
        </div>
        <div className="stat card">
          <div className="stat-label">All time</div>
          <div className="stat-value">{money(sum(payments))}</div>
          <div className="stat-hint">{payments.length} payments</div>
        </div>
      </section>

      <section className="card section">
        <h2>Payment history</h2>
        {payments.length === 0 ? (
          <p className="muted">
            No payments recorded yet. Open a business and use “Record payment” when a customer pays.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Business</th>
                <th className="num">Amount</th>
                <th>Period</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Valid until</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} onClick={() => onOpen(p.business_id)} tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(p.business_id)}>
                  <td data-label="Date">{fmtDate(p.created_at)}</td>
                  <td data-label="Business"><strong>{p.business_name}</strong></td>
                  <td data-label="Amount" className="num">{money(p.amount)}</td>
                  <td data-label="Period">{p.months} {p.months === 1 ? "month" : "months"}</td>
                  <td data-label="Method">{p.method ?? "—"}</td>
                  <td data-label="Reference">{p.reference ?? "—"}</td>
                  <td data-label="Valid until">{fmtDate(p.new_expiry_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
