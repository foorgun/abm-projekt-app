import { PageHead } from "../components/layout/PageHead";
import { Card, CardBody, KpiSkeleton, Skeleton, TableSkeleton } from "../components/ui";
import { formatLongDate, todayIso } from "../lib/format";
import { greeting } from "../lib/greeting";
import { useSession } from "../lib/session";

/** Schritt 1: Ladezustand des Dashboards. Inhalte folgen in Schritt 3. */
export function Dashboard() {
  const { user } = useSession();
  return (
    <>
      <PageHead title={`${greeting()}, ${user.name.split(" ")[0]}`} sub={formatLongDate(todayIso())} />
      <div className="stack">
        <div className="grid-kpi">
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
          <KpiSkeleton />
        </div>
        <div className="grid-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardBody>
                <div className="stack">
                  <Skeleton w="40%" h={14} />
                  <Skeleton h={200} />
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
        <Card>
          <CardBody>
            <Skeleton w="30%" h={14} />
          </CardBody>
          <TableSkeleton rows={5} cols={4} />
        </Card>
      </div>
    </>
  );
}
