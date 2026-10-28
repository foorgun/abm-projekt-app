import { useId, useState, type FormEvent } from "react";
import { Building2, Hammer, Hash, Lock, Pencil, Plus, SunMoon } from "lucide-react";
import { ExtractionCostsCard } from "../components/ExtractionCostsCard";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import { Button, Card, CardBody, CardHead, EmptyState, Field, IconButton, Input, Select, SettingRow, Skeleton } from "../components/ui";
import { cleanPrefix } from "../lib/abmNr";
import { isPilot } from "../lib/appMode";
import { cleanMasterName } from "../lib/projectForm";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import { readThemePref, setThemePref, THEME_OPTIONS, type ThemePref } from "../lib/theme";
import type { BueroDaten, Company } from "../lib/types";

const FELDER: { key: keyof BueroDaten; label: string; type?: string; placeholder?: string }[] = [
  { key: "name", label: "Name des Büros", placeholder: "z. B. ABM Architektur und Baumanagement" },
  { key: "anschrift", label: "Anschrift", placeholder: "Straße, PLZ Ort" },
  { key: "tel", label: "Telefon", type: "tel" },
  { key: "mobil", label: "Mobil", type: "tel" },
  { key: "email", label: "E-Mail", type: "email" },
];

/**
 * Einstellungen: Darstellung (jede Rolle, gilt für diesen Browser) und Bürodaten für das Planungsprotokoll
 * (lesen Admin und Mitarbeiter, ändern nur Admins).
 */
export function Einstellungen() {
  const { user } = useSession();
  const { data, loading } = useData();
  if (user.role === "freiberufler") {
    return (
      <>
        <PageHead title="Einstellungen" />
        <div className="stack settings-page">
          <DarstellungKarte />
          <Card>
            <EmptyState icon={<Lock size={18} />} title="Bürodaten nur für Mitarbeiter" text="Die Einstellungen des Büros sind für Freiberufler nicht freigegeben." />
          </Card>
        </div>
      </>
    );
  }
  return (
    <>
      <PageHead title="Einstellungen" sub="Darstellung und Daten des Büros. Weitere Einstellungen folgen." />
      <div className="stack settings-page">
        <DarstellungKarte />
        {loading || !data ? (
          <Card>
            <CardBody>
              <Skeleton h={160} />
            </CardBody>
          </Card>
        ) : (
          <>
            <BueroKarte buero={data.buero} admin={user.role === "admin"} />
            <NummernkreisKarte companies={data.companies} admin={user.role === "admin"} />
            {user.role === "admin" && <ExtractionCostsCard />}
          </>
        )}
        {!isPilot() && (
          <Card>
            <EmptyState icon={<Hammer size={18} />} title="Weitere Einstellungen folgen" text="Benutzer, Ordnervorlage und Schwellen des Agenten kommen in einem späteren Schritt." />
          </Card>
        )}
      </div>
    </>
  );
}

/** Hell, Dunkel oder wie das System. Wird sofort angewendet und im Browser gespeichert (kein Profil in der Datenbank). */
export function DarstellungKarte() {
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const id = useId();
  return (
    <Card>
      <SettingRow
        icon={<SunMoon size={16} />}
        title={<label htmlFor={id}>Darstellung</label>}
        description="Gilt für diesen Browser. „System“ folgt der Einstellung des Geräts."
        action={
          <Select
            id={id}
            value={pref}
            options={THEME_OPTIONS}
            onChange={(e) => {
              const next = e.target.value as ThemePref;
              setPref(next);
              setThemePref(next);
            }}
          />
        }
      />
    </Card>
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

/**
 * Hausbaufirmen und ihre Nummernkreise (erste vier Ziffern der ABM-Nr.). Daraus schlägt die App die nächste ABM-Nr. vor
 * und erkennt die Firma an der Nummer. Lesen Admin und Mitarbeiter, ändern und ergänzen nur Admins (Migration 0017).
 */
function NummernkreisKarte({ companies, admin }: { companies: Company[]; admin: boolean }) {
  const { mutate } = useData();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [prefixes, setPrefixes] = useState<Record<string, string>>({});
  const [neu, setNeu] = useState({ name: "", prefix: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sorted = [...companies].sort((a, b) => (a.numberPrefix ?? "9999").localeCompare(b.numberPrefix ?? "9999") || a.name.localeCompare(b.name, "de"));

  function start() {
    setPrefixes(Object.fromEntries(companies.map((c) => [c.id, c.numberPrefix ?? ""])));
    setNeu({ name: "", prefix: "" });
    setError(null);
    setEditing(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Prüfen gegen den Stand NACH allen Änderungen (zwei Firmen dürfen ihre Nummernkreise tauschen, nur nicht doppelt)
    const after = companies.map((c) => ({ ...c, numberPrefix: prefixes[c.id]?.trim() || null }));
    const changed = companies.filter((c) => (prefixes[c.id]?.trim() || null) !== c.numberPrefix);
    for (const c of changed) {
      const p = cleanPrefix(prefixes[c.id] ?? "", c.id, after);
      if (!p.ok) return setError(`${c.name}: ${p.reason}`);
    }
    const addName = neu.name.trim();
    if (!addName && neu.prefix.trim()) return setError("Für den neuen Nummernkreis den Namen der Hausbaufirma eintragen.");
    if (addName) {
      const n = cleanMasterName(addName, companies.map((c) => c.name));
      if (!n.ok) return setError(n.reason);
      const p = cleanPrefix(neu.prefix, null, after);
      if (!p.ok) return setError(`${addName}: ${p.reason}`);
    }
    setBusy(true);
    // Erst leeren, dann setzen: so stört ein Tausch nicht an der Eindeutigkeit in der Datenbank
    for (const c of changed.filter((x) => x.numberPrefix)) {
      const res = await mutate((r) => r.setCompanyPrefix(c.id, null));
      if (!res.ok) return (setBusy(false), setError(res.error));
    }
    for (const c of changed) {
      const value = prefixes[c.id]?.trim() || null;
      if (!value) continue;
      const res = await mutate((r) => r.setCompanyPrefix(c.id, value));
      if (!res.ok) return (setBusy(false), setError(res.error));
    }
    if (addName) {
      const res = await mutate((r) => r.createCompany(addName, neu.prefix.trim() || null));
      if (!res.ok) return (setBusy(false), setError(res.error));
    }
    setBusy(false);
    toast("Nummernkreise gespeichert", "ok");
    setEditing(false);
  }

  return (
    <Card>
      <CardHead
        title="Hausbaufirmen und Nummernkreise"
        icon={<Hash size={16} />}
        sub="Die ersten vier Ziffern der ABM-Nr. (z. B. 8161-1588) bestimmen die Hausbaufirma und die nächste Nummer."
        actions={
          admin && !editing ? (
            <IconButton size="sm" label="Nummernkreise bearbeiten" onClick={start}>
              <Pencil size={14} />
            </IconButton>
          ) : undefined
        }
      />
      <CardBody>
        {editing ? (
          <form className="edit-form" onSubmit={(e) => void submit(e)} noValidate onKeyDown={(e) => e.key === "Escape" && !busy && setEditing(false)}>
            {sorted.map((c, i) => (
              <Field key={c.id} label={c.name} htmlFor={`nk-${c.id}`}>
                <Input
                  id={`nk-${c.id}`}
                  value={prefixes[c.id] ?? ""}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="z. B. 8161"
                  autoFocus={i === 0}
                  autoComplete="off"
                  onChange={(e) => setPrefixes({ ...prefixes, [c.id]: e.target.value })}
                />
              </Field>
            ))}
            <div className="dialog-row">
              <Field label="Weitere Hausbaufirma" htmlFor="nk-neu-name">
                <Input id="nk-neu-name" value={neu.name} placeholder="Name" autoComplete="off" onChange={(e) => setNeu({ ...neu, name: e.target.value })} />
              </Field>
              <Field label="Nummernkreis" htmlFor="nk-neu-prefix">
                <Input id="nk-neu-prefix" value={neu.prefix} inputMode="numeric" maxLength={4} placeholder="vier Ziffern" autoComplete="off" onChange={(e) => setNeu({ ...neu, prefix: e.target.value })} />
              </Field>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="edit-actions">
              <Button size="sm" onClick={() => setEditing(false)} disabled={busy}>
                Abbrechen
              </Button>
              <Button size="sm" variant="primary" type="submit" disabled={busy} icon={neu.name.trim() ? <Plus size={14} /> : undefined}>
                {busy ? "Speichert …" : "Speichern"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="dl">
              {sorted.map((c) => (
                <div className="dl-row" key={c.id}>
                  <dt>{c.name}</dt>
                  <dd>{c.numberPrefix ?? <span className="muted">–</span>}</dd>
                </div>
              ))}
            </dl>
            {!admin && (
              <p className="muted locked">
                <Lock size={13} aria-hidden /> Ändern und ergänzen können nur Admins.
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
