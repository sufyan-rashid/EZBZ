import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./useAuth";
import { useBusiness } from "./useBusiness";
import { useNetwork } from "./useNetwork";
import { showAlert } from "../lib/alert";
import { getPendingOrders, getPendingReturns, getPendingCustomers, getPendingCustomerPayments } from "../lib/offlineQueue";
import { syncAllPending } from "../lib/offlineSync";

type OfflineSyncContextType = {
  pendingOrderCount: number;
  pendingReturnCount: number;
  pendingOrderTotal: number;
  pendingCustomerCount: number;
  pendingPaymentCount: number;
  syncing: boolean;
  syncProgress: { current: number; total: number } | null;
  refresh: () => Promise<void>;
  triggerSync: () => Promise<void>;
};

const OfflineSyncContext = createContext<OfflineSyncContextType>({
  pendingOrderCount: 0,
  pendingReturnCount: 0,
  pendingOrderTotal: 0,
  pendingCustomerCount: 0,
  pendingPaymentCount: 0,
  syncing: false,
  syncProgress: null,
  refresh: async () => {},
  triggerSync: async () => {},
});

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { business } = useBusiness();
  const { isConnected } = useNetwork();
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [pendingReturnCount, setPendingReturnCount] = useState(0);
  const [pendingOrderTotal, setPendingOrderTotal] = useState(0);
  const [pendingCustomerCount, setPendingCustomerCount] = useState(0);
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const wasConnected = useRef(isConnected);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!business || !session) {
      setPendingOrderCount(0);
      setPendingReturnCount(0);
      setPendingOrderTotal(0);
      setPendingCustomerCount(0);
      setPendingPaymentCount(0);
      return;
    }
    const [orders, returns, customers, payments] = await Promise.all([
      getPendingOrders(business.id, session.user.id),
      getPendingReturns(business.id, session.user.id),
      getPendingCustomers(business.id, session.user.id),
      getPendingCustomerPayments(business.id, session.user.id),
    ]);
    const unsynced = orders.filter((o) => o.status !== "synced");
    setPendingOrderCount(unsynced.length);
    setPendingOrderTotal(unsynced.reduce((sum, o) => sum + (o.payload.totalEstimate || 0), 0));
    setPendingReturnCount(returns.filter((r) => r.status !== "synced").length);
    setPendingCustomerCount(customers.filter((c) => c.status !== "synced").length);
    setPendingPaymentCount(payments.filter((p) => p.status !== "synced").length);
  }, [business?.id, session?.user.id]);

  const triggerSync = useCallback(async () => {
    if (!business || !session || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setSyncProgress(null);
    try {
      const before = await Promise.all([
        getPendingOrders(business.id, session.user.id),
        getPendingReturns(business.id, session.user.id),
        getPendingCustomers(business.id, session.user.id),
        getPendingCustomerPayments(business.id, session.user.id),
      ]);
      const totalCount = before.reduce((sum, list) => sum + list.filter((i) => i.status !== "synced").length, 0);
      if (totalCount === 0) return;

      const { customerResult, orderResult, returnResult, paymentResult } = await syncAllPending(
        business.id,
        session.user.id,
      );
      const synced = customerResult.synced + orderResult.synced + returnResult.synced + paymentResult.synced;
      const failed = customerResult.failed + orderResult.failed + returnResult.failed + paymentResult.failed;

      if (synced > 0 || failed > 0) {
        if (failed === 0) {
          showAlert("Synced", `${synced} offline item${synced === 1 ? "" : "s"} synced successfully.`);
        } else {
          showAlert(
            "Sync finished with issues",
            `${synced} synced. ${failed} couldn't be synced — check Pending Sync in More to review and fix ${failed === 1 ? "it" : "them"}.`,
          );
        }
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      setSyncProgress(null);
      await refresh();
    }
  }, [business?.id, session?.user.id, refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (isConnected && !wasConnected.current) {
      triggerSync();
    }
    wasConnected.current = isConnected;
  }, [isConnected, triggerSync]);

  return (
    <OfflineSyncContext.Provider
      value={{
        pendingOrderCount,
        pendingReturnCount,
        pendingOrderTotal,
        pendingCustomerCount,
        pendingPaymentCount,
        syncing,
        syncProgress,
        refresh,
        triggerSync,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
}

export function useOfflineSync() {
  return useContext(OfflineSyncContext);
}
