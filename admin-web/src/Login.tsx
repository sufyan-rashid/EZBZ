import { useState, type FormEvent } from "react";
import { supabase } from "./lib/supabase";

const APP_URL = "https://ezbz-ruby.vercel.app";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <div className="center">
      <form className="card narrow" onSubmit={onSubmit}>
        <div className="brand">EZBZ <span>Admin</span></div>
        <p className="muted">Sign in with your platform admin account.</p>
        <label>
          Email
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <a className="small-link" href={`${APP_URL}/forgot-password`} target="_blank" rel="noreferrer">
          Forgot password?
        </a>
      </form>
    </div>
  );
}
