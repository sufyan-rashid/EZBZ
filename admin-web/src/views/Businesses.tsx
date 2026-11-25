import { useMemo, useState } from "react";
import type { BusinessRow } from "../lib/types";
import { effectiveStatus, fmtDate, money, relDays, STATUS_LABEL, type Status } from "../lib/format";
import { StatusBadge } from "./StatusBadge";

const FILTERS: (Status | "all")[] = ["all", "active", "trial", "expired", "cancelled", "pending"];

export function Businesses({ rows, onOpen }: { rows: BusinessRow[]; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");

  const withStatus = useMemo(
    () => rows.map((r) => ({ row: r, status: effectiveStatus(r.status, r.expiry_date) })),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withStatus.filter(({ row, status }) => {
      if (filter !== "all" && status !== filter) return false;
      if (!q) return true;
      return [row.business_name, row.owner_name, row.owner_email, row.business_phone, row.category]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [withStatus, query, filter]);

  return (
    <section className="card section">
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search business, owner, email or phone"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {FILTERS.map((f) => {
            const n = f === "all" ? withStatus.length : withStatus.filter((x) => x.status === f).length;
            return (
              <button key={f} className={`chip${filter === f ? " active" : ""}`} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : STATUS_LABEL[f]} <span>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="muted">No businesses match.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Expires</th>
              <th className="num">Price / mo</th>
              <th className="num">Users</th>
              <th className="num">Orders (30d)</th>
              <th className="num">Total paid</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ row, status }) => (
              <tr key={row.business_id} onClick={() => onOpen(row.business_id)} tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onOpen(row.business_id)}>
                <td data-label="Business">
                  <strong>{row.business_name}</strong>
                  {row.category && <div className="muted small">{row.category}</div>}
                </td>
                <td data-label="Owner">
                  {row.owner_name ?? "—"}
                  <div className="muted small">{row.owner_email}</div>
                </td>
                <td data-label="Status"><StatusBadge status={status} /></td>
                <td data-label="Expires">
                  {fmtDate(row.expiry_date)}
                  <div className="muted small">{relDays(row.expiry_date)}</div>
                </td>
                <td data-label="Price / mo" className="num">{money(row.amount)}</td>
                <td data-label="Users" className="num">{row.member_count} / {row.max_users ?? "—"}</td>
                <td data-label="Orders (30d)" className="num">{row.orders_last_30d}</td>
                <td data-label="Total paid" className="num">{money(row.total_paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
