import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarOff, Check, ChevronLeft, ChevronRight, ThermometerSun, X } from "lucide-react";
import { PageHead } from "../components/layout/PageHead";
import { useToast } from "../components/Toast";
import { Button, Card, CardBody, CardHead, EmptyState, ErrorState, Field, IconButton, Input, Pill, Select, Skeleton, Tabs, type Tone } from "../components/ui";
import { feiertagName } from "../lib/abwesenheit/feiertage";
import { darfEntscheiden, endeVon, gleichzeitigAbwesend, pruefeKrank, pruefeUrlaub, STATUS_LABEL, urlaubsStand, zahl } from "../lib/abwesenheit/urlaub";
import { wochentag } from "../lib/abwesenheit/werktage";
import { addDays, formatDate, formatMonth } from "../lib/format";
import { useSession } from "../lib/session";
import { useData } from "../lib/store";
import type { Abwesenheit as Eintrag, AbwesenheitStatus, Dataset, KalenderEintrag } from "../lib/types";

type Tab = "mein" | "genehmigen" | "team" | "kalender";
const STATUS_TONE: Record<AbwesenheitStatus, Tone> = { offen: "warn", genehmigt: "ok", abgelehnt: "danger", zurueckgezogen: "neutral" };
const zeitraum = (a: Pick<Eintrag, "von" | "bis">) => (a.bis ? (a.bis === a.von ? formatDate(a.von) : `${formatDate(a.von)} bis ${formatDate(a.bis)}`) : `seit ${formatDate(a.von)}`);

/**
 * Urlaub und Krankheit. Admin und Mitarbeiter: eigener Urlaubsstand, Urlaub beantragen, krank melden, Kalender.
 * Admin zusätzlich: Anträge anderer entscheiden (nie den eigenen) und Ansprüche pflegen.
 * Freiberufler haben keinen Zugang; die Datenbank liefert ihnen keine Zeile (Migration 0012).
 */
export function Abwesenheit() {
  const { data, loading, error, reload, today } = useData();
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const admin = user.role === "admin";
  const tabs: Tab[] = admin ? ["mein", "genehmigen", "team", "kalender"] : ["mein", "kalender"];
  const requested = params.get("reiter") as Tab | null;
  const tab: Tab = requested && tabs.includes(requested) ? requested : "mein";

  const head = <PageHead title="Urlaub & Krankheit" sub="Urlaub beantragen, krank melden und sehen, wer wann abwesend ist." />;

  if (user.role === "freiberufler") {
    return (
      <>
        {head}
        <Card>
          <EmptyState icon={<CalendarOff size={18} />} title="Diese Seite ist nur für Mitarbeiter sichtbar" />
        </Card>
      </>
    );
  }
  if (error) {
    return (
      <>
        {head}
        <Card>
          <ErrorState message={error} onRetry={() => void reload()} />
        </Card>
      </>
    );
  }
  if (loading || !data || !data.meId) {
    return (
      <>
        {head}
        <div className="stack" aria-busy="true">
          <Skeleton h={120} round />
          <Skeleton h={220} round />
        </div>
      </>
    );
  }

  const me = data.meId;
  const offen = data.abwesenheiten.filter((a) => a.art === "urlaub" && a.status === "offen" && a.userId !== me).length;

  return (
    <>
      {head}
      <div className="stack">
        <Tabs<Tab>
          label="Bereiche"
          value={tab}
          onChange={(t) => setParams(t === "mein" ? {} : { reiter: t }, { replace: true })}
          items={tabs.map((t) => ({ key: t, label: { mein: "Mein Urlaub", genehmigen: "Genehmigen", team: "Team", kalender: "Kalender" }[t], count: t === "genehmigen" ? offen : undefined }))}
        />
        {tab === "mein" && <MeinUrlaub data={data} me={me} today={today} />}
        {tab === "genehmigen" && admin && <Genehmigen data={data} me={me} today={today} />}
        {tab === "team" && admin && <Team data={data} today={today} />}
        {tab === "kalender" && <Kalender data={data} me={me} today={today} admin={admin} />}
      </div>
    </>
  );
}

// ------------------------------------------------------------------------------------------- Mein Urlaub

function Jahreswahl({ jahr, onChange, heute }: { jahr: number; onChange: (j: number) => void; heute: string }) {
  const aktuell = Number(heute.slice(0, 4));
  return <Select aria-label="Jahr" value={String(jahr)} onChange={(e) => onChange(Number(e.target.value))} options={[aktuell - 1, aktuell, aktuell + 1].map((j) => ({ value: String(j), label: String(j) }))} />;
}

function MeinUrlaub({ data, me, today }: { data: Dataset; me: string; today: string }) {
  const { mutate } = useData();
  const toast = useToast();
  const [jahr, setJahr] = useState(Number(today.slice(0, 4)));
  const stand = urlaubsStand(me, jahr, data.abwesenheiten, data.urlaubsAnspruch);
  const meine = data.abwesenheiten.filter((a) => a.userId === me).sort((a, b) => b.von.localeCompare(a.von));

  // --- Urlaub beantragen
  const [von, setVon] = useState("");
  const [bis, setBis] = useState("");
  const [notiz, setNotiz] = useState("");
  const [busy, setBusy] = useState(false);
  const pruefung = von && bis ? pruefeUrlaub({ userId: me, von, bis }, data.abwesenheiten, data.urlaubsAnspruch, today) : null;

  async function beantragen(e: FormEvent) {
    e.preventDefault();
    if (!pruefung || pruefung.fehler.length) return;
    setBusy(true);
    const res = await mutate((r) => r.requestUrlaub({ von, bis, notiz }));
    setBusy(false);
    toast(res.ok ? "Urlaub beantragt" : res.error, res.ok ? "ok" : "danger", res.ok ? "Der Antrag ist offen, bis ein Admin entscheidet." : undefined);
    if (res.ok) {
      setVon("");
      setBis("");
      setNotiz("");
    }
  }

  // --- Krank melden
  const [krankVon, setKrankVon] = useState(today);
  const [krankBis, setKrankBis] = useState("");
  const krankFehler = pruefeKrank({ userId: me, von: krankVon, bis: krankBis || null }, data.abwesenheiten, today);

  async function krankMelden(e: FormEvent) {
    e.preventDefault();
    if (krankFehler.length) return;
    setBusy(true);
    const res = await mutate((r) => r.reportKrank({ von: krankVon, bis: krankBis || null }));
    setBusy(false);
    toast(res.ok ? "Krankmeldung gespeichert" : res.error, res.ok ? "ok" : "danger", res.ok ? "Gute Besserung. Die Krankschreibung (AU) bitte wie gewohnt beim Büro einreichen." : undefined);
    if (res.ok) setKrankBis("");
  }

  return (
    <>
      <Card>
        <CardHead title="Mein Urlaub" sub={stand.uebertrag ? `Anspruch ${zahl(stand.anspruch)} Tage plus ${zahl(stand.uebertrag)} Übertrag aus dem Vorjahr` : undefined} actions={<Jahreswahl jahr={jahr} onChange={setJahr} heute={today} />} />
        <CardBody>
          <dl className="abw-stand">
            <div>
              <dt>Anspruch</dt>
              <dd>{zahl(stand.anspruch + stand.uebertrag)}</dd>
            </div>
            <div>
              <dt>Genommen</dt>
              <dd>{zahl(stand.genommen)}</dd>
            </div>
            <div>
              <dt>Beantragt (offen)</dt>
              <dd>{zahl(stand.beantragt)}</dd>
            </div>
            <div data-rest>
              <dt>Resttage {jahr}</dt>
              <dd data-negativ={stand.rest < 0 || undefined}>{zahl(stand.rest)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="grid-2 grid-top">
        <Card>
          <CardHead title="Urlaub beantragen" />
          <CardBody>
            <form className="dialog-form" onSubmit={beantragen} noValidate>
              <div className="dialog-row">
                <Field label="Von" htmlFor="urlaub-von">
                  <Input id="urlaub-von" type="date" value={von} onChange={(e) => (setVon(e.target.value), !bis && setBis(e.target.value))} />
                </Field>
                <Field label="Bis (einschließlich)" htmlFor="urlaub-bis">
                  <Input id="urlaub-bis" type="date" value={bis} min={von || undefined} onChange={(e) => setBis(e.target.value)} />
                </Field>
              </div>
              <p className="abw-werktage" aria-live="polite">
                {pruefung && !pruefung.fehler.some((f) => /Ende|Bitte/.test(f)) ? (
                  <>
                    = <strong>{zahl(pruefung.werktage)}</strong> {pruefung.werktage === 1 ? "Werktag" : "Werktage"} <span className="muted">(ohne Wochenenden und Feiertage in Baden-Württemberg)</span>
                  </>
                ) : (
                  <span className="muted">Zeitraum wählen, dann stehen hier die Werktage.</span>
                )}
              </p>
              <Field label="Notiz (optional)" htmlFor="urlaub-notiz">
                <Input id="urlaub-notiz" value={notiz} maxLength={500} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Vertretung abgesprochen mit …" autoComplete="off" />
              </Field>
              {pruefung?.fehler.map((f) => (
                <p key={f} className="form-error" role="alert">
                  {f}
                </p>
              ))}
              {pruefung?.warnungen.map((w) => (
                <p key={w} className="form-note" role="status">
                  Hinweis: {w} Der Antrag lässt sich trotzdem stellen.
                </p>
              ))}
              <div className="edit-actions">
                <Button variant="primary" type="submit" disabled={busy || !pruefung || pruefung.fehler.length > 0}>
                  Urlaub beantragen
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHead title="Krank melden" icon={<ThermometerSun size={16} />} />
          <CardBody>
            <form className="dialog-form" onSubmit={krankMelden} noValidate>
              <div className="dialog-row">
                <Field label="Krank ab" htmlFor="krank-von">
                  <Input id="krank-von" type="date" value={krankVon} onChange={(e) => setKrankVon(e.target.value)} />
                </Field>
                <Field label="Bis (optional)" htmlFor="krank-bis" hint="Leer lassen, solange du noch krank bist.">
                  <Input id="krank-bis" type="date" value={krankBis} min={krankVon || undefined} onChange={(e) => setKrankBis(e.target.value)} />
                </Field>
              </div>
              <p className="form-note">Bitte keine Diagnose angeben. Die Krankmeldung gilt sofort, ohne Genehmigung. Eine Krankschreibung (AU) bitte wie gewohnt beim Büro einreichen.</p>
              {krankFehler.map((f) => (
                <p key={f} className="form-error" role="alert">
                  {f}
                </p>
              ))}
              <div className="edit-actions">
                <Button type="submit" disabled={busy || krankFehler.length > 0}>
                  Krank melden
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHead title="Meine Anträge und Krankmeldungen" />
        <div className="card-body flush">
          {meine.length ? (
            <ul className="list">
              {meine.map((a) => (
                <EigenerEintrag key={a.id} a={a} today={today} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<CalendarOff size={18} />} title="Noch keine Einträge" />
          )}
        </div>
      </Card>
    </>
  );
}

function EigenerEintrag({ a, today }: { a: Eintrag; today: string }) {
  const { mutate } = useData();
  const toast = useToast();
  const [bis, setBis] = useState(today);

  async function zurueckziehen() {
    const res = await mutate((r) => r.withdrawUrlaub(a.id));
    toast(res.ok ? "Antrag zurückgezogen" : res.error, res.ok ? "ok" : "danger");
  }
  async function gesund() {
    const res = await mutate((r) => r.setKrankBis(a.id, bis));
    toast(res.ok ? "Ende der Krankmeldung eingetragen" : res.error, res.ok ? "ok" : "danger");
  }

  return (
    <li className="list-item abw-zeile">
      <span className="list-item-main">
        <span className="list-item-title">
          {a.art === "urlaub" ? "Urlaub" : "Krank"} · {zeitraum(a)}
          {a.art === "urlaub" && a.werktage != null && ` · ${zahl(a.werktage)} ${a.werktage === 1 ? "Werktag" : "Werktage"}`}
        </span>
        <span className="list-item-sub">
          {[a.notiz, a.status === "abgelehnt" && (a.ablehnGrund ? `Abgelehnt: ${a.ablehnGrund}` : "Abgelehnt ohne Begründung"), a.entscheidungVon && `entschieden von ${a.entscheidungVon}`, a.art === "krank" && !a.bis && "noch krank"]
            .filter(Boolean)
            .join(" · ") || " "}
        </span>
      </span>
      {a.art === "urlaub" ? <Pill tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Pill> : <Pill tone="info">krank</Pill>}
      {a.art === "urlaub" && a.status === "offen" && (
        <Button size="sm" onClick={() => void zurueckziehen()}>
          Zurückziehen
        </Button>
      )}
      {a.art === "krank" && !a.bis && (
        <span className="abw-gesund">
          <Input type="date" aria-label="Letzter Krankheitstag" value={bis} min={a.von} onChange={(e) => setBis(e.target.value)} />
          <Button size="sm" onClick={() => void gesund()} disabled={!bis || bis < a.von} title="Letzten Krankheitstag eintragen (wieder gesund ab dem Tag danach)">
            Wieder gesund
          </Button>
        </span>
      )}
    </li>
  );
}

// ------------------------------------------------------------------------------------------- Genehmigen (Admin)

function Genehmigen({ data, me, today }: { data: Dataset; me: string; today: string }) {
  const { user } = useSession();
  const name = (id: string) => data.mitarbeiter.find((m) => m.id === id)?.name ?? "Unbekannt";
  const offen = data.abwesenheiten.filter((a) => a.art === "urlaub" && a.status === "offen").sort((a, b) => a.von.localeCompare(b.von));
  if (!offen.length) {
    return (
      <Card>
        <EmptyState icon={<Check size={18} />} title="Keine offenen Anträge" />
      </Card>
    );
  }
  return (
    <>
      {offen.map((a) => (
        <AntragKarte key={a.id} a={a} data={data} name={name} today={today} darf={darfEntscheiden({ id: me, role: user.role }, a)} eigener={a.userId === me} />
      ))}
    </>
  );
}

function AntragKarte({ a, data, name, today, darf, eigener }: { a: Eintrag; data: Dataset; name: (id: string) => string; today: string; darf: boolean; eigener: boolean }) {
  const { mutate } = useData();
  const toast = useToast();
  const [ablehnen, setAblehnen] = useState(false);
  const [grund, setGrund] = useState("");
  const [busy, setBusy] = useState(false);
  const jahre = [...new Set([a.von.slice(0, 4), (a.bis ?? a.von).slice(0, 4)])].map(Number);
  const gleichzeitig = gleichzeitigAbwesend(a, data.abwesenheiten, today);

  async function entscheiden(status: "genehmigt" | "abgelehnt") {
    setBusy(true);
    const res = await mutate((r) => r.decideUrlaub(a.id, status, grund));
    setBusy(false);
    toast(res.ok ? (status === "genehmigt" ? "Urlaub genehmigt" : "Antrag abgelehnt") : res.error, res.ok ? "ok" : "danger");
  }

  return (
    <Card>
      <CardHead
        title={name(a.userId)}
        sub={`${zeitraum(a)} · ${zahl(a.werktage ?? 0)} ${a.werktage === 1 ? "Werktag" : "Werktage"}${a.notiz ? ` · „${a.notiz}“` : ""}`}
        actions={
          darf && !ablehnen ? (
            <>
              <Button size="sm" icon={<X size={14} />} onClick={() => setAblehnen(true)} disabled={busy}>
                Ablehnen
              </Button>
              <Button size="sm" variant="primary" icon={<Check size={14} />} onClick={() => void entscheiden("genehmigt")} disabled={busy}>
                Genehmigen
              </Button>
            </>
          ) : undefined
        }
      />
      <CardBody>
        <div className="stack-sm">
          <p className="abw-info">
            {jahre.map((j) => {
              const s = urlaubsStand(a.userId, j, data.abwesenheiten, data.urlaubsAnspruch);
              return (
                <span key={j}>
                  Resttage {j}: <strong data-negativ={s.rest < 0 || undefined}>{zahl(s.rest)}</strong> <span className="muted">(dieser Antrag ist schon abgezogen)</span>
                </span>
              );
            })}
          </p>
          {gleichzeitig.length > 0 ? (
            <p className="form-note" role="status">
              Im gleichen Zeitraum bereits abwesend: {gleichzeitig.map((g) => `${name(g.userId)} (${g.art === "urlaub" ? "Urlaub" : "krank"}, ${zeitraum({ von: g.von, bis: g.bis ?? endeVon(g, today) })})`).join("; ")}
            </p>
          ) : (
            <p className="muted abw-info">Niemand sonst ist in diesem Zeitraum abwesend.</p>
          )}
          {eigener && <p className="form-note">Das ist dein eigener Antrag. Entscheiden muss ihn ein anderer Admin.</p>}
          {ablehnen && (
            <form
              className="abw-ablehnen"
              onSubmit={(e) => {
                e.preventDefault();
                void entscheiden("abgelehnt");
              }}
            >
              <Field label="Begründung (optional, kurz)" htmlFor={`grund-${a.id}`}>
                <Input id={`grund-${a.id}`} value={grund} maxLength={300} onChange={(e) => setGrund(e.target.value)} autoFocus autoComplete="off" />
              </Field>
              <div className="edit-actions">
                <Button size="sm" onClick={() => setAblehnen(false)} disabled={busy}>
                  Abbrechen
                </Button>
                <Button size="sm" variant="destructive" type="submit" disabled={busy}>
                  Antrag ablehnen
                </Button>
              </div>
            </form>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------- Team (Admin)

function Team({ data, today }: { data: Dataset; today: string }) {
  const [jahr, setJahr] = useState(Number(today.slice(0, 4)));
  return (
    <Card>
      <CardHead title="Team" sub="Anspruch und Übertrag je Person. Ohne Eintrag gelten 30 Tage." actions={<Jahreswahl jahr={jahr} onChange={setJahr} heute={today} />} />
      <div className="table-wrap">
        <table className="table abw-team">
          <caption className="sr-only">Urlaubsstand {jahr} je Person</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Anspruch</th>
              <th scope="col">Übertrag Vorjahr</th>
              <th scope="col" className="num">
                Genommen
              </th>
              <th scope="col" className="num">
                Beantragt
              </th>
              <th scope="col" className="num">
                Rest
              </th>
              <th scope="col">
                <span className="sr-only">Speichern</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.mitarbeiter.map((m) => (
              <TeamZeile key={`${m.id}-${jahr}`} id={m.id} name={m.name} rolle={m.role} jahr={jahr} data={data} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TeamZeile({ id, name, rolle, jahr, data }: { id: string; name: string; rolle: string; jahr: number; data: Dataset }) {
  const { mutate } = useData();
  const toast = useToast();
  const s = urlaubsStand(id, jahr, data.abwesenheiten, data.urlaubsAnspruch);
  const [tage, setTage] = useState(String(s.anspruch));
  const [uebertrag, setUebertrag] = useState(String(s.uebertrag));
  const t = Number(tage.replace(",", "."));
  const u = Number(uebertrag.replace(",", "."));
  const gueltig = tage.trim() !== "" && uebertrag.trim() !== "" && t >= 0 && t <= 366 && u >= 0 && u <= 366;
  const geaendert = t !== s.anspruch || u !== s.uebertrag;

  async function speichern() {
    const res = await mutate((r) => r.setUrlaubsAnspruch(id, jahr, { tage: t, uebertrag: u }));
    toast(res.ok ? `Anspruch ${jahr} für ${name} gespeichert` : res.error, res.ok ? "ok" : "danger");
  }

  return (
    <tr>
      <td>
        <span className="cell-main">{name}</span>
        <span className="cell-sub">{rolle === "admin" ? "Admin" : "Mitarbeiter"}</span>
      </td>
      <td>
        <Input className="abw-zahl" inputMode="decimal" aria-label={`Anspruch ${jahr} für ${name}`} value={tage} onChange={(e) => setTage(e.target.value)} aria-invalid={!gueltig || undefined} />
      </td>
      <td>
        <Input className="abw-zahl" inputMode="decimal" aria-label={`Übertrag aus dem Vorjahr für ${name}`} value={uebertrag} onChange={(e) => setUebertrag(e.target.value)} aria-invalid={!gueltig || undefined} />
      </td>
      <td className="num">{zahl(s.genommen)}</td>
      <td className="num">{zahl(s.beantragt)}</td>
      <td className="num">
        <strong data-negativ={s.rest < 0 || undefined}>{zahl(s.rest)}</strong>
      </td>
      <td>
        <Button size="sm" onClick={() => void speichern()} disabled={!gueltig || !geaendert}>
          Speichern
        </Button>
      </td>
    </tr>
  );
}

// ------------------------------------------------------------------------------------------- Kalender

function Kalender({ data, me, today, admin }: { data: Dataset; me: string; today: string; admin: boolean }) {
  const { repo } = useData();
  const [monat, setMonat] = useState(`${today.slice(0, 7)}-01`);
  const [eintraege, setEintraege] = useState<KalenderEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [y, m] = monat.split("-").map(Number);
  const letzter = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const tage = useMemo(() => Array.from({ length: letzter }, (_, i) => addDays(monat, i)), [monat, letzter]);
  const schieben = (n: number) => setMonat(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10));

  useEffect(() => {
    let alive = true;
    setFehler(null);
    repo
      .kalenderAbwesenheiten(monat, addDays(monat, letzter - 1))
      .then((rows) => alive && setEintraege(rows))
      .catch((e) => alive && setFehler(e instanceof Error ? e.message : "Der Kalender konnte nicht geladen werden"));
    return () => {
      alive = false;
    };
    // data: nach jeder Änderung (neuer Antrag, Entscheidung) neu laden
  }, [repo, monat, letzter, data]);

  // Personen: das Team, soweit sichtbar, plus alle, die im Monat abwesend sind
  const personen = useMemo(() => {
    const map = new Map(data.mitarbeiter.map((p) => [p.id, p.name]));
    for (const e of eintraege ?? []) if (!map.has(e.userId)) map.set(e.userId, e.name);
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [data.mitarbeiter, eintraege]);

  /** Grund eines Tages: Admins sehen ihn bei allen, alle anderen nur bei sich selbst (aus den eigenen Zeilen). */
  function zelle(userId: string, tag: string): "urlaub" | "krank" | "abwesend" | null {
    const e = (eintraege ?? []).find((x) => x.userId === userId && x.von <= tag && x.bis >= tag);
    if (!e) return null;
    if (e.art) return e.art;
    if (userId === me) return data.abwesenheiten.find((a) => a.userId === me && a.status === "genehmigt" && a.von <= tag && endeVon(a, today) >= tag)?.art ?? "abwesend";
    return "abwesend";
  }
  const ZEICHEN = { urlaub: "U", krank: "K", abwesend: "•" } as const;
  const TEXT = { urlaub: "Urlaub", krank: "krank", abwesend: "abwesend" } as const;

  return (
    <Card>
      <CardHead
        title={formatMonth(monat)}
        sub={admin ? "Genehmigter Urlaub und Krankmeldungen aller Mitarbeiter." : "Wer wann abwesend ist. Den Grund siehst du nur bei dir selbst."}
        actions={
          <>
            <IconButton label="Vorheriger Monat" size="sm" onClick={() => schieben(-1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <Button size="sm" variant="ghost" onClick={() => setMonat(`${today.slice(0, 7)}-01`)} disabled={monat === `${today.slice(0, 7)}-01`}>
              Heute
            </Button>
            <IconButton label="Nächster Monat" size="sm" onClick={() => schieben(1)}>
              <ChevronRight size={16} />
            </IconButton>
          </>
        }
      />
      <CardBody>
        {fehler ? (
          <ErrorState message={fehler} />
        ) : !eintraege ? (
          <Skeleton h={160} />
        ) : (
          <>
            <div className="abw-kalender-wrap">
              <table className="abw-kalender">
                <caption className="sr-only">Abwesenheiten im {formatMonth(monat)}</caption>
                <thead>
                  <tr>
                    <th scope="col">Person</th>
                    {tage.map((t) => (
                      <th key={t} scope="col" data-frei={wochentag(t) > 5 || feiertagName(t) ? true : undefined} data-heute={t === today || undefined} title={feiertagName(t) ?? undefined}>
                        <span className="abw-wt">{["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][wochentag(t) - 1]}</span>
                        {Number(t.slice(8))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {personen.map((p) => (
                    <tr key={p.id}>
                      <th scope="row">{p.name}</th>
                      {tage.map((t) => {
                        const art = zelle(p.id, t);
                        return (
                          <td key={t} data-art={art ?? undefined} data-frei={wochentag(t) > 5 || feiertagName(t) ? true : undefined} data-heute={t === today || undefined} title={art ? `${p.name}: ${TEXT[art]} am ${formatDate(t)}` : undefined}>
                            {art && (
                              <>
                                <span aria-hidden>{ZEICHEN[art]}</span>
                                <span className="sr-only">{TEXT[art]}</span>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="termin-legende abw-legende" aria-label="Legende">
              <li>
                <span className="abw-probe" data-art="urlaub" aria-hidden>
                  U
                </span>{" "}
                Urlaub (genehmigt)
              </li>
              <li>
                <span className="abw-probe" data-art="krank" aria-hidden>
                  K
                </span>{" "}
                krank
              </li>
              {!admin && (
                <li>
                  <span className="abw-probe" data-art="abwesend" aria-hidden>
                    •
                  </span>{" "}
                  abwesend (andere, ohne Grund)
                </li>
              )}
              <li>
                <span className="abw-probe" data-frei aria-hidden />
                Wochenende oder Feiertag
              </li>
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}
