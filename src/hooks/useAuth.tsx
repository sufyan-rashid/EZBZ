import { Session } from "@supabase/supabase-js";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  claimDeviceSession,
  getDeviceId,
  isDeviceSessionValid,
  justClaimedRecently,
} from "../lib/deviceSession";
import { showAlert } from "../lib/alert";
import { supabase } from "../lib/supabase";

type AuthContextType = { session: Session | null; loading: boolean };
const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // `onAuthStateChange` fires its own INITIAL_SESSION event right after
  // subscribing, which can race ahead of `getSession()`'s localStorage
  // read and report `null` for a tick even though a valid session is
  // about to be restored. That transient null was bouncing users to
  // /login and then straight to their dashboard, silently losing
  // whatever screen they'd deep-linked to (e.g. /customers/new).
  // Ignoring a null from the listener until the authoritative initial
  // getSession() check has completed avoids that false "logged out" blip.
  const initialLoadDone = useRef(false);
  // supabase-js (with an async RN storage adapter) can re-emit SIGNED_IN
  // for the same already-active session — not just once at startup, but
  // repeatedly, seconds apart, with no real sign-in happening. Each one
  // was treated as a fresh session: re-claiming this device, resetting
  // BusinessProvider's fetch, and churning the root navigation guard
  // through segments=[] -> (auth)/login -> landing route, which is what
  // was silently bouncing users off whatever screen they were on (e.g.
  // /customers/new) back to the dashboard. Tracking the last access token
  // we actually processed lets us ignore these no-op re-emissions.
  const lastAccessToken = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const valid = await isDeviceSessionValid(data.session.user.id);
        if (!valid) {
          await supabase.auth.signOut();
          setSession(null);
          setLoading(false);
          initialLoadDone.current = true;
          return;
        }
        // Refresh this device's own claim before exposing the session, so the
        // realtime listener below (which attaches once `session` is set)
        // never mistakes this device's own claim for a login elsewhere.
        await claimDeviceSession(data.session.user.id);
        lastAccessToken.current = data.session.access_token;
      }
      setSession(data.session);
      setLoading(false);
      initialLoadDone.current = true;
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!initialLoadDone.current && !newSession) return;
        if (newSession && newSession.access_token === lastAccessToken.current) {
          return;
        }
        if (newSession) {
          await claimDeviceSession(newSession.user.id);
        }
        lastAccessToken.current = newSession?.access_token ?? null;
        setSession(newSession);
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;
    const channel = supabase
      .channel("active-sessions-" + userId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "active_sessions",
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (justClaimedRecently()) return;
          const deviceId = await getDeviceId();
          const newSessionId = (payload.new as any)?.session_id;
          if (newSessionId && newSessionId !== deviceId) {
            showAlert(
              "Logged out",
              "This account was just logged into on another device.",
            );
            await supabase.auth.signOut();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user.id]);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
