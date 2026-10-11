import { BookOpen } from "lucide-react";
import { PageHead } from "../components/layout/PageHead";
import { PilotIntroContent, useShowPilotIntro } from "../components/PilotIntro";
import { Button, Card, CardBody, CardHead } from "../components/ui";
import { useSession } from "../lib/session";

/** Hilfe: der Pilot-Hinweis und die Einführung zum Nachlesen. */
export function Help() {
  const { demo } = useSession();
  const showIntro = useShowPilotIntro();
  return (
    <>
      <PageHead title="Hilfe" sub={demo ? "Vorführung mit erfundenen Daten. Nichts wird gespeichert." : "Pilotbetrieb der ABM Projekt-App"} />
      <Card>
        <CardHead
          title="Worum es im Pilot geht"
          actions={
            demo ? undefined : (
              <Button size="sm" variant="outline" icon={<BookOpen size={14} />} onClick={showIntro}>
                Einführung noch einmal zeigen
              </Button>
            )
          }
        />
        <CardBody>
          <PilotIntroContent />
        </CardBody>
      </Card>
    </>
  );
}
