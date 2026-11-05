// Weitere Bauherren (zweiter bis vierter) je Projekt: Felder und Beschriftungen an einer Stelle.
// Sie liegen bei den Kontaktdaten des ersten Bauherrn (keine eigene Entität, Migrationen 0010 und 0023).

import type { BauherrContact } from "./types";

export const WEITERE_BAUHERREN = [
  { nr: 2, label: "Zweiter Bauherr", klein: "zweiter Bauherr", hinzufuegen: "Zweiten Bauherrn hinzufügen", name: "name2", phone: "phone2", email: "email2" },
  { nr: 3, label: "Dritter Bauherr", klein: "dritter Bauherr", hinzufuegen: "Dritten Bauherrn hinzufügen", name: "name3", phone: "phone3", email: "email3" },
  { nr: 4, label: "Vierter Bauherr", klein: "vierter Bauherr", hinzufuegen: "Vierten Bauherrn hinzufügen", name: "name4", phone: "phone4", email: "email4" },
] as const;

export type WeitererBauherrKey = (typeof WEITERE_BAUHERREN)[number]["name" | "phone" | "email"];

/** Die Felder der weiteren Bauherren, soweit eingetragen (auch aus Formularständen). */
export type WeitereBauherrenWerte = Partial<Record<WeitererBauherrKey, string | null>> | Pick<BauherrContact, WeitererBauherrKey>;

/**
 * Wie viele weitere Bauherren das Formular zeigt: so viele wie angefordert, mindestens aber bis zum letzten ausgefüllten.
 * So verschwinden eingetragene Werte nie aus dem Blick, auch nicht beim Fortsetzen eines Entwurfs.
 */
export function weitereSichtbar(werte: WeitereBauherrenWerte | null | undefined, angefordert: number): number {
  let n = Math.min(Math.max(angefordert, 0), WEITERE_BAUHERREN.length);
  WEITERE_BAUHERREN.forEach((b, i) => {
    if (werte?.[b.name] || werte?.[b.phone] || werte?.[b.email]) n = Math.max(n, i + 1);
  });
  return n;
}
