import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { Login } from "./Login";
import { Panel } from "./Panel";

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setIsAdmin(!!data?.is_platform_admin);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (session === undefined || (session && isAdmin === null)) {
    return <div className="center muted">Loading…</div>;
  }

  if (!session) return <Login />;

  if (!isAdmin) {
    return (
      <div className="center">
        <div className="card narrow">
          <h1>Not an admin account</h1>
          <p className="muted">
            {session.user.email} is not a platform admin. This panel is only for the EZBZ team.
          </p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <Panel email={session.user.email ?? ""} />;
}
