import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/hooks/useAuth";
import { BusinessProvider, useBusiness } from "../src/hooks/useBusiness";
import { SubscriptionProvider } from "../src/hooks/useSubscription";
import { NetworkProvider } from "../src/hooks/useNetwork";
import { OfflineSyncProvider } from "../src/hooks/useOfflineSync";
import { AlertHost } from "../src/components/alert-host";
import { OfflineBanner } from "../src/components/offline-banner";
import { getLandingRoute } from "../src/lib/permissions";

function RootLayoutNav() {
  const { session, loading: authLoading } = useAuth();
  const {
    business,
    permissions,
    loading: businessLoading,
    memberships,
    needsBusinessPicker,
  } = useBusiness();
  const segments = useSegments();
  const router = useRouter();

  const landingRoute = getLandingRoute(permissions);

  // Blank the app only for the very first load. Later reloads (saving
  // settings, uploading a logo, a session refresh) used to unmount the whole
  // tree, throwing the user off their screen and swallowing any alert.
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  if (!initialLoadDone && !authLoading && !businessLoading) {
    setInitialLoadDone(true);
  }

  useEffect(() => {
    if (authLoading || businessLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";
    const onboardingScreen = segments[1];

    if (!session) {
      if (!inAuthGroup) router.replace("/(auth)/login");
      return;
    }

    if (memberships.length === 0) {
      if (!inOnboardingGroup) router.replace("/(onboarding)/welcome");
      return;
    }

    if (needsBusinessPicker && !business) {
      if (onboardingScreen !== "select-business") router.replace("/(onboarding)/select-business");
      return;
    }

    if (business) {
      if (inAuthGroup) {
        router.replace(landingRoute);
      } else if (
        inOnboardingGroup &&
        onboardingScreen !== "select-business" &&
        onboardingScreen !== "business-info" &&
        onboardingScreen !== "first-product"
      ) {
        // An existing Owner can reach business-info/first-product from
        // "+ Create New Business" (on select-business) to add another
        // business — don't bounce them back to their current one mid-flow.
        router.replace(landingRoute);
      }
    }
  }, [session, authLoading, business, businessLoading, memberships, needsBusinessPicker, segments, landingRoute]);

  if (!initialLoadDone) return null;

  return (
    <>
      {/* Dark icons (clock/battery/signal) since the app is light-themed
          only — without this it defaults to "auto", which can render
          invisible light icons on a light background depending on the
          device's system theme. */}
      <StatusBar style="dark" />
      <OfflineBanner />
      <Slot />
      <AlertHost />
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BusinessProvider>
          <SubscriptionProvider>
            <NetworkProvider>
              <OfflineSyncProvider>
                <RootLayoutNav />
              </OfflineSyncProvider>
            </NetworkProvider>
          </SubscriptionProvider>
        </BusinessProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
