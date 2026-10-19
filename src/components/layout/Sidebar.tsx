import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, ChevronsUpDown, LogOut, RotateCcw, UserRound } from "lucide-react";
import logo from "../../assets/abm-logo.png";
import { homePath, isPilot } from "../../lib/appMode";
import { ROLE_LABEL, useSession, type AppRole } from "../../lib/session";
import { useData } from "../../lib/store";
import { useToast } from "../Toast";
import { Avatar, Badge, Button, Dialog, IconButton, Menu } from "../ui";
import { COUNT_HINT, visibleNav, type CountKey } from "./nav";

export function Sidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
  counts,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: () => void;
  counts: Partial<Record<CountKey, number>>;
}) {
  const { user, setRole, demo, signOut } = useSession();
  const { repo, mutate } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [confirmReset, setConfirmReset] = useState(false);
  const roles: AppRole[] = ["admin", "mitarbeiter", "freiberufler"];
  const canReset = repo.mode === "demo" && Boolean(repo.resetDemo);
  const pilot = isPilot();
  const nav = visibleNav(user.role, pilot);

  async function resetDemo() {
    setConfirmReset(false);
    const res = await mutate((r) => r.resetDemo!());
    if (!res.ok) return toast(res.error, "danger");
    setRole("admin");
    navigate(homePath(pilot));
    onNavigate();
    toast("Demo zurückgesetzt: alle Änderungen verworfen");
  }

  return (
    <aside className="sidebar" aria-label="Hauptnavigation">
      <div className="sidebar-top">
        <NavLink to={homePath(pilot)} className="sidebar-logo" onClick={onNavigate} aria-label={pilot ? "ABM – zur Projektliste" : "ABM – zum Dashboard"}>
          <img src={logo} alt="ABM Architektur und Baumanagement" />
          <span className="sidebar-logo-mark" aria-hidden>
            ABM
          </span>
        </NavLink>
        <IconButton
          className="sidebar-collapse"
          size="sm"
          label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
          onClick={onToggleCollapse}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </IconButton>
      </div>

      <nav className="sidebar-scroll">
        {nav.groups.map((group) => {
          const items = group.items;
          return (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              <ul className="nav-list">
                {items.map((item) => {
                  const Icon = item.icon;
                  const count = item.count ? counts[item.count] : undefined;
                  if (item.soon) {
                    return (
                      <li key={item.to}>
                        <span className="nav-item" aria-disabled="true" title={`${item.label} – kommt bald`}>
                          <Icon size={18} aria-hidden />
                          <span className="nav-label">{item.label}</span>
                          <span className="nav-soon">bald</span>
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        className="nav-item"
                        onClick={onNavigate}
                        title={collapsed ? (count ? `${item.label}: ${count} ${COUNT_HINT[item.count!]}` : item.label) : undefined}
                      >
                        <Icon size={18} aria-hidden />
                        <span className="nav-label">{item.label}</span>
                        {count ? (
                          <Badge
                            tone={item.count === "review" ? "warn" : "accent"}
                            label={`${count} ${COUNT_HINT[item.count!]}`}
                            title={`${count} ${COUNT_HINT[item.count!]}`}
                          >
                            {count}
                          </Badge>
                        ) : null}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-meta">
          {nav.meta.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className="nav-item" onClick={onNavigate} title={item.label}>
                <Icon size={18} aria-hidden />
                <span className="nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
        <Menu
          side="top"
          align="left"
          header={<div className="menu-label">{demo ? "Rolle ansehen als (Demo)" : user.email ?? user.name}</div>}
          items={[
            // Rollenwechsel gibt es nur in der Demo: im Echtbetrieb kommt die Rolle aus der Datenbank
            ...(demo
              ? roles.map((r) => ({
                  label: `${ROLE_LABEL[r]}${r === user.role ? " ✓" : ""}`,
                  icon: <UserRound size={14} />,
                  onSelect: () => setRole(r),
                }))
              : [{ label: "Abmelden", icon: <LogOut size={14} />, onSelect: () => void signOut() }]),
            ...(canReset ? (["sep", { label: "Demo zurücksetzen", icon: <RotateCcw size={14} />, onSelect: () => setConfirmReset(true) }] as const) : []),
          ]}
          trigger={(p) => (
            <button type="button" className="user-card" {...p} aria-label={`${user.name}, ${ROLE_LABEL[user.role]}. Benutzermenü`}>
              <Avatar name={user.name} />
              <span className="user-card-text">
                <span className="user-card-name">{user.name}</span>
                <span className="user-card-role">{ROLE_LABEL[user.role]}</span>
              </span>
              <ChevronsUpDown size={14} aria-hidden />
            </button>
          )}
        />
        <div className="sidebar-version">v0.1 – {repo.mode === "demo" ? "Prototyp · Demo-Daten" : "Pilot"}</div>
      </div>
      {confirmReset && (
        <Dialog
          title="Demo zurücksetzen?"
          onClose={() => setConfirmReset(false)}
          footer={
            <>
              <Button onClick={() => setConfirmReset(false)}>Abbrechen</Button>
              <Button variant="primary" icon={<RotateCcw size={15} />} onClick={() => void resetDemo()}>
                Zurücksetzen
              </Button>
            </>
          }
        >
          <p>Alle Änderungen dieser Vorführung werden verworfen: gesetzte Schritte, hochgeladene Dateien, Aufgaben, Agent-Läufe und Regeln. Die erfundenen Ausgangsdaten werden neu geladen.</p>
        </Dialog>
      )}
    </aside>
  );
}
