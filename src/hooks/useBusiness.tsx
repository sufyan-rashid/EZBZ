import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import { GranularPermissions } from "../lib/permissions";

const ACTIVE_BUSINESS_KEY = "ezbz_active_business_id";

type Business = {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  logo_url: string | null;
};
export type Permissions = GranularPermissions;
export type Membership = {
  memberId: string;
  role: string;
  permissions: Permissions;
  business: Business;
};

type BusinessContextType = {
  business: Business | null;
  permissions: Permissions;
  memberId: string | null;
  role: string | null;
  isPlatformAdmin: boolean;
  loading: boolean;
  memberships: Membership[];
  needsBusinessPicker: boolean;
  switchBusiness: (businessId: string) => Promise<void>;
  refreshBusiness: () => Promise<void>;
};
const BusinessContext = createContext<BusinessContextType>({
  business: null,
  permissions: {},
  memberId: null,
  role: null,
  isPlatformAdmin: false,
  loading: true,
  memberships: [],
  needsBusinessPicker: false,
  switchBusiness: async () => {},
  refreshBusiness: async () => {},
});

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [needsBusinessPicker, setNeedsBusinessPicker] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  async function fetchBusiness() {
    if (!session) {
      setMemberships([]);
      setActiveBusinessId(null);
      setNeedsBusinessPicker(false);
      setIsPlatformAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: rows, error: rowsError } = await supabase
      .from("business_members")
      .select(
        "id, role, permissions, created_at, business:businesses(id, name, category, phone, address, currency, logo_url)",
      )
      .eq("user_id", session.user.id)
      .order("created_at");
    if (rowsError) console.log("Error fetching business memberships:", rowsError.message);

    const list: Membership[] = ((rows as any[]) ?? []).map((r) => ({
      memberId: r.id,
      role: r.role,
      permissions: (r.permissions as Permissions) ?? {},
      business: r.business,
    }));
    setMemberships(list);

    const stored = await AsyncStorage.getItem(ACTIVE_BUSINESS_KEY);
    const storedValid = stored && list.some((m) => m.business.id === stored);

    if (storedValid) {
      setActiveBusinessId(stored);
      setNeedsBusinessPicker(false);
    } else if (list.length === 1) {
      setActiveBusinessId(list[0].business.id);
      setNeedsBusinessPicker(false);
    } else if (list.length > 1) {
      setActiveBusinessId(null);
      setNeedsBusinessPicker(true);
    } else {
      setActiveBusinessId(null);
      setNeedsBusinessPicker(false);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", session.user.id)
      .maybeSingle();
    if (profileError) console.log("Error fetching profile:", profileError.message);
    setIsPlatformAdmin(!!profile?.is_platform_admin);

    setLoading(false);
  }

  async function switchBusiness(businessId: string) {
    await AsyncStorage.setItem(ACTIVE_BUSINESS_KEY, businessId);
    setActiveBusinessId(businessId);
    setNeedsBusinessPicker(false);
  }

  useEffect(() => {
    fetchBusiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const active = useMemo(
    () => memberships.find((m) => m.business.id === activeBusinessId) ?? null,
    [memberships, activeBusinessId],
  );

  return (
    <BusinessContext.Provider
      value={{
        business: active?.business ?? null,
        permissions: active?.permissions ?? {},
        memberId: active?.memberId ?? null,
        role: active?.role ?? null,
        isPlatformAdmin,
        loading,
        memberships,
        needsBusinessPicker,
        switchBusiness,
        refreshBusiness: fetchBusiness,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  return useContext(BusinessContext);
}
