import { Hammer } from "lucide-react";
import { PageHead } from "../components/layout/PageHead";
import { Card, EmptyState } from "../components/ui";

/** Platzhalter für Seiten, die in einem späteren Bauschritt entstehen. */
export function Placeholder({ title, step, sub }: { title: string; step: string; sub?: string }) {
  return (
    <>
      <PageHead title={title} sub={sub} />
      <Card>
        <EmptyState icon={<Hammer size={18} />} title="Diese Seite entsteht gerade" text={`Geplant in BUILD.md, ${step}.`} />
      </Card>
    </>
  );
}
