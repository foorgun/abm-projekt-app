import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useSession } from "../lib/session";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { useToast } from "./Toast";
import { Button, Card, SettingRow } from "./ui";

/**
 * Eigenes Konto in den Einstellungen: angemeldet als … und Passwort ändern (jede Rolle). Im Demo-Modus gibt es keine
 * Anmeldung und damit kein Passwort: dann nichts anzeigen.
 */
export function KontoKarte() {
  const { user, demo } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (demo) return null;
  return (
    <Card>
      <SettingRow
        icon={<KeyRound size={16} />}
        title="Mein Konto"
        description={`Angemeldet als ${user.email ?? user.name}`}
        action={
          <Button icon={<KeyRound size={15} />} onClick={() => setOpen(true)}>
            Passwort ändern
          </Button>
        }
      />
      {open && (
        <ChangePasswordDialog
          onClose={() => setOpen(false)}
          onChanged={() => {
            setOpen(false);
            toast("Passwort geändert");
          }}
        />
      )}
    </Card>
  );
}
