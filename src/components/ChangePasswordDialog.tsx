import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "../lib/password";
import { useSession } from "../lib/session";
import { Button, Dialog, Field, Input } from "./ui";

export function ChangePasswordDialog({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const { changePassword } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validateNewPassword(current, next, repeat);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const res = await changePassword(current, next);
    setBusy(false);
    if (res.ok) return onChanged();
    setError(res.error);
    setCurrent("");
  }

  return (
    <Dialog
      title="Passwort ändern"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="primary" type="submit" form="change-password" icon={<KeyRound size={15} />} disabled={busy}>
            {busy ? "Ändern …" : "Passwort ändern"}
          </Button>
        </>
      }
    >
      <form id="change-password" className="auth-form" onSubmit={submit} noValidate>
        <Field label="Aktuelles Passwort" htmlFor="password-current">
          <Input id="password-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Neues Passwort" htmlFor="password-next" hint={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}>
          <Input id="password-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Neues Passwort wiederholen" htmlFor="password-repeat">
          <Input id="password-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </Field>
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
