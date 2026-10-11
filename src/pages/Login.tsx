import { useRef, useState, type FormEvent } from "react";
import { LogIn, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import logo from "../assets/abm-logo.png";
import { Button, Field, Input } from "../components/ui";
import { useSession } from "../lib/session";

/** Rahmen für alle Seiten vor der App: Anmeldung, Konto ohne Rolle, Verbindungsfehler. */
function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src={logo} alt="ABM Architektur und Baumanagement" />
        {children}
      </div>
      <p className="auth-foot">Interne Projekt-App · Zugang nur für eingeladene Konten</p>
    </main>
  );
}

export function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pw = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return setError("Bitte E-Mail und Passwort eintragen.");
    setBusy(true);
    setError(null);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setPassword("");
      pw.current?.focus();
    }
  }

  return (
    <AuthFrame>
      <h1 className="auth-title">Anmelden</h1>
      <form className="auth-form" onSubmit={submit} noValidate>
        <Field label="E-Mail" htmlFor="login-email">
          <Input id="login-email" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error)} />
        </Field>
        <Field label="Passwort" htmlFor="login-password">
          <Input
            id="login-password"
            ref={pw}
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
          />
        </Field>
        {error && (
          <p className="auth-error" id="login-error" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" icon={<LogIn size={16} />} disabled={busy}>
          {busy ? "Anmelden …" : "Anmelden"}
        </Button>
      </form>
      <p className="auth-hint">Kein Konto oder Passwort vergessen? Konten legt der Admin an, eine Registrierung gibt es nicht.</p>
    </AuthFrame>
  );
}

export function NoRole() {
  const { user, signOut } = useSession();
  return (
    <AuthFrame>
      <h1 className="auth-title">Konto noch nicht freigeschaltet</h1>
      <p className="auth-text">
        <ShieldAlert size={16} aria-hidden /> Du bist als <strong>{user.email}</strong> angemeldet, aber dem Konto ist noch keine Rolle zugewiesen. Ohne Rolle zeigt die App keine Daten.
        Bitte beim Admin melden.
      </p>
      <Button variant="outline" icon={<LogOut size={15} />} onClick={() => void signOut()}>
        Abmelden
      </Button>
    </AuthFrame>
  );
}

export function SessionError() {
  const { error, retry } = useSession();
  return (
    <AuthFrame>
      <h1 className="auth-title">Keine Verbindung</h1>
      <p className="auth-text">{error ?? "Die Anmeldung konnte nicht geprüft werden."}</p>
      <Button variant="outline" icon={<RefreshCw size={15} />} onClick={retry}>
        Erneut versuchen
      </Button>
    </AuthFrame>
  );
}

export function SessionLoading() {
  return (
    <main className="auth-page" aria-busy="true">
      <p className="auth-foot">Anmeldung wird geprüft …</p>
    </main>
  );
}
