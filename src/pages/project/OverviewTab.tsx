import { Lock } from "lucide-react";
import { Card, CardBody, CardHead } from "../../components/ui";
import { formatMonth } from "../../lib/format";
import type { BauherrContact, Dataset, PartyRole, Project } from "../../lib/types";

const PARTY_LABEL: Record<PartyRole, string> = {
  vermesser: "Vermesser",
  erdbauer: "Erdbauer",
  strom: "Strom",
  wasser: "Wasser",
  elektriker_baustrom: "Elektriker Baustrom",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dl-row">
      <dt>{label}</dt>
      <dd>{children || <span className="muted">–</span>}</dd>
    </div>
  );
}

/** Übersicht: Projektdaten und Projektbeteiligte (Felder wie in Liste.docx). */
export function OverviewTab({ project, data, contact, staff }: { project: Project; data: Dataset; contact: BauherrContact | null; staff: boolean }) {
  const company = data.companies.find((c) => c.id === project.companyId);
  const sales = data.salespeople.find((s) => s.id === project.salespersonId);
  const member = (id: string | null) => data.team.find((t) => t.id === id);
  const architect = member(project.architectId);
  const planer = member(project.planerId);
  const parties = data.parties.filter((p) => p.projectId === project.id);

  return (
    <div className="grid-2">
      <Card>
        <CardHead title="Projektbeteiligte" sub="Wie in Liste.docx (01 Projektbeteiligte)" />
        <CardBody>
          <dl className="dl">
            <Row label="ABM-Nr.">{project.abmNr}</Row>
            <Row label="Hausbau-Nr.">{project.hausbauNr}</Row>
            <Row label="Bauherr">{contact ? contact.name : project.bauherrLabel}</Row>
            <Row label="Bauadresse">
              {staff ? (
                contact?.buildingAddress
              ) : (
                <span className="muted locked">
                  <Lock size={12} aria-hidden /> nur für Mitarbeiter
                </span>
              )}
            </Row>
            <Row label="Verkäufer">{sales ? `${sales.name}${company ? ` (${company.name})` : ""}` : null}</Row>
            {(Object.keys(PARTY_LABEL) as PartyRole[]).map((role) => {
              const p = parties.find((x) => x.role === role);
              return (
                <Row key={role} label={PARTY_LABEL[role]}>
                  {p && (
                    <>
                      {p.name}
                      {p.contact && <span className="cell-sub">{p.contact}</span>}
                    </>
                  )}
                </Row>
              );
            })}
          </dl>
        </CardBody>
      </Card>

      <div className="stack">
        <Card>
          <CardHead title="Projektdaten" />
          <CardBody>
            <dl className="dl">
              <Row label="Art">{project.kind === "bauvoranfrage" ? "Bauvoranfrage" : "Neubau"}</Row>
              <Row label="Hausbaufirma">{company?.name}</Row>
              <Row label="Bauort">{project.location}</Row>
              <Row label="Architekt">{architect ? `${architect.name}${architect.code ? ` (${architect.code})` : ""}` : null}</Row>
              <Row label="Planer">{planer?.name}</Row>
              <Row label="Eingang">{project.intakeMonth ? formatMonth(project.intakeMonth) : null}</Row>
              <Row label="Baubetreuung">{project.baubetreuung}</Row>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHead title="Kontakt Bauherr" />
          <CardBody>
            {staff && contact ? (
              <dl className="dl">
                <Row label="Name">{contact.name}</Row>
                <Row label="Anschrift">{contact.address}</Row>
                <Row label="Telefon">{contact.phone}</Row>
                <Row label="E-Mail">{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}</Row>
              </dl>
            ) : (
              <p className="muted locked">
                <Lock size={13} aria-hidden /> Kontaktdaten der Bauherren sind nur für Mitarbeiter sichtbar.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
