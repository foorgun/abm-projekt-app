import { FilePlus2 } from "lucide-react";
import { VERTRAGSART_LABEL } from "../lib/extract/types";
import { formatBytes, formatRelative } from "../lib/format";
import { useData } from "../lib/store";
import type { ProjectDraftRecord } from "../lib/types";
import { useNewProject } from "./NewProjectDialog";
import { useToast } from "./Toast";
import { Button, Card, CardHead } from "./ui";

/** Offene Entwürfe "Neues Projekt aus Dokument": fortsetzen (Prüfmaske) oder verwerfen. */
export function DraftsCard({ drafts, title = "Neues Projekt vorgeschlagen" }: { drafts: ProjectDraftRecord[]; title?: string }) {
  const { mutate } = useData();
  const toast = useToast();
  const openNewProject = useNewProject();

  async function discard(d: ProjectDraftRecord) {
    const res = await mutate((r) => r.discardProjectDraft(d.id));
    toast(res.ok ? "Entwurf verworfen" : res.error, res.ok ? "ok" : "danger");
  }

  return (
    <Card>
      <CardHead
        icon={<FilePlus2 size={16} />}
        title={title}
        sub={drafts.length === 1 ? "Ein Vertrag wartet auf die Prüfung." : `${drafts.length} Verträge warten auf die Prüfung.`}
      />
      <div className="card-body flush">
        {drafts.map((d) => {
          const name = d.form.project.bauherrLabel?.trim();
          return (
            <div key={d.id} className="draft-row">
              <div className="draft-main">
                <span className="draft-title">{name ? `Bauherr ${name}` : "Bauherr noch offen"}</span>
                <span className="draft-sub">
                  {VERTRAGSART_LABEL[d.docType]} · {d.file.name} ({formatBytes(d.file.size)}) · {d.createdBy ?? "Unbekannt"}, {formatRelative(d.createdAt)}
                </span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void discard(d)}>
                Verwerfen
              </Button>
              <Button size="sm" variant="primary" onClick={() => openNewProject(d.id)}>
                Prüfen und anlegen
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
