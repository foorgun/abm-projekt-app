// Erfundene Urlaubsanträge und Krankmeldungen für die Demo: Anträge in allen vier Stati und eine Krankmeldung.
// Dieselben Muster nutzt der Demo-Modus (mit erfundenen Personen) und npm run seed:demo (dort hängen sie an den
// vorhandenen Konten mit Rolle Admin oder Mitarbeiter und tragen is_demo = true).

import { addDays } from "../lib/format";
import { montagVon } from "../lib/termine";
import { werktage } from "../lib/abwesenheit/werktage";
import type { Abwesenheit, StaffMember, UrlaubsAnspruch } from "../lib/types";

/** Erfundene Personen im Demo-Modus. Die Rolle der Sitzung bestimmt, wer "ich" ist (DEMO_ME). */
export const DEMO_STAFF: StaffMember[] = [
  { id: "u-admin", name: "Mehmet Cetin", role: "admin" },
  { id: "u-admin2", name: "Robert Aigner", role: "admin" },
  { id: "u-ma", name: "Jana Albrecht", role: "mitarbeiter" },
  { id: "u-ma2", name: "Timo Brandl", role: "mitarbeiter" },
];

/** Wer im Demo-Modus "ich" ist, je nach gewählter Rolle. Freiberufler haben keinen Zugang. */
export const DEMO_ME: Record<string, string | null> = { admin: "u-admin", mitarbeiter: "u-ma", freiberufler: null };

export interface AbsencePattern {
  /** Index der Person (0 = erste, 1 = zweite, …) */
  person: number;
  art: Abwesenheit["art"];
  von: string;
  bis: string | null;
  status: Abwesenheit["status"];
  notiz: string | null;
  /** Index der Person, die entschieden hat */
  entscheider: number | null;
  ablehnGrund: string | null;
}

/**
 * Muster relativ zu `heute`. Personen 0 und 1 sind (soweit vorhanden) Admins, 2 und 3 Mitarbeiter; gibt es weniger
 * Personen, entfallen deren Einträge. Entscheidungen stammen immer von einer ANDEREN Person als der betroffenen.
 */
export function absencePatterns(heute: string): AbsencePattern[] {
  const woche = (n: number) => montagVon(addDays(heute, n * 7));
  const mo = (n: number) => woche(n);
  const fr = (n: number) => addDays(woche(n), 4);
  const u = (person: number, von: string, bis: string, status: Abwesenheit["status"], notiz: string | null, entscheider: number | null, ablehnGrund: string | null = null): AbsencePattern => ({
    person,
    art: "urlaub",
    von,
    bis,
    status,
    notiz,
    entscheider,
    ablehnGrund,
  });
  return [
    // Person 2 (Mitarbeiterin): alle vier Stati
    u(2, mo(-9), fr(-8), "genehmigt", "Sommerurlaub", 0),
    u(2, mo(3), fr(3), "offen", "Herbstferien", null),
    u(2, mo(-3), addDays(mo(-3), 1), "abgelehnt", null, 1, "Bauabnahme in dieser Woche"),
    u(2, mo(6), addDays(mo(6), 2), "zurueckgezogen", null, null),
    // Person 3 (Mitarbeiter): seit gestern krank, dazu genehmigter und offener Urlaub
    { person: 3, art: "krank", von: addDays(heute, -1), bis: null, status: "genehmigt", notiz: null, entscheider: null, ablehnGrund: null },
    u(3, mo(2), fr(2), "genehmigt", null, 0),
    u(3, mo(8), fr(9), "offen", "Familienbesuch", null),
    // Person 0 (Admin): eigener offener Antrag (darf ihn nicht selbst entscheiden) und genehmigter Urlaub
    u(0, mo(5), fr(5), "offen", null, null),
    u(0, mo(-14), fr(-13), "genehmigt", null, 1),
    // Person 1 (zweiter Admin): genehmigter Urlaub, der sich mit dem offenen Antrag von Person 2 überschneidet
    u(1, addDays(mo(3), 2), addDays(fr(3), 3), "genehmigt", null, 0),
  ];
}

/** Demo-Bestand für den Demo-Modus. */
export function buildDemoAbsences(heute: string): { abwesenheiten: Abwesenheit[]; urlaubsAnspruch: UrlaubsAnspruch[] } {
  const jahr = Number(heute.slice(0, 4));
  const abwesenheiten = absencePatterns(heute).map((p, i): Abwesenheit => ({
    id: `abw-${String(i + 1).padStart(2, "0")}`,
    userId: DEMO_STAFF[p.person].id,
    art: p.art,
    von: p.von,
    bis: p.bis,
    werktage: p.art === "urlaub" && p.bis ? werktage(p.von, p.bis) : null,
    status: p.status,
    notiz: p.notiz,
    entscheidungVon: p.entscheider === null ? null : DEMO_STAFF[p.entscheider].name,
    entscheidungAm: p.entscheider === null ? null : `${addDays(p.von, -21)}T09:30:00`,
    ablehnGrund: p.ablehnGrund,
    createdAt: `${addDays(p.von, -28)}T08:15:00`,
  }));
  const urlaubsAnspruch = DEMO_STAFF.flatMap((s, i) => [jahr - 1, jahr, jahr + 1].map((j) => ({ userId: s.id, jahr: j, tage: 30, uebertrag: j === jahr && i === 2 ? 2 : 0 })));
  return { abwesenheiten, urlaubsAnspruch };
}

/**
 * Zeilen für die echte Datenbank (seed:demo): `userIds` sind vorhandene Konten, Admins zuerst.
 * Muster für Personen, die es nicht gibt, entfallen; fehlt der Entscheider, entscheidet eine andere vorhandene Person.
 */
export function absenceSeedRows(userIds: string[], heute: string): Record<string, string | number | boolean | null>[] {
  return absencePatterns(heute)
    .filter((p) => userIds[p.person])
    .map((p) => {
      const user = userIds[p.person];
      const decided = p.status === "genehmigt" || p.status === "abgelehnt";
      const entscheider = p.art === "krank" || !decided ? null : (userIds[p.entscheider ?? -1] ?? userIds.find((x) => x !== user) ?? null);
      return {
        user_id: user,
        art: p.art,
        von: p.von,
        bis: p.bis,
        status: p.status,
        notiz: p.notiz,
        entscheidung_von: entscheider,
        entscheidung_am: entscheider ? new Date(`${addDays(p.von, -21)}T09:30:00`).toISOString() : null,
        ablehn_grund: p.ablehnGrund,
        is_demo: true,
      };
    });
}

/**
 * Dasselbe als SQL für den SQL-Editor (seed:demo -- --sql): hängt die Muster an die vorhandenen Konten mit Rolle Admin
 * oder Mitarbeiter (Admins zuerst, dann nach Benutzer-ID). Ohne solche Konten wird nichts eingefügt.
 */
export function absenceSeedSql(heute: string): string {
  const q = (v: string | null) => (v === null ? "null" : `'${v.replace(/'/g, "''")}'`);
  const values = absencePatterns(heute)
    .map((p) => `    (${p.person}, ${q(p.art)}, ${q(p.von)}, ${q(p.bis)}, ${q(p.status)}, ${q(p.notiz)}, ${p.entscheider ?? "null"}, ${q(p.ablehnGrund)})`)
    .join(",\n");
  return `-- Erfundene Urlaubsanträge und Krankmeldungen (is_demo = true) für vorhandene Konten
with staff as (
  select user_id, (row_number() over (order by (role = 'admin') desc, user_id) - 1)::int as n
  from public.user_roles where role in ('admin', 'mitarbeiter')
), v (person, art, von, bis, status, notiz, entscheider, grund) as (
  values
${values}
)
insert into public.abwesenheiten (user_id, art, von, bis, status, notiz, entscheidung_von, entscheidung_am, ablehn_grund, is_demo)
select s.user_id, v.art, v.von::date, v.bis::date, v.status, v.notiz,
       case when v.art = 'krank' or v.status not in ('genehmigt', 'abgelehnt') then null
            else coalesce(e.user_id, (select o.user_id from staff o where o.user_id <> s.user_id order by o.n limit 1)) end,
       case when v.art = 'krank' or v.status not in ('genehmigt', 'abgelehnt') then null else v.von::date - 21 + time '09:30' end,
       v.grund, true
from v join staff s on s.n = v.person left join staff e on e.n = v.entscheider;
`;
}
