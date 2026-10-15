import { useState, type FormEvent } from "react";
import { Building2, Hammer, Lock, Pencil } from "lucide-react";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import { Button, Card, CardBody, CardHead, EmptyState, Field, IconButton, Input, Skeleton } from "../components/ui";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { BueroDaten } from "../lib/types";

const FELDER: { key: keyof BueroDaten; label: string; type?: string; placeholder?: string }[] = [
  { key: "name", label: "Name des Büros", placeholder: "z. B. ABM Architektur und Baumanagement" },
  { key: "anschrift", label: "Anschrift", placeholder: "Straße, PLZ Ort" },
  { key: "tel", label: "Telefon", type: "tel" },
  { key: "mobil", label: "Mobil", type: "tel" },
  { key: "email", label: "E-Mail", type: "email" },
];

/** Einstellungen. Bisher: Bürodaten für das Planungsprotokoll (lesen Admin und Mitarbeiter, ändern nur Admins). */
export function Einstellungen() {
  const { user } = useSession();
  const { data, loading } = useData();
  if (user.role === "freiberufler") {
    return (
      <>
        <PageHead title="Einstellungen" />
        <Card>
          <EmptyState icon={<Lock size={18} />} title="Nur für Mitarbeiter" text="Die Einstellungen des Büros sind für Freiberufler nicht freigegeben." />
        </Card>
      </>
    );
  }
  return (
    <>
      <PageHead title="Einstellungen" sub="Daten des Büros. Weitere Einstellungen folgen." />
      <div className="stack settings-page">
        {loading || !data ? (
          <Card>
            <CardBody>
              <Skeleton h={160} />
            </CardBody>
          </Card>
        ) : (
          <BueroKarte buero={data.buero} admin={user.role === "admin"} />
        )}
        <Card>
          <EmptyState icon={<Hammer size={18} />} title="Weitere Einstellungen folgen" text="Benutzer, Ordnervorlage und Schwellen des Agenten kommen in einem späteren Schritt." />
        </Card>
      </div>
    </>
  );
}

function BueroKarte({ buero, admin }: { buero: BueroDaten | null; admin: boolean }) {
  const { mutate } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const leer: BueroDaten = { name: null, anschrift: null, tel: null, mobil: null, email: null };
  const [v, setV] = useState<BueroDaten>(buero ?? leer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await mutate((r) => r.saveBueroDaten(v));
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast("Bürodaten gespeichert", "ok");
    setEditing(false);
  }

  return (
    <Card>
      <CardHead
        title="Bürodaten"
        icon={<Building2 size={16} />}
        sub="Stehen im Planungsprotokoll beim Architekten. Ein Sachbearbeiter im Projekt ersetzt Tel., Mobil und E-Mail."
        actions={
          admin && !editing ? (
            <IconButton
              size="sm"
              label="Bürodaten bearbeiten"
              onClick={() => {
                setV(buero ?? leer);
                setEditing(true);
              }}
            >
              <Pencil size={14} />
            </IconButton>
          ) : undefined
        }
      />
      <CardBody>
        {editing ? (
          <form className="edit-form" onSubmit={(e) => void submit(e)} noValidate onKeyDown={(e) => e.key === "Escape" && !busy && setEditing(false)}>
            {FELDER.map((f, i) => (
              <Field key={f.key} label={f.label} htmlFor={`buero-${f.key}`}>
                <Input id={`buero-${f.key}`} type={f.type} value={v[f.key] ?? ""} placeholder={f.placeholder} autoFocus={i === 0} autoComplete="off" onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
              </Field>
            ))}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="edit-actions">
              <Button size="sm" onClick={() => setEditing(false)} disabled={busy}>
                Abbrechen
              </Button>
              <Button size="sm" variant="primary" type="submit" disabled={busy}>
                {busy ? "Speichert …" : "Speichern"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="dl">
              {FELDER.map((f) => (
                <div className="dl-row" key={f.key}>
                  <dt>{f.label}</dt>
                  <dd>{buero?.[f.key] || <span className="muted">–</span>}</dd>
                </div>
              ))}
            </dl>
            {!admin && (
              <p className="muted locked">
                <Lock size={13} aria-hidden /> Ändern können nur Admins.
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
