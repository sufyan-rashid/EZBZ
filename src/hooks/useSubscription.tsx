import {
    createContext,
    ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";
import { supabase } from "../lib/supabase";
import { getEffectiveStatus, EffectiveSubscriptionStatus } from "../lib/subscriptionStatus";
import { useBusiness } from "./useBusiness";

type Subscription = {
  id: string;
  plan: string;
  status: string;
  amount: number;
  currency: string;
  start_date: string | null;
  expiry_date: string | null;
};
type SubscriptionContextType = {
  subscription: Subscription | null;
  effectiveStatus: EffectiveSubscriptionStatus;
  isActive: boolean;
  loading: boolean;
  refreshSubscription: () => Promise<void>;
};
const SubscriptionContext = createContext<SubscriptionContextType>({
  subscription: null,
  effectiveStatus: "pending",
  isActive: false,
  loading: true,
  refreshSubscription: async () => {},
});

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { business, loading: businessLoading } = useBusiness();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchSubscription() {
    if (!business) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("business_id", business.id)
      .maybeSingle();
    if (error) {
      console.log("Error fetching subscription:", error.message);
      setSubscription(null);
    } else {
      setSubscription(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (businessLoading) {
      setLoading(true);
      return;
    }
    fetchSubscription();
  }, [business?.id, businessLoading]);

  const effectiveStatus = getEffectiveStatus(subscription?.status, subscription?.expiry_date);
  const isActive = effectiveStatus === "active" || effectiveStatus === "trial";

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        effectiveStatus,
        isActive,
        loading,
        refreshSubscription: fetchSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
