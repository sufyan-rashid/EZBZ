import { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import type { BusinessRow, PaymentRow } from "./lib/types";
import { Overview } from "./views/Overview";
import { Businesses } from "./views/Businesses";
import { Payments } from "./views/Payments";
import { BusinessDrawer } from "./views/BusinessDrawer";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "businesses", label: "Businesses" },
  { key: "payments", label: "Payments" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function tabFromHash(): Tab {
  const h = window.location.hash.slice(1);
  return TABS.some((t) => t.key === h) ? (h as Tab) : "overview";
}

export function Panel({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [rows, setRows] = useState<BusinessRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [overview, paid] = await Promise.all([
      supabase.rpc("admin_business_overview"),
      supabase.rpc("admin_list_subscription_payments", { p_limit: 1000 }),
    ]);
    setLoading(false);
    const err = overview.error ?? paid.error;
    if (err) {
      setError(err.message);
      return;
    }
    setError("");
    setRows((overview.data ?? []) as BusinessRow[]);
    setPayments((paid.data ?? []) as PaymentRow[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const openRow = rows.find((r) => r.business_id === openId) ?? null;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">EZBZ <span>Admin</span></div>
        <nav className="tabs">
          {TABS.map((t) => (
            <a key={t.key} href={`#${t.key}`} className={tab === t.key ? "active" : ""}>
              {t.label}
            </a>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="btn ghost" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button className="btn ghost" onClick={() => supabase.auth.signOut()} title={email}>
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
        {error && <p className="error banner">Couldn't load data: {error}</p>}
        {tab === "overview" && <Overview rows={rows} payments={payments} onOpen={setOpenId} />}
        {tab === "businesses" && <Businesses rows={rows} onOpen={setOpenId} />}
        {tab === "payments" && <Payments payments={payments} onOpen={setOpenId} />}
      </main>

      {openRow && (
        <BusinessDrawer
          key={openRow.business_id}
          row={openRow}
          payments={payments.filter((p) => p.business_id === openRow.business_id)}
          onClose={() => setOpenId(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
