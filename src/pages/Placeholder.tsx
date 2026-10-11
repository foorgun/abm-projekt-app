import { Link } from "react-router-dom";
import { Hammer, SearchX } from "lucide-react";
import { PageHead } from "../components/layout/PageHead";
import { buttonClass, Card, EmptyState } from "../components/ui";

/** Platzhalter für Seiten, die es noch nicht gibt, und für unbekannte Adressen. */
export function Placeholder({ title, sub, notFound }: { title: string; sub?: string; notFound?: boolean }) {
  return (
    <>
      <PageHead title={title} sub={sub} />
      <Card>
        {notFound ? (
          <EmptyState icon={<SearchX size={18} />} title="Diese Seite gibt es nicht" text="Die Adresse ist falsch oder die Seite wurde verschoben." action={<Link to="/" className={buttonClass("outline", "sm")}>Zum Dashboard</Link>} />
        ) : (
          <EmptyState icon={<Hammer size={18} />} title="Diese Seite gibt es noch nicht" text="Sie kommt in einem späteren Schritt." />
        )}
      </Card>
    </>
  );
}
