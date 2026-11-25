import { useMemo } from "react";
import type { BusinessRow, PaymentRow } from "../lib/types";
import {
  daysSince,
  daysUntil,
  effectiveStatus,
  fmtDate,
  isThisMonth,
  money,
  relDays,
  whatsappLink,
} from "../lib/format";
import { StatusBadge } from "./StatusBadge";

const PAY = "EasyPaisa/JazzCash 0300-2778713 (Sufiyan Rashid)";

type Props = {
  rows: BusinessRow[];
  payments: PaymentRow[];
  onOpen: (businessId: string) => void;
};

export function Overview({ rows, payments, onOpen }: Props) {
  const s = useMemo(() => {
    const withStatus = rows.map((r) => ({ row: r, status: effectiveStatus(r.status, r.expiry_date) }));
    const count = (st: string) => withStatus.filter((x) => x.status === st).length;
    const active = withStatus.filter((x) => x.status === "active");
    return {
      total: rows.length,
      active: active.length,
      trial: count("trial"),
      lapsed: count("expired") + count("cancelled") + count("pending"),
      mrr: active.reduce((sum, x) => sum + Number(x.row.amount ?? 0), 0),
      thisMonth: payments.filter((p) => isThisMonth(p.created_at)).reduce((sum, p) => sum + Number(p.amount), 0),
      lastMonth: payments.filter((p) => isThisMonth(p.created_at, -1)).reduce((sum, p) => sum + Number(p.amount), 0),
      allTime: payments.reduce((sum, p) => sum + Number(p.amount), 0),
      expiringSoon: withStatus
        .filter((x) => (x.status === "active" || x.status === "trial") && x.row.expiry_date && daysUntil(x.row.expiry_date) <= 7)
        .sort((a, b) => a.row.expiry_date!.localeCompare(b.row.expiry_date!)),
      recentlyExpired: withStatus
        .filter((x) => x.status === "expired" && x.row.expiry_date && daysSince(x.row.expiry_date) <= 30)
        .sort((a, b) => b.row.expiry_date!.localeCompare(a.row.expiry_date!)),
      idlePaying: withStatus.filter((x) => (x.status === "active" || x.status === "trial") && Number(x.row.orders_last_30d) === 0),
      newSignups: withStatus.filter((x) => daysSince(x.row.created_at) <= 7),
    };
  }, [rows, payments]);

  return (
    <>
      <section className="stats">
        <Stat label="Collected this month" value={money(s.thisMonth)} hint={`Last month ${money(s.lastMonth)}`} accent />
        <Stat label="Monthly recurring (MRR)" value={money(s.mrr)} hint={`${s.active} paying businesses`} />
        <Stat label="Total collected" value={money(s.allTime)} hint={`${payments.length} payments`} />
        <Stat label="Businesses" value={String(s.total)} hint={`${s.active} active · ${s.trial} trial · ${s.lapsed} lapsed`} />
      </section>

      <FollowUp
        title="Expiring in the next 7 days"
        empty="Nobody is about to expire."
        items={s.expiringSoon}
        onOpen={onOpen}
        when={(r) => `Expires ${relDays(r.expiry_date)} (${fmtDate(r.expiry_date)})`}
        message={(r) =>
          `Assalam o Alaikum! Aap ki EZBZ subscription (${r.business_name}) ${fmtDate(r.expiry_date)} ko khatam ho rahi hai. Renew karne ke liye ${PAY} pe payment bhej ke TID is number pe bhej dein.`
        }
      />
      <FollowUp
        title="Expired in the last 30 days — win them back"
        empty="No recent expiries."
        items={s.recentlyExpired}
        onOpen={onOpen}
        when={(r) => `Expired ${relDays(r.expiry_date)}`}
        message={(r) =>
          `Assalam o Alaikum! Aap ki EZBZ subscription (${r.business_name}) khatam ho chuki hai. Aap ka data mehfooz hai. Renew karne ke liye ${PAY} pe payment bhej ke TID is number pe bhej dein.`
        }
      />
      <FollowUp
        title="Subscribed but no sales in 30 days"
        empty="Every subscribed business is using the app."
        items={s.idlePaying}
        onOpen={onOpen}
        when={(r) => (r.last_order_at ? `Last sale ${relDays(r.last_order_at)}` : "No sales yet")}
        message={(r) =>
          `Assalam o Alaikum! EZBZ (${r.business_name}) istemal karne mein koi mushkil to nahi? Hum setup mein madad kar sakte hain.`
        }
      />
      <FollowUp
        title="New sign-ups this week"
        empty="No new sign-ups this week."
        items={s.newSignups}
        onOpen={onOpen}
        when={(r) => `Joined ${relDays(r.created_at)}`}
        message={(r) =>
          `Assalam o Alaikum! EZBZ join karne ka shukriya (${r.business_name}). Koi sawal ho to isi number pe message karein.`
        }
      />
    </>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={`stat card${accent ? " accent" : ""}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
}

type FollowUpProps = {
  title: string;
  empty: string;
  items: { row: BusinessRow; status: ReturnType<typeof effectiveStatus> }[];
  onOpen: (id: string) => void;
  when: (r: BusinessRow) => string;
  message: (r: BusinessRow) => string;
};

function FollowUp({ title, empty, items, onOpen, when, message }: FollowUpProps) {
  return (
    <section className="card section">
      <h2>
        {title} <span className="count">{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="list">
          {items.map(({ row, status }) => {
            const wa = whatsappLink(row.business_phone, message(row));
            return (
              <li key={row.business_id}>
                <button className="list-main" onClick={() => onOpen(row.business_id)}>
                  <strong>{row.business_name}</strong>
                  <span className="muted">
                    {row.owner_name ?? "—"} · {when(row)}
                  </span>
                </button>
                <StatusBadge status={status} />
                {wa ? (
                  <a className="btn small whatsapp" href={wa} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                ) : (
                  <span className="muted small" title="Business has no phone number saved">
                    No phone
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
