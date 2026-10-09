import { NavLink } from "react-router-dom";
import { ChevronsLeft, ChevronsRight, ChevronsUpDown, CircleHelp, Settings, UserRound } from "lucide-react";
import logo from "../../assets/abm-logo.png";
import { ROLE_LABEL, useSession, type AppRole } from "../../lib/session";
import { Avatar, Badge, IconButton, Menu } from "../ui";
import { NAV, type CountKey } from "./nav";

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
  const { user, setRole, demo } = useSession();
  const roles: AppRole[] = ["admin", "mitarbeiter", "freiberufler"];

  return (
    <aside className="sidebar" aria-label="Hauptnavigation">
      <div className="sidebar-top">
        <NavLink to="/" className="sidebar-logo" onClick={onNavigate} aria-label="ABM – zum Dashboard">
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
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.hiddenFor?.includes(user.role));
          if (!items.length) return null;
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
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon size={18} aria-hidden />
                        <span className="nav-label">{item.label}</span>
                        {count ? (
                          <Badge tone={item.count === "review" ? "warn" : "accent"} label={`${count} offen`}>
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
          <NavLink to="/einstellungen" className="nav-item" onClick={onNavigate} title="Einstellungen">
            <Settings size={18} aria-hidden />
            <span className="nav-label">Einstellungen</span>
          </NavLink>
          <NavLink to="/hilfe" className="nav-item" onClick={onNavigate} title="Hilfe">
            <CircleHelp size={18} aria-hidden />
            <span className="nav-label">Hilfe</span>
          </NavLink>
        </div>
        <Menu
          side="top"
          align="left"
          header={demo ? <div className="menu-label">Rolle ansehen als (Demo)</div> : undefined}
          items={roles.map((r) => ({
            label: `${ROLE_LABEL[r]}${r === user.role ? " ✓" : ""}`,
            icon: <UserRound size={14} />,
            onSelect: () => setRole(r),
          }))}
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
        <div className="sidebar-version">v0.1 – Prototyp</div>
      </div>
    </aside>
  );
}
